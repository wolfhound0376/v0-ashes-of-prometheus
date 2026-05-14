"use client"

import { useState } from "react"
import { Sword, Wand2, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface Attack {
  id: string
  name: string
  attackBonus: number
  damage: string
  damageType: string
  range?: string
  properties?: string[]
  isEquipped?: boolean
}

interface Spell {
  id: string
  name: string
  level: number
  school: string
  castingTime: string
  range: string
  components: string
  duration: string
  description: string
}

interface SpellSlots {
  [level: number]: { used: number; max: number }
}

interface AttacksSpellcastingProps {
  attacks: Attack[]
  canCastSpells: boolean
  spellcastingAbility?: string
  spellSaveDC?: number
  spellAttackBonus?: number
  spells?: Spell[]
  spellSlots?: SpellSlots
}

// Damage type colors
const DAMAGE_TYPE_COLORS: Record<string, string> = {
  slashing: "text-red-400",
  piercing: "text-orange-400",
  bludgeoning: "text-amber-600",
  fire: "text-orange-500",
  cold: "text-cyan-400",
  lightning: "text-yellow-400",
  thunder: "text-purple-400",
  poison: "text-green-400",
  acid: "text-lime-400",
  necrotic: "text-violet-400",
  radiant: "text-yellow-200",
  force: "text-pink-400",
  psychic: "text-fuchsia-400",
}

export function AttacksSpellcasting({
  attacks,
  canCastSpells,
  spellcastingAbility,
  spellSaveDC,
  spellAttackBonus,
  spells = [],
  spellSlots = {}
}: AttacksSpellcastingProps) {
  const [activeTab, setActiveTab] = useState<"attacks" | "spells">("attacks")

  // Filter equipped weapons
  const equippedAttacks = attacks.filter(a => a.isEquipped !== false)

  return (
    <div className="h-full flex flex-col">
      {/* Tab Header */}
      <div className="flex border-b border-[#3d3428]/40">
        <button
          onClick={() => setActiveTab("attacks")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs uppercase tracking-wider transition-colors",
            activeTab === "attacks"
              ? "text-red-400 bg-[#3a2a2a]/30 border-b-2 border-red-400"
              : "text-stone-500 hover:text-stone-300"
          )}
        >
          <Sword className="w-3.5 h-3.5" />
          Attacks
        </button>
        {canCastSpells && (
          <button
            onClick={() => setActiveTab("spells")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs uppercase tracking-wider transition-colors",
              activeTab === "spells"
                ? "text-purple-400 bg-[#2a2a3a]/30 border-b-2 border-purple-400"
                : "text-stone-500 hover:text-stone-300"
            )}
          >
            <Wand2 className="w-3.5 h-3.5" />
            Spells
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === "attacks" ? (
          <div className="space-y-1.5">
            {equippedAttacks.length > 0 ? (
              equippedAttacks.map(attack => (
                <AttackRow key={attack.id} attack={attack} />
              ))
            ) : (
              <div className="text-center py-6 text-stone-500 text-sm italic">
                No weapons equipped
              </div>
            )}
            
            {/* Unarmed Strike - Always available */}
            <AttackRow 
              attack={{
                id: "unarmed",
                name: "Unarmed Strike",
                attackBonus: 0, // Would be calculated from STR
                damage: "1",
                damageType: "bludgeoning",
                properties: []
              }} 
            />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Spellcasting Stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-1.5 bg-[#2a2a3a]/30 border border-purple-500/20 rounded">
                <div className="text-xs text-stone-500 uppercase tracking-wider">Ability</div>
                <div className="text-sm font-medium text-purple-300">{spellcastingAbility || "—"}</div>
              </div>
              <div className="p-1.5 bg-[#2a2a3a]/30 border border-purple-500/20 rounded">
                <div className="text-xs text-stone-500 uppercase tracking-wider">Save DC</div>
                <div className="text-sm font-medium text-purple-300">{spellSaveDC || "—"}</div>
              </div>
              <div className="p-1.5 bg-[#2a2a3a]/30 border border-purple-500/20 rounded">
                <div className="text-xs text-stone-500 uppercase tracking-wider">Attack</div>
                <div className="text-sm font-medium text-purple-300">
                  {spellAttackBonus !== undefined ? `+${spellAttackBonus}` : "—"}
                </div>
              </div>
            </div>

            {/* Spell Slots */}
            {Object.keys(spellSlots).length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-stone-500">Spell Slots</div>
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(spellSlots).map(([level, slots]) => (
                    <div key={level} className="flex items-center gap-1 px-2 py-1 bg-[#1a1614] border border-[#3d3428]/40 rounded">
                      <span className="text-xs text-stone-400">Lv{level}</span>
                      <div className="flex gap-0.5">
                        {Array.from({ length: slots.max }).map((_, i) => (
                          <div
                            key={i}
                            className={cn(
                              "w-2 h-2 rounded-full border",
                              i < (slots.max - slots.used)
                                ? "bg-purple-400 border-purple-400"
                                : "border-purple-400/40"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Spells List */}
            {spells.length > 0 ? (
              <div className="space-y-1">
                {spells.map(spell => (
                  <SpellRow key={spell.id} spell={spell} />
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-stone-500 text-sm italic">
                No spells known
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AttackRow({ attack }: { attack: Attack }) {
  const damageColor = DAMAGE_TYPE_COLORS[attack.damageType.toLowerCase()] || "text-stone-300"

  return (
    <div className="flex items-center gap-2 p-2 bg-[#1a1614]/60 border border-[#3d3428]/40 rounded hover:border-[#3d3428] transition-colors">
      <Sword className="w-4 h-4 text-stone-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-stone-200 truncate">{attack.name}</div>
        {attack.range && (
          <div className="text-[10px] text-stone-500">{attack.range}</div>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-medium text-emerald-400">+{attack.attackBonus}</div>
        <div className={cn("text-xs", damageColor)}>
          {attack.damage} {attack.damageType}
        </div>
      </div>
    </div>
  )
}

function SpellRow({ spell }: { spell: Spell }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="border border-[#3d3428]/40 rounded overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 p-2 hover:bg-[#2a2420]/40 transition-colors"
      >
        <Wand2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
        <div className="flex-1 text-left min-w-0">
          <div className="text-sm font-medium text-stone-200 truncate">{spell.name}</div>
          <div className="text-[10px] text-stone-500">
            {spell.level === 0 ? "Cantrip" : `Level ${spell.level}`} • {spell.school}
          </div>
        </div>
        <ChevronRight className={cn(
          "w-4 h-4 text-stone-500 transition-transform",
          isExpanded && "rotate-90"
        )} />
      </button>
      {isExpanded && (
        <div className="px-2 pb-2 pt-1 border-t border-[#3d3428]/20 text-xs text-stone-400">
          <div className="grid grid-cols-2 gap-1 mb-1">
            <span><strong className="text-stone-300">Cast:</strong> {spell.castingTime}</span>
            <span><strong className="text-stone-300">Range:</strong> {spell.range}</span>
            <span><strong className="text-stone-300">Components:</strong> {spell.components}</span>
            <span><strong className="text-stone-300">Duration:</strong> {spell.duration}</span>
          </div>
          <p className="leading-relaxed">{spell.description}</p>
        </div>
      )}
    </div>
  )
}
