"use client"

// ============================================================================
// FULL CHARACTER SHEET SLIDE-OVER (Forge edition)
//
// A faithful re-creation of the aop-forge-2014 character sheet, styled to match
// the dashboard's dark-fantasy aesthetic. Right-anchored panel covering the
// centre of the screen on desktop, full-screen on mobile. Dimmed backdrop;
// closes on the ✕ button, Escape, or a backdrop click. Focus is trapped while
// open and returned to the trigger on close.
//
// FUNCTIONALITY (like the Forge):
//  • Ability medallions, saving throws, skills and initiative are all ROLLABLE
//    through the SHARED 3D dice engine (useDice) — never a local RNG — and the
//    result is announced to the table feed.
//  • Live HP: HEAL / DMG controls (damage burns through temp HP first), temp HP,
//    hit dice and proficiency bonus read-outs.
//  • Heroic Inspiration toggle, conditions chips, derived passive senses.
//  • Tabbed detail below the poster: Actions, Spells (if a caster), Inventory,
//    Features & Traits, Background, Notes.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react"
import { X, Dices, Flame, Heart, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDice, describeRoll } from "@/components/dice/dice-provider"

type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha"

const ABILS: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"]

const ABILITY_SHORT: Record<AbilityKey, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
}

const ABILITY_NAMES: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
}

// [skill name, governing ability]
const SKILLS: [string, AbilityKey][] = [
  ["Acrobatics", "dex"],
  ["Animal Handling", "wis"],
  ["Arcana", "int"],
  ["Athletics", "str"],
  ["Deception", "cha"],
  ["History", "int"],
  ["Insight", "wis"],
  ["Intimidation", "cha"],
  ["Investigation", "int"],
  ["Medicine", "wis"],
  ["Nature", "int"],
  ["Perception", "wis"],
  ["Performance", "cha"],
  ["Persuasion", "cha"],
  ["Religion", "int"],
  ["Sleight of Hand", "dex"],
  ["Stealth", "dex"],
  ["Survival", "wis"],
]

const HIT_DICE: Record<string, number> = {
  Barbarian: 12,
  Fighter: 10,
  Paladin: 10,
  Ranger: 10,
  Bard: 8,
  Cleric: 8,
  Druid: 8,
  Monk: 8,
  Rogue: 8,
  Warlock: 8,
  Sorcerer: 6,
  Wizard: 6,
}

// Cumulative XP required to reach each level (index = level - 1).
const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000,
  265000, 305000, 355000,
]

