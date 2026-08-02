"use client"

// Stat inspection modals for the character rail (v3.0):
//  - AcBreakdownModal: itemized Armor Class breakdown whose visible rows ALWAYS
//    sum to the AC shown in the rail (a reconciliation row absorbs anything the
//    heuristic can't attribute), plus a warning when an illegal unarmored-defense
//    + armor combination is active.
//  - AbilityDetailModal: a single ability's score, modifier, saving throw and the
//    skills keyed off it with their live bonuses.
// Both share the lightweight StatModal shell: dimmed backdrop, Escape / backdrop
// close, focus moved to the panel and returned to the trigger on close.

import { useEffect, useRef } from "react"
import { X, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha"

const ABILITY_NAMES: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
}

const SKILLS_BY_ABILITY: Record<AbilityKey, string[]> = {
  str: ["Athletics"],
  dex: ["Acrobatics", "Sleight of Hand", "Stealth"],
  con: [],
  int: ["Arcana", "History", "Investigation", "Nature", "Religion"],
  wis: ["Animal Handling", "Insight", "Medicine", "Perception", "Survival"],
  cha: ["Deception", "Intimidation", "Performance", "Persuasion"],
}

const toSkillKey = (skill: string) => skill.toLowerCase().replace(/ /g, "_")
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}`

interface ModalCharacter {
  class: string
  ac: number
  abilities: Record<AbilityKey, { score: number; modifier: number }>
  savingThrowProficiencies: AbilityKey[]
  skillProficiencies: string[]
  skillExpertises: string[]
  proficiencyBonus: number
}

interface EquippedRef {
  name: string
  slot: string
}

// --- Shared shell -----------------------------------------------------------

function StatModal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      previouslyFocused.current?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-[81] w-full max-w-sm rounded-md border border-[#7a5f33]/60 bg-[#14100b] shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between border-b border-[#3d3428]/70 px-4 py-2.5">
          <h2 className="font-serif text-[#e0cfa0]">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-sm p-1 text-stone-500 transition-colors hover:text-stone-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

// --- AC breakdown -----------------------------------------------------------

const HEAVY = ["plate", "splint", "ring mail", "chain mail"]
const MEDIUM = ["hide", "chain shirt", "scale mail", "breastplate", "half plate"]
const LIGHT = ["leather", "padded", "studded"]

type ArmorCategory = "none" | "light" | "medium" | "heavy"

function categorizeArmor(name?: string): ArmorCategory {
  if (!name) return "none"
  const n = name.toLowerCase()
  if (HEAVY.some((k) => n.includes(k))) return "heavy"
  if (MEDIUM.some((k) => n.includes(k))) return "medium"
  if (LIGHT.some((k) => n.includes(k))) return "light"
  return "none"
}

export function AcBreakdownModal({
  character,
  equipped,
  onClose,
}: {
  character: ModalCharacter
  equipped: EquippedRef[]
  onClose: () => void
}) {
  const dexMod = character.abilities.dex.modifier
  const bodyArmor = equipped.find((e) => e.slot === "torso" || e.slot === "chest")
  const shield = equipped.find(
    (e) => (e.slot === "off_hand" || e.slot === "off") && /shield/i.test(e.name),
  )
  const category = categorizeArmor(bodyArmor?.name)
  const wearingArmor = category !== "none"

  const usesMonkDefense = character.class === "Monk" && !wearingArmor
  const usesBarbDefense = character.class === "Barbarian" && !wearingArmor
  const illegalUnarmoredDefense =
    (character.class === "Monk" || character.class === "Barbarian") && wearingArmor

  // Derive each visible contribution. A final reconciliation row guarantees the
  // sum matches the authoritative AC stored on the character.
  const rows: { label: string; value: number; hint?: string }[] = []

  rows.push({
    label: wearingArmor ? "Armor base" : "Base (unarmored)",
    value: wearingArmor ? 0 : 10,
    hint: wearingArmor ? bodyArmor?.name : "10",
  })

  let dexContribution = dexMod
  let dexHint = "full Dex"
  if (category === "medium") {
    dexContribution = Math.min(dexMod, 2)
    dexHint = "capped at +2"
  } else if (category === "heavy") {
    dexContribution = 0
    dexHint = "none in heavy armor"
  }
  rows.push({ label: "Dexterity", value: dexContribution, hint: dexHint })

  if (shield) rows.push({ label: "Shield", value: 2, hint: shield.name })

  if (usesMonkDefense)
    rows.push({ label: "Unarmored Defense (Wis)", value: character.abilities.wis.modifier })
  if (usesBarbDefense)
    rows.push({ label: "Unarmored Defense (Con)", value: character.abilities.con.modifier })

  const derivedSum = rows.reduce((s, r) => s + r.value, 0)
  const reconciliation = character.ac - derivedSum
  if (reconciliation !== 0) {
    rows.push({
      label: "Other / magic",
      value: reconciliation,
      hint: "armor & item bonuses",
    })
  }

  const total = rows.reduce((s, r) => s + r.value, 0)

  const formula = usesMonkDefense
    ? "10 + Dex + Wis"
    : usesBarbDefense
      ? "10 + Dex + Con"
      : wearingArmor
        ? `${bodyArmor?.name} + Dex${category === "medium" ? " (max 2)" : category === "heavy" ? " (0)" : ""}${shield ? " + shield" : ""}`
        : "10 + Dex"

  return (
    <StatModal title="Armor Class" onClose={onClose}>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-stone-500">Active formula</span>
        <span className="font-mono text-sm text-[#d9bd7e]">{formula}</span>
      </div>

      {illegalUnarmoredDefense && (
        <div className="mb-3 flex items-start gap-2 rounded-sm border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-xs text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            {character.class} Unarmored Defense does not apply while wearing armor. The stored AC is
            shown, but this combination is illegal by the rules.
          </span>
        </div>
      )}

      <div className="divide-y divide-[#3d3428]/50 rounded-sm border border-[#3d3428]/60">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
            <span className="text-stone-300">
              {r.label}
              {r.hint && <span className="ml-1.5 text-[11px] text-stone-500">({r.hint})</span>}
            </span>
            <span className={cn("font-medium", r.value >= 0 ? "text-stone-200" : "text-red-400")}>
              {signed(r.value)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between bg-[#1d1710] px-3 py-2">
          <span className="font-serif text-[#e0cfa0]">Total AC</span>
          <span className="text-lg font-bold text-[#e6c878]">{total}</span>
        </div>
      </div>
    </StatModal>
  )
}

// --- Ability detail ---------------------------------------------------------

export function AbilityDetailModal({
  ability,
  character,
  onClose,
  onRoll,
}: {
  ability: AbilityKey
  character: ModalCharacter
  onClose: () => void
  onRoll?: (label: string, modifier: number) => void
}) {
  const data = character.abilities[ability]
  const name = ABILITY_NAMES[ability]
  const hasSaveProf = character.savingThrowProficiencies.includes(ability)
  const saveBonus = data.modifier + (hasSaveProf ? character.proficiencyBonus : 0)
  const skills = SKILLS_BY_ABILITY[ability]

  const skillRows = skills.map((skill) => {
    const key = toSkillKey(skill)
    const prof = character.skillProficiencies.includes(key)
    const expertise = character.skillExpertises.includes(key)
    const bonus =
      data.modifier + (expertise ? character.proficiencyBonus * 2 : prof ? character.proficiencyBonus : 0)
    return { skill, bonus, prof, expertise }
  })

  return (
    <StatModal title={name} onClose={onClose}>
      <div className="mb-3 flex items-center justify-center gap-6">
        <div className="text-center">
          <div className="text-3xl font-bold text-stone-100">{data.score}</div>
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Score</div>
        </div>
        <div className="text-center">
          <div className={cn("text-3xl font-bold", data.modifier >= 0 ? "text-emerald-400" : "text-red-400")}>
            {signed(data.modifier)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Modifier</div>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between rounded-sm border border-[#3d3428]/60 px-3 py-1.5 text-sm">
        <span className="text-stone-300">
          Saving Throw
          {hasSaveProf && <span className="ml-1.5 text-[11px] text-emerald-400">(proficient)</span>}
        </span>
        <span className={cn("font-medium", hasSaveProf ? "text-emerald-400" : "text-stone-300")}>
          {signed(saveBonus)}
        </span>
      </div>

      {skillRows.length > 0 ? (
        <div>
          <div className="mb-1 font-serif text-[11px] uppercase tracking-wider text-[#d9bd7e]">Skills</div>
          <div className="divide-y divide-[#3d3428]/50 rounded-sm border border-[#3d3428]/60">
            {skillRows.map((s) => (
              <div key={s.skill} className="flex items-center justify-between px-3 py-1.5 text-sm">
                <span
                  className={cn(
                    s.expertise ? "text-yellow-300" : s.prof ? "text-emerald-300" : "text-stone-400",
                  )}
                >
                  {s.skill}
                  {s.expertise && <span className="ml-1 text-[10px]">(E)</span>}
                </span>
                <span
                  className={cn(
                    "font-medium",
                    s.expertise ? "text-yellow-400" : s.prof ? "text-emerald-400" : "text-stone-400",
                  )}
                >
                  {signed(s.bonus)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-center text-xs italic text-stone-500">No skills are governed by {name}.</p>
      )}

      {onRoll && (
        <button
          onClick={() => onRoll(`${name} Check`, data.modifier)}
          className="mt-3 w-full rounded-sm border border-[#7a5f33]/60 bg-gradient-to-b from-[#1d1710] to-[#120e0a] py-1.5 text-sm text-stone-300 transition-colors hover:border-[#c9a868] hover:text-[#e0cfa0]"
        >
          Roll {name} Check ({signed(data.modifier)})
        </button>
      )}
    </StatModal>
  )
}
