"use client"

// One map window, two layers, a toggle between them.
//
//   REGION   the Underdark travel map — where the party is in the world.
//            MapStage's cheap renderer, the same one the stage already uses.
//   LOCATION the subnodal node map — the inside of the place they are standing
//            in. Served from /subnodal-map.html, which resolves the party's
//            position itself and redacts everything they have not earned.
//
// Both layers are player-safe on their own: the region map reads the
// travel_nodes_player view, the node map goes through player_subnodal_map_here.
// Neither is handed a DM key, so this component can live anywhere a player can
// reach — the character stage or the Maps tab.

import { useState } from "react"
import Link from "next/link"
import MapStage from "./map-stage"

export type MapLayer = "region" | "location"

export default function MapPanel({
  onBack,
  initial = "location",
}: {
  onBack?: () => void
  initial?: MapLayer
}) {
  const [layer, setLayer] = useState<MapLayer>(initial)
  const tab = (active: boolean) =>
    `px-2 py-1 rounded text-[9px] uppercase tracking-wider transition-colors ${
      active ? "bg-[#8b6427] text-white" : "text-[#b7a47d] hover:text-[#e1d0a8]"
    }`

  return (
    <div className="absolute inset-0 z-10 bg-[#0b0714]">
      {layer === "region" ? <MapStage onBack={onBack} /> : <LocationLayer onBack={onBack} />}

      {/* The switch floats clear of either layer's own toolbar. */}
      <div className="absolute left-1/2 top-9 z-30 flex -translate-x-1/2 gap-1 rounded border border-[#6b5123] bg-[#080705]/90 p-1">
        <button type="button" className={tab(layer === "region")} onClick={() => setLayer("region")}>
          Region
        </button>
        <button type="button" className={tab(layer === "location")} onClick={() => setLayer("location")}>
          This Location
        </button>
      </div>
    </div>
  )
}

function LocationLayer({ onBack }: { onBack?: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col bg-[#0b0714]">
      <div className="flex items-center justify-between gap-2 border-b border-[#4b3a19] bg-[#080705]/90 px-2 py-1">
        {onBack ? (
          <button
            onClick={onBack}
            className="rounded border border-[#6b5123] px-2 py-1 text-[9px] uppercase tracking-wider text-[#e1d0a8] hover:border-[#c99a49]"
          >
            ← Character View
          </button>
        ) : (
          <span />
        )}
        <span />
        <Link
          href="/subnodal-map.html"
          target="_blank"
          className="rounded border border-[#6b5123] px-2 py-1 text-[9px] uppercase tracking-wider text-[#e1d0a8] hover:border-[#c99a49]"
        >
          Full map ↗
        </Link>
      </div>
      <iframe
        src="/subnodal-map.html?embed=1"
        title="Tactical node map"
        className="min-h-0 w-full flex-1 border-0"
      />
    </div>
  )
}