const toSkillKey = (s: string) => s.toLowerCase().replace(/ /g, "_")
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}`

interface SheetCharacter {
  name: string
  race: string
  class: string
  subclass?: string | null
  level: number
  background?: string
  alignment?: string
  avatarUrl?: string | null
  experiencePoints?: number
  hp?: { current: number; max: number; temp?: number }
  ac: number
  initiative?: number
  speed?: number | string
  proficiencyBonus: number
  passivePerception: number
  senses?: unknown
  conditions?: string[]
  age?: number | null
  height?: string | null
  weight?: string | null
  eyes?: string | null
  hair?: string | null
  skin?: string | null
  abilities: Record<AbilityKey, { score: number; modifier: number }>
  savingThrowProficiencies: AbilityKey[]
  skillProficiencies: string[]
  skillExpertises: string[]
  languages?: string[]
  armorProficiencies?: string[]
  weaponProficiencies?: string[]
  toolProficiencies?: string[]
  features?: unknown
  personality?: unknown
  spellcastingAbility?: string | null
  spellSaveDC?: number | null
  spellAttackBonus?: number | null
}

interface SheetInventoryItem {
  id: string
  name: string
  quantity: number
  weight?: number | null
  description?: string | null
  item_type?: string
  equippable_slot?: string | null
}

// ----- personality / features normalizers ----------------------------------

function normalizePersonality(personality: unknown): { label: string; value: string }[] {
  if (!personality) return []
  if (typeof personality === "string") {
    return personality.trim() ? [{ label: "Personality", value: personality.trim() }] : []
  }
  if (typeof personality === "object") {
    const p = personality as Record<string, unknown>
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = p[k]
        if (typeof v === "string" && v.trim()) return v.trim()
        if (Array.isArray(v) && v.length) return v.join(", ")
      }
      return ""
    }
    return [
      { label: "Personality Traits", value: pick("traits", "personality_traits", "trait") },
      { label: "Ideals", value: pick("ideals", "ideal") },
      { label: "Bonds", value: pick("bonds", "bond") },
      { label: "Flaws", value: pick("flaws", "flaw") },
    ].filter((o) => o.value)
  }
  return []
}

function normalizeFeatures(features: unknown): { name: string; desc?: string; source?: string }[] {
  if (!Array.isArray(features)) return []
  return features
    .map((f) => {
      if (typeof f === "string") return { name: f }
      if (f && typeof f === "object") {
        const o = f as Record<string, unknown>
        const name = typeof o.name === "string" ? o.name : ""
        if (!name) return null
        return {
          name,
          desc: typeof o.description === "string" ? o.description : typeof o.desc === "string" ? o.desc : undefined,
          source: typeof o.source === "string" ? o.source : undefined,
        }
      }
      return null
    })
    .filter(Boolean) as { name: string; desc?: string; source?: string }[]
}

// ----- small styled primitives ----------------------------------------------

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "relative rounded-lg border border-[#c9a868]/40 bg-[#0b0807]/80 p-3 shadow-[inset_0_0_22px_rgba(0,0,0,0.55)]",
        className,
      )}
    >
      {children}
    </div>
  )
}

function PanelHead({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-2 font-serif text-[12px] uppercase tracking-[0.14em] text-[#e0cfa0]">{children}</h4>
  )
}

function RollChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-[#3d3428] bg-[#14100b] px-3 py-1 text-sm font-bold text-stone-200 transition-colors hover:border-[#c9a868] hover:text-[#e0cfa0] hover:shadow-[0_0_8px_rgba(201,168,104,0.25)]"
    >
      <Dices className="h-3 w-3 text-[#c9a868]" />
      {label}
    </button>
  )
}

// ----- component -------------------------------------------------------------

export function CharacterSheetSlideOver({
  open,
  onClose,
  character,
  inventory = [],
}: {
  open: boolean
  onClose: () => void
  character: SheetCharacter
  inventory?: SheetInventoryItem[]
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const { roll, announce } = useDice()

  const pb = character.proficiencyBonus
  const hpMax = character.hp?.max ?? 0

  // Live, in-memory sheet state (mirrors the Forge's local interactivity).
  const [hpCurrent, setHpCurrent] = useState(character.hp?.current ?? hpMax)
  const [tempHp, setTempHp] = useState(character.hp?.temp ?? 0)
  const [inspiration, setInspiration] = useState(false)
  const [hpDelta, setHpDelta] = useState("1")
  const [tab, setTab] = useState<"actions" | "spells" | "inventory" | "features" | "background" | "notes">("actions")
  const [notes, setNotes] = useState("")

  const isCaster = Boolean(character.spellcastingAbility)

  // Re-sync HP whenever a different character is loaded into the sheet.
  const identity = `${character.name}|${character.level}|${hpMax}`
  useEffect(() => {
    setHpCurrent(character.hp?.current ?? hpMax)
    setTempHp(character.hp?.temp ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity])

  // If the caster tab isn't available, don't leave it selected.
  useEffect(() => {
    if (!isCaster && tab === "spells") setTab("actions")
  }, [isCaster, tab])

  // Focus trap + escape + return focus.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const t = requestAnimationFrame(() => panelRef.current?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusable.length === 0) {
          e.preventDefault()
          panelRef.current.focus()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || active === panelRef.current)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      cancelAnimationFrame(t)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open && previouslyFocused.current) {
      previouslyFocused.current.focus?.()
      previouslyFocused.current = null
    }
  }, [open])

  // ---- derived values -------------------------------------------------------

  const skillBonus = (name: string, ab: AbilityKey) => {
    const key = toSkillKey(name)
    const expert = character.skillExpertises.includes(key)
    const prof = character.skillProficiencies.includes(key)
    return character.abilities[ab].modifier + (expert ? pb * 2 : prof ? pb : 0)
  }
  const saveBonus = (ab: AbilityKey) =>
    character.abilities[ab].modifier + (character.savingThrowProficiencies.includes(ab) ? pb : 0)

  const passiveInsight = 10 + skillBonus("Insight", "wis")
  const passiveInvestigation = 10 + skillBonus("Investigation", "int")

  const darkvision = useMemo(() => {
    const s = character.senses
    if (!s) return null
    if (typeof s === "string") {
      const m = /darkvision\s*(\d+)/i.exec(s)
      return m ? Number(m[1]) : /darkvision/i.test(s) ? 60 : null
    }
    if (typeof s === "object") {
      const o = s as Record<string, unknown>
      const v = o.darkvision ?? o.dark_vision
      if (typeof v === "number") return v
      if (typeof v === "string") {
        const m = /(\d+)/.exec(v)
        return m ? Number(m[1]) : null
      }
    }
    return null
  }, [character.senses])

  const hitDie = HIT_DICE[character.class] ?? 8
  const xp = character.experiencePoints ?? 0
  const curT = XP_THRESHOLDS[Math.min(19, Math.max(0, character.level - 1))]
  const nextT = character.level >= 20 ? null : XP_THRESHOLDS[character.level]
  const xpPct = nextT == null ? 100 : Math.max(0, Math.min(100, Math.round((100 * (xp - curT)) / (nextT - curT))))

  const personality = normalizePersonality(character.personality)
  const features = normalizeFeatures(character.features)
  const conditions = character.conditions ?? []

  // ---- rolling --------------------------------------------------------------

  const doD20 = async (label: string, modifier: number) => {
    const res = await roll({ die: "d20", numDice: 1, modifier, label })
    announce(describeRoll(res))
  }
  const doDamage = async (label: string, numDice: number, die: string, modifier: number) => {
    const res = await roll({ die, numDice, modifier, label })
    announce(describeRoll(res))
  }

  const applyHeal = () => {
    const n = Math.max(0, Number.parseInt(hpDelta, 10) || 0)
    setHpCurrent((c) => Math.min(hpMax, c + n))
  }
  const applyDamage = () => {
    let n = Math.max(0, Number.parseInt(hpDelta, 10) || 0)
    setTempHp((t) => {
      const absorbed = Math.min(t, n)
      n -= absorbed
      return t - absorbed
    })
    setHpCurrent((c) => Math.max(0, c - n))
  }

  const hpTone =
    hpMax > 0 && hpCurrent / hpMax <= 0.25 ? "text-red-400" : hpMax > 0 && hpCurrent / hpMax <= 0.5 ? "text-amber-400" : "text-emerald-400"

  if (!open) return null

  const chips: [string, string][] = [
    ["Class", character.class || "—"],
    ["Subclass", character.subclass || "—"],
    ["Race", character.race || "—"],
    ["Background", character.background || "—"],
    ["Alignment", character.alignment || "—"],
  ]

  const tabDefs: [typeof tab, string][] = [
    ["actions", "Actions"],
    ...(isCaster ? ([["spells", "Spells"]] as [typeof tab, string][]) : []),
    ["inventory", "Inventory"],
    ["features", "Features & Traits"],
    ["background", "Background"],
    ["notes", "Notes"],
  ]

  const weapons = inventory.filter(
    (i) => i.item_type === "weapon" || i.equippable_slot === "main_hand" || i.equippable_slot === "off_hand",
  )
  const totalWeight = inventory.reduce((sum, i) => sum + (i.weight ?? 0) * (i.quantity ?? 1), 0)
  const attackMod = Math.max(character.abilities.str.modifier, character.abilities.dex.modifier) + pb

  return (
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label={`${character.name} character sheet`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute right-0 top-0 h-full w-full overflow-y-auto border-l border-[#7a5f33]/60 bg-[#0d0a08] shadow-2xl outline-none animate-in slide-in-from-right duration-300 md:w-[74%] md:max-w-6xl"
      >
        {/* Sticky header banner */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[#3d3428]/70 bg-gradient-to-b from-[#26100f] via-[#1a0d0c] to-[#140b0a] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-[#d9232e] bg-[#0a0908] shadow-[0_0_12px_rgba(217,35,46,0.4)]"
              aria-label="Portrait"
            >
              {character.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={character.avatarUrl || "/placeholder.svg"} alt={character.name} className="h-full w-full object-cover" />
              ) : (
                <span className="font-serif text-2xl text-[#c9a868]">{(character.name || "?")[0]?.toUpperCase()}</span>
              )}
            </button>
            <div className="min-w-0">
              <h2 className="truncate font-serif text-xl uppercase tracking-wide text-[#f2e8d5]">{character.name}</h2>
              <p className="truncate text-sm text-stone-400">
                Level {character.level} {character.race} {character.class}
                {character.subclass ? ` · ${character.subclass}` : ""}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 w-40 overflow-hidden rounded bg-[#0a0908]">
                  <div
                    className="h-full bg-gradient-to-r from-[#c9a868] to-[#ff6b35]"
                    style={{ width: `${xpPct}%` }}
                  />
                </div>
                <span className="text-[10px] text-stone-500">
                  XP {xp.toLocaleString()}
                  {nextT != null ? ` / ${nextT.toLocaleString()}` : " · Max"}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close character sheet"
            className="rounded-sm p-1.5 text-stone-500 transition-colors hover:text-stone-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Identity chips */}
        <div className="grid grid-cols-2 gap-px overflow-hidden border-b border-[#3d3428]/60 bg-[#3d3428]/30 sm:grid-cols-5">
          {chips.map(([k, v]) => (
            <div key={k} className="bg-[#0d0a08] px-3 py-2">
              <div className="text-[9px] uppercase tracking-[0.13em] text-[#c9a868]">{k}</div>
              <div className="truncate font-serif text-[12px] uppercase text-[#f2e8d5]">{v}</div>
            </div>
          ))}
        </div>

        {/* ---- Top band: ability scores + core stats (image 1 layout) ---- */}
        <div className="border-b border-[#3d3428]/60 px-4 py-5">
          <div className="flex flex-wrap items-end justify-center gap-2 lg:justify-start">
            {ABILS.map((ab) => {
              const d = character.abilities[ab]
              const savep = character.savingThrowProficiencies.includes(ab)
              return (
                <button
                  key={ab}
                  onClick={() => doD20(`${ABILITY_NAMES[ab]} Check`, d.modifier)}
                  title={`Roll ${ABILITY_NAMES[ab]} check`}
                  className={cn(
                    "relative mb-3 flex w-[72px] flex-col items-center rounded-lg border-2 bg-[#12100c] px-1 pb-4 pt-2 transition-shadow",
                    savep ? "border-[#d9232e]" : "border-[#8a6f3c]",
                    "hover:shadow-[0_0_14px_rgba(201,168,104,0.5)]",
                  )}
                >
                  <span className="text-[9px] uppercase tracking-[0.1em] text-[#c9a868]">{ABILITY_SHORT[ab]}</span>
                  <span className="font-serif text-2xl leading-none text-[#f2e8d5]">{signed(d.modifier)}</span>
                  <span className="absolute -bottom-3 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#8a6f3c] bg-[#0a0908] font-serif text-sm text-[#f2e8d5]">
                    {d.score}
                  </span>
                </button>
              )
            })}
            {/* Core stat boxes */}
            <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              <StatCell label="Proficiency" value={signed(pb)} />
              <StatCell label="Walking Speed" value={`${character.speed ?? 30} ft`} />
              <StatCell
                label="Initiative"
                value={signed(character.initiative ?? character.abilities.dex.modifier)}
                onClick={() => doD20("Initiative", character.initiative ?? character.abilities.dex.modifier)}
                title="Roll initiative"
              />
              <StatCell label="Armor Class" value={character.ac} />
              <button
                onClick={() => setInspiration((v) => !v)}
                title="Toggle Heroic Inspiration"
                className={cn(
                  "flex flex-col items-center justify-center rounded-md border py-2 transition-colors",
                  inspiration
                    ? "border-[#c9a868] bg-[#c9a868]/10 shadow-[0_0_14px_rgba(201,168,104,0.4)]"
                    : "border-[#c9a868]/45 bg-[#0b0807]/80",
                )}
              >
                {inspiration ? <Flame className="h-5 w-5 text-[#ff6b35]" /> : <Sparkles className="h-5 w-5 text-stone-600" />}
                <span className="mt-1 text-[9px] uppercase tracking-[0.1em] text-[#c9a868]">Inspiration</span>
              </button>
              {/* HP readout (interactive Heal/Dmg lives in the Hit Points panel below) */}
              <div className="col-span-2 flex flex-col items-center justify-center rounded-md border border-[#c9a868]/45 bg-[#0b0807]/80 px-3 py-2">
                <div className="font-serif text-xl">
                  <span className={hpTone}>{hpCurrent}</span>
                  <span className="text-sm text-stone-500"> / {hpMax}</span>
                </div>
                <div className="text-[9px] uppercase tracking-wider text-[#c9a868]">
                  Hit Points{tempHp > 0 ? ` · +${tempHp} temp` : ""}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
          {/* ---- Column A: senses ---- */}
          <div className="flex flex-col gap-3">
            <Panel>
              <PanelHead>Senses</PanelHead>
              <div className="flex flex-col gap-1 text-[13px] text-stone-300">
                <div className="flex items-center gap-2">
                  <b className="text-[#f2e8d5]">{character.passivePerception}</b> Passive Perception
                </div>
                <div className="flex items-center gap-2">
                  <b className="text-[#f2e8d5]">{passiveInsight}</b> Passive Insight
                </div>
                <div className="flex items-center gap-2">
                  <b className="text-[#f2e8d5]">{passiveInvestigation}</b> Passive Investigation
                </div>
                {darkvision ? (
                  <div className="mt-1 text-stone-400">
                    <b className="text-[#f2e8d5]">Darkvision</b> {darkvision} ft.
                  </div>
                ) : null}
              </div>
            </Panel>
          </div>

          {/* ---- Column B: stats, saves/skills, vitals ---- */}
          <div className="flex flex-col gap-3">
            {/* saving throws */}
            <Panel>
              <PanelHead>Saving Throws</PanelHead>
              <div className="flex flex-col">
                {ABILS.map((ab) => {
                  const prof = character.savingThrowProficiencies.includes(ab)
                  const bonus = saveBonus(ab)
                  return (
                    <button
                      key={ab}
                      onClick={() => doD20(`${ABILITY_NAMES[ab]} Save`, bonus)}
                      className="flex items-center gap-2 rounded px-1 py-1 text-[13px] text-stone-300 hover:bg-[#c9a868]/10"
                    >
                      <Dot state={prof ? "p" : ""} />
                      <b className="w-8 text-[#f2e8d5]">{signed(bonus)}</b>
                      <span className="flex-1 truncate text-left">{ABILITY_NAMES[ab]}</span>
                    </button>
                  )
                })}
              </div>
            </Panel>

            {/* skills — single column so names never clip (image 1 layout) */}
            <Panel>
              <PanelHead>Skills</PanelHead>
              <div className="flex flex-col">
                {SKILLS.map(([name, ab]) => {
                  const key = toSkillKey(name)
                  const expert = character.skillExpertises.includes(key)
                  const prof = character.skillProficiencies.includes(key)
                  const bonus = skillBonus(name, ab)
                  return (
                    <button
                      key={name}
                      onClick={() => doD20(name, bonus)}
                      className="flex items-center gap-2 rounded px-1 py-0.5 text-[13px] text-stone-300 hover:bg-[#c9a868]/10"
                    >
                      <Dot state={expert ? "e" : prof ? "p" : ""} />
                      <span className="w-8 text-[10px] uppercase text-stone-600">{ABILITY_SHORT[ab]}</span>
                      <span className="flex-1 truncate text-left">{name}</span>
                      <b className="text-[#f2e8d5]">{signed(bonus)}</b>
                    </button>
                  )
                })}
              </div>
            </Panel>

            {/* vitals */}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
              <Panel className="text-center">
                <PanelHead>
                  <span className="inline-flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5 text-[#d9232e]" /> Hit Points
                  </span>
                </PanelHead>
                <div className="font-serif text-3xl">
                  <span className={hpTone}>{hpCurrent}</span>
                  <span className="text-lg text-stone-500"> / {hpMax}</span>
                </div>
                <div className="mt-2 flex items-center justify-center gap-1.5">
                  <button
                    onClick={applyHeal}
                    className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-400"
                  >
                    Heal
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={hpDelta}
                    onChange={(e) => setHpDelta(e.target.value)}
                    className="w-14 rounded border border-[#3d3428] bg-[#14100b] px-1 py-1 text-center text-sm text-stone-200 outline-none focus:border-[#c9a868]"
                    aria-label="HP amount"
                  />
                  <button
                    onClick={applyDamage}
                    className="rounded border border-red-500/40 bg-red-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-400"
                  >
                    Dmg
                  </button>
                </div>
                {tempHp > 0 && <div className="mt-2 text-[11px] text-sky-400">+{tempHp} temp HP</div>}
              </Panel>
              <div className="flex flex-col gap-3">
                <Panel className="text-center">
                  <PanelHead>Hit Dice</PanelHead>
                  <div className="font-serif text-lg text-[#f2e8d5]">
                    {character.level}d{hitDie}
                  </div>
                </Panel>
                <Panel className="text-center">
                  <PanelHead>Temp HP</PanelHead>
                  <div className="font-serif text-lg text-sky-400">{tempHp || "—"}</div>
                </Panel>
              </div>
            </div>

            {/* conditions */}
            <Panel>
              <PanelHead>Conditions</PanelHead>
              {conditions.length ? (
                <div className="flex flex-wrap gap-2">
                  {conditions.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-[#d9232e]/60 bg-[#d9232e]/10 px-3 py-0.5 text-xs text-[#ff8b93]"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-stone-500">No active conditions.</p>
              )}
            </Panel>
          </div>

          {/* ---- Column C: proficiencies + personality ---- */}
          <div className="flex flex-col gap-3">
            <Panel>
              <PanelHead>Proficiencies &amp; Languages</PanelHead>
              <div className="flex flex-col gap-1.5 text-[12px] text-stone-300">
                <ProfLine label="Armor" values={character.armorProficiencies} />
                <ProfLine label="Weapons" values={character.weaponProficiencies} />
                <ProfLine label="Tools" values={character.toolProficiencies} />
                <ProfLine label="Languages" values={character.languages} />
              </div>
            </Panel>
            <Panel>
              <PanelHead>Personality</PanelHead>
              {personality.length ? (
                <div className="flex flex-col gap-2.5">
                  {personality.map((p) => (
                    <div key={p.label}>
                      <div className="text-[10px] uppercase tracking-wider text-[#c9a868]">{p.label}</div>
                      <p className="text-[13px] leading-relaxed text-stone-300">{p.value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-stone-500">
                  Add traits, ideals, bonds and flaws in the character builder.
                </p>
              )}
            </Panel>
          </div>
        </div>

        {/* ---- detail tabs ---- */}
        <div className="px-4 pb-8">
          <div className="mb-3 flex flex-wrap gap-1 border-b-2 border-[#3d3428]">
            {tabDefs.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "-mb-0.5 border-b-2 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide transition-colors",
                  tab === id
                    ? "border-[#d9232e] text-[#ff8b93]"
                    : "border-transparent text-stone-500 hover:text-stone-300",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "actions" && (
            <div className="flex flex-col gap-4">
              <section>
                <h5 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#ff8b93]">Attacks</h5>
                {weapons.length ? (
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wide text-stone-500">
                        <th className="border-b border-[#3d3428] py-2 pr-3">Weapon</th>
                        <th className="border-b border-[#3d3428] py-2 pr-3">Hit</th>
                        <th className="border-b border-[#3d3428] py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weapons.map((w) => {
                        const dmg = w.description ? /(\d+)\s*d\s*(\d+)/i.exec(w.description) : null
                        return (
                          <tr key={w.id} className="align-top text-stone-300">
                            <td className="border-b border-[#3d3428]/60 py-2 pr-3 font-semibold text-[#f2e8d5]">{w.name}</td>
                            <td className="border-b border-[#3d3428]/60 py-2 pr-3">
                              <RollChip label={signed(attackMod)} onClick={() => doD20(`${w.name} — Attack`, attackMod)} />
                            </td>
                            <td className="border-b border-[#3d3428]/60 py-2 text-stone-500">
                              {dmg ? (
                                <RollChip
                                  label={`${dmg[1]}d${dmg[2]}`}
                                  onClick={() =>
                                    doDamage(
                                      `${w.name} — Damage`,
                                      Number(dmg[1]),
                                      `d${dmg[2]}`,
                                      Math.max(character.abilities.str.modifier, character.abilities.dex.modifier),
                                    )
                                  }
                                />
                              ) : (
                                <span className="text-stone-600">{w.description || "—"}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-[13px] text-stone-500">
                    No weapons equipped. Add weapons in the inventory to roll attacks.
                  </p>
                )}
              </section>
              <section>
                <h5 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#ff8b93]">Actions in Combat</h5>
                <p className="text-[13px] leading-relaxed text-stone-400">
                  Attack, Dash, Disengage, Dodge, Grapple, Help, Hide, Improvise, Influence, Magic, Ready, Search,
                  Shove, Study, Utilize.
                </p>
              </section>
            </div>
          )}

          {tab === "spells" && (
            <div className="flex flex-col gap-3">
              <Panel>
                <PanelHead>Spellcasting — {ABILITY_NAMES[(character.spellcastingAbility || "int") as AbilityKey] ?? character.spellcastingAbility}</PanelHead>
                <div className="flex flex-wrap items-center gap-4 text-[13px] text-stone-300">
                  <span>
                    <b className="text-[#f2e8d5]">Save DC</b> {character.spellSaveDC ?? "—"}
                  </span>
                  {character.spellAttackBonus != null && (
                    <RollChip
                      label={`Spell Attack ${signed(character.spellAttackBonus)}`}
                      onClick={() => doD20("Spell Attack", character.spellAttackBonus ?? 0)}
                    />
                  )}
                </div>
              </Panel>
              <p className="text-[13px] text-stone-500">Manage your prepared spells in the character builder.</p>
            </div>
          )}

          {tab === "inventory" && (
            <div className="overflow-hidden rounded-lg border border-[#3d3428]">
              <div className="flex items-center justify-between bg-[#14100b] px-3 py-2 text-[11px] uppercase tracking-wide text-stone-400">
                <span>Inventory ({inventory.length})</span>
                <span>{Math.round(totalWeight * 10) / 10} lb</span>
              </div>
              {inventory.length ? (
                inventory.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 border-t border-[#3d3428]/60 px-3 py-2 text-[13px]">
                    <span className="text-stone-200">{i.name}</span>
                    {i.item_type && <span className="text-[10px] uppercase text-stone-600">{i.item_type}</span>}
                    <span className="ml-auto text-stone-500">×{i.quantity}</span>
                    {i.weight ? <span className="w-16 text-right text-stone-600">{i.weight} lb</span> : null}
                  </div>
                ))
              ) : (
                <p className="px-3 py-4 text-[13px] text-stone-500">No items carried.</p>
              )}
            </div>
          )}

          {tab === "features" && (
            <div className="flex flex-col">
              {features.length ? (
                features.map((f, idx) => (
                  <div key={`${f.name}-${idx}`} className="border-b border-[#3d3428]/60 py-3 last:border-none">
                    <h5 className="font-serif text-[14.5px] text-[#f2e8d5]">
                      {f.name}
                      {f.source && <span className="ml-2 text-[10.5px] italic text-stone-500">{f.source}</span>}
                    </h5>
                    {f.desc && <p className="mt-1 text-[12.5px] leading-relaxed text-stone-400">{f.desc}</p>}
                  </div>
                ))
              ) : (
                <p className="text-[13px] text-stone-500">No features recorded.</p>
              )}
            </div>
          )}

          {tab === "background" && (
            <div className="rounded-lg border-l-2 border-[#c9a868] bg-[#0b0807]/80 p-4">
              <h3 className="mb-2 font-serif text-lg text-[#e0cfa0]">
                {character.background || "Unknown"} · {character.alignment || "Unaligned"}
              </h3>
              <div className="flex flex-col gap-2 text-[13px] text-stone-300">
                <Trait
                  label="Appearance"
                  value={[
                    character.age && `Age ${character.age}`,
                    character.height,
                    character.weight,
                    character.eyes && `${character.eyes} eyes`,
                    character.hair && `${character.hair} hair`,
                    character.skin && `${character.skin} skin`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
                {personality.map((p) => (
                  <Trait key={p.label} label={p.label} value={p.value} />
                ))}
              </div>
            </div>
          )}

          {tab === "notes" && (
            <div>
              <label className="mb-1.5 block text-[10.5px] uppercase tracking-wide text-stone-500">Session Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Track leads, loot and lingering threats…"
                className="min-h-[220px] w-full resize-y rounded-md border border-[#3d3428] bg-[#14100b] p-3 text-[13px] text-stone-200 outline-none focus:border-[#c9a868]"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ----- leaf components -------------------------------------------------------

function StatCell({
  label,
  value,
  onClick,
  title,
}: {
  label: string
  value: React.ReactNode
  onClick?: () => void
  title?: string
}) {
  const inner = (
    <>
      <span className="font-serif text-2xl text-[#f2e8d5]">{value}</span>
      <span className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-[#c9a868]">{label}</span>
    </>
  )
  if (onClick) {
    return (
      <button
        onClick={onClick}
        title={title}
        className="flex flex-col items-center justify-center rounded-md border border-[#c9a868]/45 bg-[#0b0807]/80 py-2 transition-colors hover:border-[#c9a868]"
      >
        {inner}
      </button>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-[#c9a868]/45 bg-[#0b0807]/80 py-2">
      {inner}
    </div>
  )
}

function Dot({ state }: { state: "" | "p" | "e" }) {
  return (
    <span
      className={cn(
        "h-2 w-2 flex-none rounded-full border",
        state === "p" && "border-[#d9232e] bg-[#d9232e]",
        state === "e" && "border-[#c9a868] bg-[#c9a868] shadow-[0_0_5px_rgba(201,168,104,0.7)]",
        state === "" && "border-stone-600",
      )}
    />
  )
}

function ProfLine({ label, values }: { label: string; values?: string[] }) {
  return (
    <div>
      <b className="text-[#c9a868]">{label}:</b>{" "}
      <span className="text-stone-300">{values && values.length ? values.join(", ") : "None"}</span>
    </div>
  )
}

function Trait({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div>
      <b className="text-[#c9a868]">{label}</b> <span className="text-stone-300">{value}</span>
    </div>
  )
}
