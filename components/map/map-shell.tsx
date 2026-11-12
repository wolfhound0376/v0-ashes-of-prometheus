"use client"

// /map — the travel map. The Map Module (Sam's "Underdark World Map" artifact, 2026-11-10) is the map everyone
// gets.
//
// NO CHROME ABOVE THE MAP (Sam, 2026-11-12): "For players, take away dashboard button. Take away the buttons
// (map, old map, malachar on, etc). Player and DM view doesn't need to be on. It'll be obvious. If I am in DM
// mode you can have a DM mode light on the right. Don't need directions info." So the bar that held
// ← DASHBOARD, MAP / OLD 2D / OLD 3D and the MALACHAR code button is gone for everyone. The DM-mode light lives
// inside the map page (public/underdark-map, scripts/underdark-map/game_mode.py), top right, DM only. The DM
// code is entered at the front door, as everywhere else. The old 2D map and the diorama files stay in the repo
// (underdark-map.tsx, underdark-map-3d.tsx) but nothing opens them from here any more.

import { useEffect, useState } from "react"
import UnderdarkMapModule from "./underdark-map-module"
import { parseWalkHandoff, type WalkArrival } from "@/lib/travel/handoff"

export default function MapShell() {
  // The party just walked out of Velkynvelve: the walk page sends them here with the way out in the query string
  // (lib/travel/handoff.ts). Read from the window, not useSearchParams, so the page still prerenders.
  const [arrival, setArrival] = useState<WalkArrival | null>(null)
  useEffect(() => {
    try { setArrival(parseWalkHandoff(window.location.search)) } catch { setArrival(null) }
  }, [])
  return (
    <div className="bg-[#0b0714] h-screen overflow-hidden">
      {arrival && (
        <div className="flex items-center gap-3 px-3 pt-2 max-w-[1360px] mx-auto text-xs font-mono tracking-wider text-[#e1d0a8]">
          <span className="px-2 py-1 rounded border border-[#6b5123] bg-[#221936]">OUT OF VELKYNVELVE</span>
          <span className="text-[#9a8fb0]">{arrival.name}. The road from here is the map’s.</span>
          <button className="text-[#9a8fb0] hover:text-[#f5c34d]" onClick={() => setArrival(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
      <UnderdarkMapModule />
    </div>
  )
}
