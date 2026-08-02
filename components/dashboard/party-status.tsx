"use client"

// Party Status row from the v3.0 design: one card per player character with
// portrait, name, HP, gold and level. Reads the same `characters` rows the rest
// of the dashboard uses, so it updates over realtime with everything else.
//
// Clicking a card spotlights that character (DM view); the active browser's own
// character is marked with a gold frame.

import { Coins, Heart, User2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { characterVisualState, VISUAL_STATE_FILTER } from "@/lib/character-visual-state"

export interface PartyMember {
  id: string
  name: string
  level: number
  hp_current: number
  hp_max: number
  avatar_image_url: string | null
  conditions?: string[] | null
  gold?: number
}

interface PartyStatusProps {
  members: PartyMember[]
  selectedCharacterId: string | null
  onSelect?: (id: string) => void
  onViewAll?: () => void
}

export function PartyStatus({ members, selectedCharacterId, onSelect, onViewAll }: PartyStatusProps) {
  return (
    <FantasyPanel title="Party Status" className="flex-shrink-0">
      <div className="p-2">
        {members.length === 0 ? (
          <div className="py-6 text-center text-sm italic text-stone-600">No adventurers seated yet</div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {members.map((m) => {
              const isSelf = m.id === selectedCharacterId
              const hpPct = m.hp_max > 0 ? Math.max(0, Math.min(100, (m.hp_current / m.hp_max) * 100)) : 0
              const state = characterVisualState({
                hp_current: m.hp_current,
                hp_max: m.hp_max,
                conditions: m.conditions,
              })
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelect?.(m.id)}
                  className={cn(
                    "group w-[104px] flex-shrink-0 rounded-[3px] border bg-[#0f0c09] p-1.5 text-center transition-colors",
                    isSelf
                      ? "border-[#c9a868]/80 shadow-[0_0_12px_rgba(201,168,104,0.22)]"
                      : "border-[#7a5f33]/45 hover:border-[#c9a868]/60",
                  )}
                >
                  {/* Portrait */}
                  <div className="relative mx-auto mb-1 h-[72px] w-full overflow-hidden rounded-[2px] border border-[#3d3428] bg-[#0a0908]">
                    {m.avatar_image_url ? (
                      <img
                        src={m.avatar_image_url}
                        alt={m.name}
                        className="h-full w-full object-cover transition-[filter] duration-700"
                        style={{ filter: VISUAL_STATE_FILTER[state] }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <User2 className="h-7 w-7 text-[#4a4238]" />
                      </div>
                    )}
                    {state === "downed" && (
                      <div className="absolute inset-x-0 bottom-0 bg-black/70 text-[8px] font-bold uppercase tracking-[0.2em] text-red-300">
                        Downed
                      </div>
                    )}
                  </div>

                  <div className="truncate font-serif text-[12px] text-[#e0cfa0]">{m.name}</div>

                  {/* HP + gold */}
                  <div className="mt-0.5 flex items-center justify-center gap-2 text-[10px]">
                    <span className="flex items-center gap-0.5 text-red-300">
                      <Heart className="h-2.5 w-2.5 fill-current" />
                      {m.hp_current}/{m.hp_max}
                    </span>
                    {m.gold !== undefined && (
                      <span className="flex items-center gap-0.5 text-[#d4b15a]">
                        <Coins className="h-2.5 w-2.5" />
                        {m.gold}
                      </span>
                    )}
                  </div>

                  {/* HP bar + level */}
                  <div className="mt-1 flex items-center gap-1.5">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#2a1a1a]">
                      <div
                        className={cn(
                          "h-full transition-all duration-500",
                          hpPct > 50 ? "bg-emerald-500" : hpPct > 25 ? "bg-amber-500" : "bg-red-500",
                        )}
                        style={{ width: `${hpPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-stone-500">{m.level}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="mt-2 w-full rounded-[3px] border border-[#7a5f33]/50 bg-[#120e0a] py-1.5 text-[11px] text-stone-400 transition-colors hover:border-[#c9a868]/60 hover:text-[#e0cfa0]"
          >
            View All Characters
          </button>
        )}
      </div>
    </FantasyPanel>
  )
}
