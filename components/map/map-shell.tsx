"use client"

// /map — view switcher between the 2D painted map and the 3D diorama.
// Both views read the same travel graph; they are two windows on one truth.

import { useState } from "react"
import UnderdarkMap from "./underdark-map"
import UnderdarkMap3D from "./underdark-map-3d"

export default function MapShell() {
  const [mode, setMode] = useState<"2d" | "3d">("2d")
  const btn = (active: boolean) =>
    `text-xs px-3 py-2 rounded border-2 font-mono tracking-wider ${
      active
        ? "bg-[#f5c34d] text-[#120b1e] border-[#f5c34d]"
        : "bg-[#221936] text-[#9a8fb0] border-[#3a2c56] hover:border-[#f5c34d]"
    }`
  return (
    <div className="bg-[#0b0714] min-h-screen">
      <div className="flex gap-2 justify-end px-3 pt-3 max-w-[1360px] mx-auto">
        <button className={btn(mode === "2d")} onClick={() => setMode("2d")}>
          2D MAP
        </button>
        <button className={btn(mode === "3d")} onClick={() => setMode("3d")}>
          3D DIORAMA
        </button>
      </div>
      {mode === "2d" ? <UnderdarkMap /> : <UnderdarkMap3D />}
    </div>
  )
}
