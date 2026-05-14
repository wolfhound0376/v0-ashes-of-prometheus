"use client"

import { useState } from "react"
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { quickAbilities, getClassSpellcasting } from "@/lib/game-data"
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
  iconUrl?: string | null
  type: "action" | "bonus" | "reaction"
  hasSubmenu?: boolean
}

// Cunning Action sub-options (D&D 5E: Rogues can Dash, Disengage, or Hide as a bonus action)
const cunningActionOptions = [
  { id: "cunning-dash", name: "Dash", description: "Double movement as bonus action", iconUrl: "/icons/actions/dash.png" },
  { id: "cunning-disengage", name: "Disengage", description: "Avoid opportunity attacks", iconUrl: "/icons/actions/disengage.png" },
  { id: "cunning-hide", name: "Hide", description: "Make a Stealth check to hide", iconUrl: "/icons/actions/hide.png" },
]

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
  characterClass?: string
  characterLevel?: number
  availableActionIds?: string[]
  onTelemetryPush?: (event: string, data: Record<string, unknown>) => void
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

// Action type color configuration matching D&D 5E conventions
const actionTypeColors = {
  action: {
    border: "border-[#4a8a4a]/60",
    bg: "bg-[#1a2a1a]/40",
    text: "text-[#7ac87a]",
    label: "Action",
    labelBg: "bg-[#2a4a2a]",
  },
  bonus: {
    border: "border-[#8a7a3a]/60",
    bg: "bg-[#2a2a1a]/40",
    text: "text-[#d4b454]",
    label: "Bonus",
    labelBg: "bg-[#4a4a2a]",
  },
  reaction: {
    border: "border-[#7a4a8a]/60",
    bg: "bg-[#2a1a2a]/40",
    text: "text-[#b87ac8]",
    label: "Reaction",
    labelBg: "bg-[#3a2a4a]",
  },
}

