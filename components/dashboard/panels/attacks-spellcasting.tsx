"use client"

import { useState } from "react"
import { Sword, Wand2, ChevronRight, Dices } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDice, describeRoll, parseDamage } from "@/components/dice/dice-provider"

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
  strModifier?: number
  proficiencyBonus?: number
  characterClass?: string
  /** How many level 1+ spells are currently prepared. */
  preparedCount?: number
  /** Fixed limit from the SRD 5.2.1 class table — NOT ability-modifier based. */
  preparedMax?: number
  /** long_rest_any | long_rest_one | level_up_one */
  swapCadence?: string
  characterLevel?: number
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

// Divine casters study a Book of Prayers, not a book of spells. The art lives in
// Supabase (vtt-assets/item-icons/book-of-prayers) alongside the catalog record
// for the `book-of-prayers` item, which carries the same URLs under properties.art.
const BOOK_OF_PRAYERS = {
  poster:
    "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/item-icons/book-of-prayers/samson-book-of-prayers-poster.png",
  animation:
    "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/item-icons/book-of-prayers/samson-book-of-prayers-open-close.webp",
} as const

const DIVINE_CLASSES = new Set(["Cleric", "Monk"])

// SRD 5.2.1: when a caster may change prepared spells differs by class.
// Cleric/Druid/Wizard swap freely on a Long Rest; Paladin/Ranger swap one;
// Bard/Sorcerer/Warlock only on level-up.
const SWAP_CADENCE_LABEL: Record<string, string> = {
  long_rest_any: "Swap freely on a long rest",
  long_rest_one: "Swap one on a long rest",
  level_up_one: "Swaps only on level-up",
}

