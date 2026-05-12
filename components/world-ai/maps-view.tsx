"use client"

import { useState, useRef } from "react"
import { cn } from "@/lib/utils"
import type { CampaignMap, MapHotspot } from "@/lib/world-ai/campaigns"
import { GreenestMap, RegionMap, KeepMap, PraxisMap } from "./map-svgs"

interface MapsViewProps {
  maps: CampaignMap[]
}

export function MapsView({ maps }: MapsViewProps) {
  const [currentMapIdx, setCurrentMapIdx] = useState(0)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [hoveredHotspot, setHoveredHotspot] = useState<MapHotspot | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)

  const currentMap = maps[currentMapIdx]

  const handleZoom = (factor: number) => {
    setZoomLevel(prev => Math.max(0.5, Math.min(3, prev * factor)))
  }

  const handleReset = () => {
    setZoomLevel(1)
  }

  // Render the appropriate SVG map based on map ID
  const renderMapSvg = () => {
    const props = {
      hotspots: currentMap.hotspots,
      onHotspotHover: setHoveredHotspot,
      className: "w-full h-full"
    }

    switch (currentMap.id) {
      case "greenest":
        return <GreenestMap {...props} />
      case "region":
        return <RegionMap {...props} />
      case "keep":
        return <KeepMap {...props} />
      case "praxis":
        return <PraxisMap {...props} />
      default:
        return <GreenestMap {...props} />
    }
  }

  return (
    <div className="py-3.5 flex flex-col h-full">
      {/* Map tabs */}
      <div className="flex gap-1.5 pb-2.5 flex-shrink-0 flex-wrap">
        {maps.map((map, idx) => (
          <button
            key={map.id}
            onClick={() => {
              setCurrentMapIdx(idx)
              setZoomLevel(1)
              setHoveredHotspot(null)
            }}
            className={cn(
              "bg-[#1f1c16] border rounded px-3 py-1 text-[11px] font-serif tracking-wide transition-all",
              idx === currentMapIdx
                ? "bg-[rgba(212,177,90,0.15)] border-[#d4b15a] text-[#ffd97a]"
                : "border-[#3a3328] text-[#8a8070] hover:text-[#d4b15a] hover:border-[#d4b15a]"
            )}
          >
            {map.name}
          </button>
        ))}
      </div>

      {/* Map stage */}
      <div className="flex-1 relative bg-[#15130f] border border-[#3a3328] rounded overflow-hidden">
        {/* Map canvas */}
        <div
          ref={mapRef}
          className="w-full h-full transition-transform duration-400 ease-out origin-center"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          {renderMapSvg()}
        </div>

        {/* Hotspot info tooltip */}
        <div 
          className={cn(
            "absolute bottom-3 left-3 bg-[rgba(10,9,8,0.92)] border border-[#d4b15a] rounded p-2.5 max-w-[320px] text-xs leading-relaxed pointer-events-none backdrop-blur transition-opacity duration-200",
            hoveredHotspot ? "opacity-100" : "opacity-0"
          )}
        >
          {hoveredHotspot && (
            <>
              <h4 className="font-serif text-[#d4b15a] text-[13px] mb-1">{hoveredHotspot.name}</h4>
              <p className="text-[#e0d8c8]">{hoveredHotspot.text}</p>
            </>
          )}
        </div>

        {/* Map controls */}
        <div className="absolute top-3 right-3 flex flex-col gap-1">
          <button
            onClick={() => handleZoom(1.3)}
            className="w-8 h-8 bg-[rgba(10,9,8,0.85)] border border-[#3a3328] text-[#d4b15a] text-base rounded hover:border-[#d4b15a] hover:bg-[rgba(212,177,90,0.15)] transition-all"
          >
            +
          </button>
          <button
            onClick={() => handleZoom(0.77)}
            className="w-8 h-8 bg-[rgba(10,9,8,0.85)] border border-[#3a3328] text-[#d4b15a] text-base rounded hover:border-[#d4b15a] hover:bg-[rgba(212,177,90,0.15)] transition-all"
          >
            −
          </button>
          <button
            onClick={handleReset}
            title="Reset"
            className="w-8 h-8 bg-[rgba(10,9,8,0.85)] border border-[#3a3328] text-[#d4b15a] text-base rounded hover:border-[#d4b15a] hover:bg-[rgba(212,177,90,0.15)] transition-all"
          >
            ⌂
          </button>
        </div>
      </div>
    </div>
  )
}