export function CenterColumn({ selectedAction, onActionSelect, actions, resources, characterClass, characterLevel }: CenterColumnProps) {
  // Check if character can cast spells based on D&D 5E rules
  const spellcasting = getClassSpellcasting(characterClass || "", characterLevel || 1)
  
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
            {/* Actions list grouped by type */}
            <div className="flex-1 p-2 space-y-3">
              {/* Standard Actions */}
              {actions.filter(a => a.type === "action").length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className={cn("text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded", actionTypeColors.action.labelBg, actionTypeColors.action.text)}>
                      Actions
                    </span>
                    <div className="flex-1 h-px bg-[#4a8a4a]/30" />
                  </div>
                  <div className="space-y-1">
                    {actions.filter(a => a.type === "action").map((action) => (
                      <ActionButton key={action.id} action={action} isSelected={selectedAction === action.id} onSelect={onActionSelect} />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Bonus Actions */}
              {actions.filter(a => a.type === "bonus").length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className={cn("text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded", actionTypeColors.bonus.labelBg, actionTypeColors.bonus.text)}>
                      Bonus Actions
                    </span>
                    <div className="flex-1 h-px bg-[#8a7a3a]/30" />
                  </div>
                  <div className="space-y-1">
                    {actions.filter(a => a.type === "bonus").map((action) => (
                      <ActionButton key={action.id} action={action} isSelected={selectedAction === action.id} onSelect={onActionSelect} />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Reactions */}
              {actions.filter(a => a.type === "reaction").length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className={cn("text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded", actionTypeColors.reaction.labelBg, actionTypeColors.reaction.text)}>
                      Reactions
                    </span>
                    <div className="flex-1 h-px bg-[#7a4a8a]/30" />
                  </div>
                  <div className="space-y-1">
                    {actions.filter(a => a.type === "reaction").map((action) => (
                      <ActionButton key={action.id} action={action} isSelected={selectedAction === action.id} onSelect={onActionSelect} />
                    ))}
                  </div>
                </div>
              )}
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

      {/* Magical Resources - Only show for spellcasting classes */}
      {spellcasting.canCast && (
        <FantasyPanel title="Magical Resources & Abilities" className="flex-shrink-0">
          <div className="p-3">
            <div className="flex gap-2">
              {/* Spell Slots - for all casters */}
              <ResourceBox
                label="Spell Slots"
                current={resources.spellSlots}
                max={resources.maxSpellSlots}
                color="purple"
              />
              {/* Sorcery Points - only for Sorcerers */}
              {spellcasting.hasSorceryPoints && (
                <ResourceBox
                  label="Sorcery Points"
                  current={resources.sorceryPoints}
                  max={resources.maxSorceryPoints}
                  color="pink"
                />
              )}
              {/* Pact Slots/Arcane Charges - only for Warlocks */}
              {spellcasting.hasArcaneCharges && (
                <ResourceBox
                  label="Pact Slots"
                  current={resources.arcaneCharges}
                  max={resources.maxArcaneCharges}
                  color="blue"
                />
              )}
              {/* Spellbook - only for Wizards */}
              {spellcasting.hasSpellbook && (
                <button className="flex-1 flex flex-col items-center justify-center gap-1 p-2 rounded-sm bg-[#1a1614] border border-[#3d3428]/60 hover:border-[#5a4a3a]/80 transition-colors group">
                  <BookOpen className="w-6 h-6 text-[#8b7355] group-hover:text-[#c9b896] transition-colors" />
                  <span className="text-[10px] uppercase tracking-wider text-[#8b7355] group-hover:text-[#c9b896]">
                    Spellbook
                  </span>
                </button>
              )}
            </div>
          </div>
        </FantasyPanel>
      )}

      {/* Quick Abilities - Only show for spellcasting classes */}
      {spellcasting.canCast && (
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
                        "w-full h-full bg-gradient-to-br overflow-hidden",
                        ability.unlocked 
                          ? "from-[#1a2a35] to-[#0f1a20]" 
                          : "from-[#1a1614] to-[#0d0b0a]"
                      )}>
                        {ability.iconUrl ? (
                          <img 
                            src={ability.iconUrl} 
                            alt={ability.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <IconComponent className="w-full h-full p-1" />
                        )}
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
      )}
    </div>
  )
}

function ActionButton({ action, isSelected, onSelect }: { action: Action; isSelected: boolean; onSelect: (id: string) => void }) {
  const [showSubmenu, setShowSubmenu] = useState(false)
  const IconComponent = actionIconMap[action.id] || SpellbookIcon
  const typeColors = actionTypeColors[action.type]
  
  // Dark red border for bonus actions
  const bonusBorderClass = action.type === "bonus" ? "ring-2 ring-[#8a2a2a]/60" : ""
  
  const handleClick = () => {
    if (action.hasSubmenu) {
      setShowSubmenu(!showSubmenu)
    } else {
      onSelect(action.id)
    }
  }
  
  return (
    <div className="relative">
      <button
        onClick={handleClick}
        className={cn(
          "w-full flex items-center gap-3 p-2 rounded-sm transition-all text-left border",
          "hover:bg-[#2a2420]/60 group",
          isSelected 
            ? cn(typeColors.bg, typeColors.border, "shadow-[0_0_10px_rgba(100,150,100,0.15)]")
            : "border-transparent"
        )}
      >
        <IconFrame 
          className={cn("w-10 h-10 flex-shrink-0", bonusBorderClass)} 
          selected={isSelected}
        >
          {action.iconUrl ? (
            <img src={action.iconUrl} alt={action.name} className="w-full h-full object-cover" />
          ) : (
            <IconComponent className="w-full h-full" />
          )}
        </IconFrame>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm font-medium",
              isSelected ? typeColors.text : "text-stone-200 group-hover:text-white"
            )}
          >
            {action.name}
          </p>
          <p className="text-xs text-stone-500 truncate">{action.description}</p>
        </div>
        {/* Submenu indicator for Cunning Action */}
        {action.hasSubmenu && (
          <span className="text-stone-500 text-xs mr-1">{showSubmenu ? "▼" : "▶"}</span>
        )}
        {/* Type indicator dot */}
        <div className={cn(
          "w-2 h-2 rounded-full flex-shrink-0",
          action.type === "action" && "bg-[#4a8a4a]",
          action.type === "bonus" && "bg-[#8a7a3a]",
          action.type === "reaction" && "bg-[#7a4a8a]"
        )} />
      </button>
      
      {/* Cunning Action Submenu */}
      {action.hasSubmenu && showSubmenu && (
        <div className="ml-4 mt-1 p-2 bg-[#1a1614] border border-[#8a2a2a]/60 rounded-sm shadow-lg">
          <p className="text-[10px] uppercase tracking-wider text-[#8a2a2a] mb-2 px-1">Choose Action</p>
          <div className="flex gap-2">
            {cunningActionOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => {
                  onSelect(option.id)
                  setShowSubmenu(false)
                }}
                className="flex flex-col items-center gap-1 p-1 rounded-sm hover:bg-[#2a2420]/60 transition-all group"
              >
                <div className="w-12 h-12 rounded-md overflow-hidden border-2 border-[#8a2a2a] shadow-[0_0_8px_rgba(138,42,42,0.4)]">
                  <img 
                    src={option.iconUrl} 
                    alt={option.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-[9px] text-stone-400 group-hover:text-white text-center leading-tight">
                  {option.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
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