export function AttacksSpellcasting({
  attacks,
  canCastSpells,
  spellcastingAbility,
  spellSaveDC,
  spellAttackBonus,
  spells = [],
  spellSlots = {},
  strModifier = 0,
  proficiencyBonus = 2,
  characterClass,
  preparedCount,
  preparedMax,
  swapCadence,
  characterLevel = 1
}: AttacksSpellcastingProps) {
  const [activeTab, setActiveTab] = useState<"attacks" | "spells">("attacks")
  const isDivineCaster = characterClass ? DIVINE_CLASSES.has(characterClass) : false
  const { roll, announce, busy } = useDice()

  // Spell attack rolls go through the shared dice roller and to Malachar.
  // Save-DC spells display the DC instead — the monster's save is not the
  // player's die to roll.
  const rollSpellAttack = async () => {
    if (spellAttackBonus === undefined) return
    const result = await roll({
      die: "d20",
      numDice: 1,
      modifier: spellAttackBonus,
      label: "Spell Attack",
    })
    announce(describeRoll(result), { toLich: true })
  }

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
            {isDivineCaster ? (
              <img
                src={activeTab === "spells" ? BOOK_OF_PRAYERS.animation : BOOK_OF_PRAYERS.poster}
                alt=""
                aria-hidden="true"
                className="w-4 h-4 object-contain"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <Wand2 className="w-3.5 h-3.5" />
            )}
            {isDivineCaster ? "Prayers" : "Spells"}
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
            
            {/* Unarmed Strike - Always available per D&D 5E rules */}
            {(() => {
              // Monks get Martial Arts die that scales with level
              // Everyone else does 1 + STR modifier
              const isMonk = characterClass?.toLowerCase() === "monk"
              let unarmedDamage: string
              
              if (isMonk) {
                // Monk Martial Arts die progression
                let martialArtsDie = "1d4"
                if (characterLevel >= 17) martialArtsDie = "1d10"
                else if (characterLevel >= 11) martialArtsDie = "1d8"
                else if (characterLevel >= 5) martialArtsDie = "1d6"
                
                unarmedDamage = `${martialArtsDie}${strModifier >= 0 ? '+' + strModifier : strModifier}`
              } else {
                // Standard unarmed strike: 1 + STR modifier
                unarmedDamage = `1${strModifier >= 0 ? '+' + strModifier : strModifier}`
              }
              
              return (
                <AttackRow 
                  attack={{
                    id: "unarmed",
                    name: isMonk ? "Unarmed Strike (Martial Arts)" : "Unarmed Strike",
                    attackBonus: strModifier + proficiencyBonus,
                    damage: unarmedDamage,
                    damageType: "bludgeoning",
                    range: "Melee",
                    properties: isMonk ? ["Finesse (Monk)"] : []
                  }} 
                />
              )
            })()}
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
              <button
                onClick={rollSpellAttack}
                disabled={busy || spellAttackBonus === undefined}
                title={spellAttackBonus !== undefined ? `Roll spell attack (1d20+${spellAttackBonus})` : undefined}
                className="group p-1.5 bg-[#2a2a3a]/30 border border-purple-500/20 rounded hover:border-purple-400/60 transition-colors disabled:opacity-60"
              >
                <div className="flex items-center justify-center gap-1 text-xs text-stone-500 uppercase tracking-wider">
                  Attack
                  <Dices className="w-3 h-3 text-purple-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="text-sm font-medium text-purple-300">
                  {spellAttackBonus !== undefined ? `+${spellAttackBonus}` : "—"}
                </div>
              </button>
            </div>

            {/* Prepared count — the limit is a fixed number from the class
                table (SRD 5.2.1), not derived from the ability modifier. */}
            {preparedMax !== undefined && (
              <div className="flex items-baseline justify-between gap-2 px-1.5 py-1 rounded bg-[#2a2a3a]/20 border border-purple-500/10">
                <span className="text-[10px] uppercase tracking-wider text-stone-500">
                  {isDivineCaster ? "Prepared prayers" : "Prepared"}
                </span>
                <span className="text-xs font-medium">
                  <span
                    className={cn(
                      (preparedCount ?? 0) > preparedMax ? "text-red-400" : "text-purple-300"
                    )}
                  >
                    {preparedCount ?? 0}
                  </span>
                  <span className="text-stone-500"> / {preparedMax}</span>
                </span>
              </div>
            )}
            {swapCadence && SWAP_CADENCE_LABEL[swapCadence] && (
              <div className="px-1.5 text-[10px] italic text-stone-500">
                {SWAP_CADENCE_LABEL[swapCadence]}
              </div>
            )}

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
  const { roll, announce, busy } = useDice()

  // Click = full attack sequence through the SHARED dice roller: attack roll
  // first, then the damage roll (dice doubled on a nat 20, per 5E crits).
  // The combined result is announced to the table AND sent to Malachar so the
  // DM narrates the outcome of these exact numbers — he never re-rolls.
  const rollAttack = async () => {
    const attackResult = await roll({
      die: "d20",
      numDice: 1,
      modifier: attack.attackBonus,
      label: `${attack.name} — Attack`,
    })

    let line = describeRoll(attackResult)

    const damageSpec = parseDamage(
      attack.damage,
      attackResult.isCrit ? `${attack.name} — CRIT Damage` : `${attack.name} — Damage`,
    )
    if (damageSpec && !attackResult.isFail) {
      const critSpec = attackResult.isCrit
        ? { ...damageSpec, numDice: damageSpec.numDice * 2 }
        : damageSpec
      const damageResult = await roll(critSpec)
      line += ` | ${describeRoll(damageResult)} ${attack.damageType}`
    }

    announce(line, { toLich: true })
  }

  return (
    <button
      onClick={rollAttack}
      disabled={busy}
      title={`Roll ${attack.name}: 1d20+${attack.attackBonus} to hit, ${attack.damage} ${attack.damageType}`}
      className="group w-full flex items-center gap-2 p-2 bg-[#1a1614]/60 border border-[#3d3428]/40 rounded hover:border-[#8a6a4a] transition-colors text-left disabled:opacity-60"
    >
      <Sword className="w-4 h-4 text-stone-500 flex-shrink-0 group-hover:hidden" />
      <Dices className="w-4 h-4 text-[#c9a868] flex-shrink-0 hidden group-hover:block" />
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
    </button>
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
