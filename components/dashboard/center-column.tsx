"use client"

import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { quickAbilities } from "@/lib/game-data"
import {
  SpellbookIcon,
  AbilityIcon,
  DashIcon,
  DisengageIcon,
  HelpIcon,
  ReadyIcon,
  SearchIcon,
  RitualIcon,
  MageHandIcon,
  FireBoltIcon,
  ShieldSpellIcon,
  MagicMissileIcon,
  DetectMagicIcon,
  LockedAbilityIcon,
  IconFrame,
} from "@/components/ui/fantasy-icons"
import { BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"

interface Action {
  id: string
  name: string
  description: string
  icon: string
}

interface Resources {
  action: number
  bonusAction: number
  reaction: number
  spellSlots: number
  maxSpellSlots: number
  sorceryPoints: number
  maxSorceryPoints: number
  arcaneCharges: number
  maxArcaneCharges: number
}

interface CenterColumnProps {
  selectedAction: string | null
  onActionSelect: (actionId: string) => void
  actions: Action[]
  resources: Resources
}

const actionIconMap: Record<string, React.FC<{ className?: string }>> = {
  "cast-spell": SpellbookIcon,
  "use-ability": AbilityIcon,
  dash: DashIcon,
  disengage: DisengageIcon,
  help: HelpIcon,
  ready: ReadyIcon,
  search: SearchIcon,
  "cast-ritual": RitualIcon,
}

const quickAbilityIconMap: Record<string, React.FC<{ className?: string }>> = {
  "mage-hand": MageHandIcon,
  "fire-bolt": FireBoltIcon,
  shield: ShieldSpellIcon,
  "magic-missile": MagicMissileIcon,
  "detect-magic": DetectMagicIcon,
  locked: LockedAbilityIcon,
}

export function CenterColumn({ selectedAction, onActionSelect, actions, resources }: CenterColumnProps) {
  return (
    <div className="flex flex-col gap-2 h-full overflow-hidden">
      <FantasyPanel title="NPC / Monster Interactions" className="flex-shrink-0">
        <div className="h-[100px] flex items-center justify-center">
          {selectedAction ? (
            <div className="text-center">
              <p className="text-[#7aa8c8] font-serif text-lg">
                {actions.find((a) => a.id === selectedAction)?.name}
              </p>
              <p className="text-stone-400 text-sm mt-1">
                {actions.find((a) => a.id === selectedAction)?.description}
              </p>
            </div>
          ) : (
            <p className="text-stone-500 italic text-sm">No one is interacting with you right now.</p>
          )}
        </div>
      </FantasyPanel>

      {/* Available Actions */}
      <FantasyPanel className="flex-1 min-h-0 flex flex-col">
        <div className="px-4 py-2 border-b border-[#3d3428]/60 flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-[0.2em] uppercase text-[#c9b896]">
            Available Actions
          </h3>
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider text-stone-500">Actions Remaining</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex">
            {/* Actions list */}
            <div className="flex-1 p-2 space-y-1">
              {actions.map((action) => {
                const IconComponent = actionIconMap[action.id] || SpellbookIcon
                const isSelected = selectedAction === action.id
                return (
                  <button
                    key={action.id}
                    onClick={() => onActionSelect(action.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-2 rounded-sm transition-all text-left",
                      "hover:bg-[#2a2420]/60 group",
                      isSelected && "bg-[#1a2a35]/80 border border-[#4a7a9a]/40 shadow-[0_0_10px_rgba(100,150,200,0.15)]"
                    )}
                  >
                    <IconFrame 
                      className="w-10 h-10 flex-shrink-0" 
                      selected={isSelected}
                    >
                      <IconComponent className="w-full h-full" />
                    </IconFrame>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm font-medium",
                          isSelected ? "text-[#7aa8c8]" : "text-stone-200 group-hover:text-white"
                        )}
                      >
                        {action.name}
                      </p>
                      <p className="text-xs text-stone-500 truncate">{action.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Actions remaining sidebar */}
            <div className="w-24 border-l border-[#3d3428]/40 p-3 flex flex-col gap-3">
              <ActionCounter label="Action" value={resources.action} type="action" />
              <ActionCounter label="Bonus Action" value={resources.bonusAction} type="bonus" />
              <ActionCounter label="Reaction" value={resources.reaction} type="reaction" />
            </div>
          </div>
        </div>

        <div className="px-3 py-1.5 border-t border-[#3d3428]/40">
          <p className="text-[10px] text-stone-500 italic">
            Actions available are based on your class, resources, and current situation.
          </p>
        </div>
      </FantasyPanel>

      {/* Magical Resources */}
      <FantasyPanel title="Magical Resources & Abilities" className="flex-shrink-0">
        <div className="p-3">
          <div className="flex gap-2">
            <ResourceBox
              label="Spell Slots"
              current={resources.spellSlots}
              max={resources.maxSpellSlots}
              color="purple"
            />
            <ResourceBox
              label="Sorcery Points"
              current={resources.sorceryPoints}
              max={resources.maxSorceryPoints}
              color="pink"
            />
            <ResourceBox
              label="Arcane Charges"
              current={resources.arcaneCharges}
              max={resources.maxArcaneCharges}
              color="blue"
            />
            <button className="flex-1 flex flex-col items-center justify-center gap-1 p-2 rounded-sm bg-[#1a1614] border border-[#3d3428]/60 hover:border-[#5a4a3a]/80 transition-colors group">
              <BookOpen className="w-6 h-6 text-[#8b7355] group-hover:text-[#c9b896] transition-colors" />
              <span className="text-[10px] uppercase tracking-wider text-[#8b7355] group-hover:text-[#c9b896]">
                Open Book
              </span>
            </button>
          </div>
        </div>
      </FantasyPanel>

      {/* Quick Abilities */}
      <FantasyPanel title="Quick Abilities" className="flex-shrink-0">
        <div className="p-3">
          <div className="flex gap-2 justify-center">
            {quickAbilities.map((ability) => {
              const IconComponent = quickAbilityIconMap[ability.icon] || LockedAbilityIcon
              return (
                <button
                  key={ability.id}
                  disabled={!ability.unlocked}
                  className={cn(
                    "flex flex-col items-center gap-1 p-1 rounded-sm transition-all",
                    ability.unlocked
                      ? "hover:bg-[#2a2420]/60 group cursor-pointer"
                      : "opacity-50 cursor-not-allowed"
                  )}
                >
                  <IconFrame 
                    className="w-14 h-14" 
                    disabled={!ability.unlocked}
                  >
                    <div className={cn(
                      "w-full h-full bg-gradient-to-br",
                      ability.unlocked 
                        ? "from-[#1a2a35] to-[#0f1a20]" 
                        : "from-[#1a1614] to-[#0d0b0a]"
                    )}>
                      <IconComponent className="w-full h-full p-1" />
                    </div>
                  </IconFrame>
                  <span
                    className={cn(
                      "text-[10px] text-center leading-tight",
                      ability.unlocked ? "text-stone-400" : "text-stone-600"
                    )}
                  >
                    {ability.name}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </FantasyPanel>
    </div>
  )
}

function ActionCounter({ label, value, type }: { label: string; value: number; type: "action" | "bonus" | "reaction" }) {
  const colorConfig = {
    action: {
      bg: "from-[#2a3a2a] to-[#1a251a]",
      border: "border-[#4a7a4a]/60",
      text: value > 0 ? "text-[#7ab87a]" : "text-stone-600",
      glow: "drop-shadow-[0_0_8px_rgba(100,180,100,0.5)]"
    },
    bonus: {
      bg: "from-[#3a2a1a] to-[#251a0f]",
      border: "border-[#8a6a3a]/60",
      text: value > 0 ? "text-[#d4a454]" : "text-stone-600",
      glow: "drop-shadow-[0_0_8px_rgba(200,150,80,0.5)]"
    },
    reaction: {
      bg: "from-[#2a2a3a] to-[#1a1a25]",
      border: "border-[#6a6a9a]/60",
      text: value > 0 ? "text-[#9a9ac8]" : "text-stone-600",
      glow: "drop-shadow-[0_0_8px_rgba(150,150,200,0.5)]"
    }
  }

  const config = colorConfig[type]

  return (
    <div className={cn(
      "text-center p-2 rounded-sm bg-gradient-to-br border",
      config.bg,
      config.border
    )}>
      <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">{label}</p>
      <div
        className={cn(
          "text-2xl font-serif font-bold",
          config.text,
          value > 0 && config.glow
        )}
      >
        {value}
      </div>
    </div>
  )
}

function ResourceBox({
  label,
  current,
  max,
  color,
}: {
  label: string
  current: number
  max: number
  color: "purple" | "pink" | "blue"
}) {
  const colorClasses = {
    purple: "from-[#2a1a35] to-[#1a0f20] border-[#6a4a8a]/40 text-[#a87ac8]",
    pink: "from-[#351a2a] to-[#200f1a] border-[#8a4a6a]/40 text-[#c87a9a]",
    blue: "from-[#1a2a35] to-[#0f1a20] border-[#4a7a9a]/40 text-[#7aa8c8]",
  }

  const dotColors = {
    purple: "bg-[#8a5aaa]",
    pink: "bg-[#aa5a8a]",
    blue: "bg-[#5a8aaa]",
  }

  return (
    <div
      className={cn(
        "flex-1 p-2 rounded-sm text-center",
        "bg-gradient-to-br border",
        colorClasses[color]
      )}
    >
      <p className="text-[9px] uppercase tracking-wider text-stone-500 mb-1">{label}</p>
      <div className="flex justify-center gap-1 mb-1">
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-2.5 h-2.5 rounded-full transition-all",
              i < current
                ? cn(dotColors[color], "shadow-[0_0_6px_rgba(150,100,200,0.6)]")
                : "bg-stone-700/50"
            )}
          />
        ))}
      </div>
      <p className="text-xs font-medium">
        {current} / {max}
      </p>
    </div>
  )
}
