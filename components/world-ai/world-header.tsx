"use client"

import { cn } from "@/lib/utils"
import type { ViewType } from "@/app/world-ai/page"

interface WorldHeaderProps {
  campaignName: string
  campaignSubtitle: string
  activeView: ViewType
  onViewChange: (view: ViewType) => void
}

export function WorldHeader({ campaignName, campaignSubtitle, activeView, onViewChange }: WorldHeaderProps) {
  const tabs: { id: ViewType; label: string }[] = [
    { id: "chat", label: "CHAT" },
    { id: "maps", label: "MAPS" },
    { id: "lore", label: "LORE" },
    { id: "library", label: "LIBRARY" }
  ]

  return (
    <header className="py-3 border-b border-[#3a3328] flex-shrink-0 flex items-center gap-4 flex-wrap">
      {/* Brand */}
      <div className="flex items-center gap-2">
        {/* Ember pulse */}
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e0651a] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#e0651a] shadow-[0_0_8px_#e0651a]" />
        </span>
        <span 
          className="font-serif text-base font-bold tracking-[0.14em] text-[#d4b15a]"
          style={{ textShadow: "0 0 12px rgba(212,177,90,0.3)" }}
        >
          {campaignName.toUpperCase()}
        </span>
      </div>

      {/* Campaign pill */}
      <button
        onClick={() => onViewChange("library")}
        className="bg-[#1f1c16] border border-[#3a3328] rounded-full px-3 py-1 text-[11px] text-[#d4b15a] tracking-wide hover:border-[#d4b15a] hover:bg-[rgba(212,177,90,0.08)] transition-all"
      >
        ◆ {campaignSubtitle}
      </button>

      {/* View tabs */}
      <nav className="flex gap-1 ml-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onViewChange(tab.id)}
            className={cn(
              "px-3 py-1.5 text-[11px] tracking-[0.1em] border-b-2 transition-all font-mono",
              activeView === tab.id
                ? "text-[#d4b15a] border-[#e0651a]"
                : "text-[#8a8070] border-transparent hover:text-[#e0d8c8]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  )
}
