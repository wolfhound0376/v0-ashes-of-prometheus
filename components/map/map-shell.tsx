"use client"

// /map — the travel map. The Map Module (Sam's "Underdark World Map" artifact, 2026-11-10) is the map everyone
// gets. The older 2D painted map and the 3D diorama stay one click away for the DM only, until the Map Module
// has been played through. All three read the same travel graph; they are windows on one truth.

import { useEffect, useState } from "react"
import { StageLink } from "@/components/stage/stage-provider"
import UnderdarkMap from "./underdark-map"
import UnderdarkMap3D from "./underdark-map-3d"
import UnderdarkMapModule from "./underdark-map-module"
import { clearDmKey, hasDmKey, onDmKeyChange, setDmKey } from "@/lib/dm-key"
import { parseWalkHandoff, type WalkArrival } from "@/lib/travel/handoff"

export default function MapShell() {
  // The Map Module is the travel map. A new storage key on purpose: a browser that once picked 2D or the diorama
  // starts on the Map Module too. Only the DM can switch, so a player's stored choice is never read.
  type Mode = "module" | "2d" | "3d"
  const [mode, setModeState] = useState<Mode>("module")
  const setMode = (m: Mode) => {
    setModeState(m)
    try { localStorage.setItem("aop:map-view", m) } catch {}
  }
  const [dm, setDm] = useState(false)
  // The party just walked out of Velkynvelve: the walk page sends them here with the way out in the query string
  // (lib/travel/handoff.ts). Read from the window, not useSearchParams, so the page still prerenders.
  const [arrival, setArrival] = useState<WalkArrival | null>(null)
  useEffect(() => {
    setDm(hasDmKey())
    try {
      const v = localStorage.getItem("aop:map-view")
      if (hasDmKey() && (v === "2d" || v === "3d")) setModeState(v)
    } catch {}
    try { setArrival(parseWalkHandoff(window.location.search)) } catch { setArrival(null) }
    return onDmKeyChange(() => setDm(hasDmKey()))
  }, [])
  // a player never sees the old maps, whatever this browser stored while it held the DM code
  const view: Mode = dm ? mode : "module"
  const btn = (active: boolean) =>
    `text-xs px-3 py-2 rounded border-2 font-mono tracking-wider ${
      active
        ? "bg-[#f5c34d] text-[#120b1e] border-[#f5c34d]"
        : "bg-[#221936] text-[#9a8fb0] border-[#3a2c56] hover:border-[#f5c34d]"
    }`
  return (
    <div className="bg-[#0b0714] h-screen overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3 max-w-[1360px] mx-auto">
        <StageLink
          href="/"
          className="text-xs px-3 py-2 rounded border-2 font-mono tracking-wider bg-[#221936] text-[#e1d0a8] border-[#6b5123] hover:border-[#c99a49]"
        >
          ← DASHBOARD
        </StageLink>
        <span className="flex-1" />
        {dm && (
          <>
            <button className={btn(view === "module")} onClick={() => setMode("module")}>
              MAP
            </button>
            <button className={btn(view === "2d")} onClick={() => setMode("2d")}>
              OLD 2D
            </button>
            <button className={btn(view === "3d")} onClick={() => setMode("3d")}>
              OLD 3D
            </button>
          </>
        )}
        <button
          className={`text-xs px-3 py-2 rounded border-2 font-mono tracking-wider ${
            dm
              ? "bg-[#b44df5] text-white border-[#b44df5]"
              : "bg-[#221936] text-[#9a8fb0] border-[#3a2c56] hover:border-[#b44df5]"
          }`}
          onClick={() => {
            if (hasDmKey()) {
              clearDmKey()
            } else {
              const code = window.prompt("Speak the Dungeon Master's code:")
              if (code) setDmKey(code)
            }
          }}
        >
          {dm ? "MALACHAR \u2726 ON" : "MALACHAR"}
        </button>
      </div>
      {arrival && (
        <div className="flex items-center gap-3 px-3 pt-2 max-w-[1360px] mx-auto text-xs font-mono tracking-wider text-[#e1d0a8]">
          <span className="px-2 py-1 rounded border border-[#6b5123] bg-[#221936]">OUT OF VELKYNVELVE</span>
          <span className="text-[#9a8fb0]">{arrival.name}. The road from here is the map’s.</span>
          <button className="text-[#9a8fb0] hover:text-[#f5c34d]" onClick={() => setArrival(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
      {view === "2d" ? <UnderdarkMap /> : view === "3d" ? <UnderdarkMap3D /> : <UnderdarkMapModule />}
    </div>
  )
}
