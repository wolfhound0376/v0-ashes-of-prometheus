"use client"

// /map — view switcher between the 2D painted map and the 3D diorama.
// Both views read the same travel graph; they are two windows on one truth.

import { useEffect, useState } from "react"
import Link from "next/link"
import MapStage from "./map-stage"
import UnderdarkMap3D from "./underdark-map-3d"
import { clearDmKey, hasDmKey, onDmKeyChange, setDmKey } from "@/lib/dm-key"

export default function MapShell() {
  const [mode, setMode] = useState<"2d" | "3d">("2d")
  const [dm, setDm] = useState(false)
  useEffect(() => {
    setDm(hasDmKey())
    return onDmKeyChange(() => setDm(hasDmKey()))
  }, [])
  const btn = (active: boolean) =>
    `text-xs px-3 py-2 rounded border-2 font-mono tracking-wider ${
      active
        ? "bg-[#f5c34d] text-[#120b1e] border-[#f5c34d]"
        : "bg-[#221936] text-[#9a8fb0] border-[#3a2c56] hover:border-[#f5c34d]"
    }`
  return (
    <div className="bg-[#0b0714] h-screen overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3 max-w-[1360px] mx-auto">
        <Link
          href="/"
          className="text-xs px-3 py-2 rounded border-2 font-mono tracking-wider bg-[#221936] text-[#e1d0a8] border-[#6b5123] hover:border-[#c99a49]"
        >
          ← DASHBOARD
        </Link>
        <span className="flex-1" />
        <button className={btn(mode === "2d")} onClick={() => setMode("2d")}>
          2D MAP
        </button>
        <button className={btn(mode === "3d")} onClick={() => setMode("3d")}>
          3D DIORAMA
        </button>
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
      {mode === "2d" ? (
        // The full-page 2D component crashes the renderer outright (see
        // fix/map-page-use-stable-renderer). Until that is understood, /map
        // uses the same stable renderer the dashboard stage uses.
        <div className="relative mx-3 mt-2" style={{ height: "calc(100vh - 90px)" }}>
          <MapStage />
        </div>
      ) : (
        <UnderdarkMap3D />
      )}
    </div>
  )
}
