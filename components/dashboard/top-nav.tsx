"use client"

// Top command bar from the v3.0 design: the sigil + wordmark on the left with
// session/level context, and the campaign sections on the right
// (The Forge · Journal · Quests · Maps · NPCs · Lore) plus settings.
//
// The Forge navigates to the real /forge route. Sections that don't have a
// destination yet call onSection so the dashboard can open the matching panel
// (or show a "coming in a later round" note) rather than dead-ending.

import Link from "next/link"
import { BookOpen, Flame, Map, ScrollText, Settings, Sparkles, Users } from "lucide-react"
import { cn } from "@/lib/utils"

export type NavSection = "journal" | "quests" | "maps" | "npcs" | "lore" | "settings"

interface TopNavProps {
  sessionNumber?: number
  level?: number
  campaignName?: string
  onSection?: (section: NavSection) => void
  activeSection?: NavSection | null
}

const SECTIONS: { id: NavSection; label: string; icon: typeof BookOpen }[] = [
  { id: "journal", label: "Journal", icon: BookOpen },
  { id: "quests", label: "Quests", icon: Users },
  { id: "maps", label: "Maps", icon: Map },
  { id: "npcs", label: "NPCs", icon: Users },
  { id: "lore", label: "Lore", icon: ScrollText },
]

export function TopNav({
  sessionNumber = 1,
  level = 1,
  campaignName = "Campaign Overview",
  onSection,
  activeSection = null,
}: TopNavProps) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-[#7a5f33]/50 bg-gradient-to-b from-[#14100b] to-[#0b0907] px-4 py-2">
      {/* Wordmark */}
      <div className="flex items-center gap-3">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[#c9a868]/60 bg-[#1a1410] shadow-[0_0_14px_rgba(201,168,104,0.25)]">
          <Flame className="h-4.5 w-4.5 text-[#e0a355]" />
        </div>
        <div className="leading-tight">
          <h1 className="font-serif text-lg tracking-[0.08em] text-[#e8dcc0]">Ashes of Prometheus</h1>
          <div className="flex items-center gap-2 text-[11px] text-stone-500">
            <span>Session {sessionNumber}</span>
            <span className="text-[#7a5f33]">•</span>
            <span>Level {level}</span>
            <span className="rounded-sm border border-[#7a5f33]/50 bg-[#171208] px-1.5 py-px text-[10px] text-[#c9b896]">
              {campaignName}
            </span>
          </div>
        </div>
      </div>

      {/* Sections */}
      <nav className="flex items-center gap-1.5">
        <Link
          href="/forge"
          className="flex items-center gap-1.5 rounded-[3px] border border-[#c9a868]/70 bg-gradient-to-b from-[#241a10] to-[#160f09] px-3 py-1.5 text-xs text-[#e0cfa0] shadow-[0_0_12px_rgba(201,168,104,0.18)] transition-colors hover:border-[#e0cfa0] hover:text-white"
        >
          <Sparkles className="h-3.5 w-3.5" />
          The Forge
        </Link>

        {SECTIONS.map((s) => {
          const Icon = s.icon
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSection?.(s.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-[3px] border px-3 py-1.5 text-xs transition-colors",
                activeSection === s.id
                  ? "border-[#c9a868]/70 bg-[#1f1710] text-[#e0cfa0]"
                  : "border-[#7a5f33]/50 bg-[#120e0a] text-stone-400 hover:border-[#c9a868]/60 hover:text-[#e0cfa0]",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => onSection?.("settings")}
          aria-label="Settings"
          className="ml-1 rounded-[3px] border border-[#7a5f33]/50 bg-[#120e0a] p-2 text-stone-400 transition-colors hover:border-[#c9a868]/60 hover:text-[#e0cfa0]"
        >
          <Settings className="h-4 w-4" />
        </button>
      </nav>
    </header>
  )
}
