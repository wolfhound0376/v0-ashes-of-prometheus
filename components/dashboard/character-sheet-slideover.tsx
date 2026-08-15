"use client"

// ============================================================================
// FULL CHARACTER SHEET SLIDE-OVER — Forge 2014 port
//
// A direct port of the standalone `aop-forge-2014` sheet: a painted hero poster
// with the character laid over its darkened left third, gold-ruled glass panels,
// 60px ability medallions, and a parchment tab box beneath. Players already know
// this sheet from the Forge, so the dashboard now shows them the same object
// rather than a second, different-looking one.
//
// Everything that was already wired is preserved:
//  • Ability, saving throw, skill and initiative rolls all go through the SHARED
//    3D dice engine (useDice) — never a local RNG — and announce to the feed.
//  • Live HP with HEAL / DMG (damage burns temp HP first), temp HP, hit dice.
//  • Heroic Inspiration toggle, condition chips, derived passive senses.
//  • Right-anchored panel, dimmed backdrop, closes on ✕ / Escape / backdrop
//    click, focus trapped while open and returned to the trigger on close.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react"
import { X, Flame, Sparkles, Shuffle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDice, describeRoll } from "@/components/dice/dice-provider"
import { ForgeSheetTheme, BACKDROPS, backdropCss } from "./forge-sheet-theme"

type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha"

const ABILS: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"]

const ABILITY_SHORT: Record<AbilityKey, string> = {
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
}

const ABILITY_NAMES: Record<AbilityKey, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma",
}

// [skill name, governing ability]
const SKILLS: [string, AbilityKey][] = [
  ["Acrobatics", "dex"], ["Animal Handling", "wis"], ["Arcana", "int"],
  ["Athletics", "str"], ["Deception", "cha"], ["History", "int"],
  ["Insight", "wis"], ["Intimidation", "cha"], ["Investigation", "int"],
  ["Medicine", "wis"], ["Nature", "int"], ["Perception", "wis"],
  ["Performance", "cha"], ["Persuasion", "cha"], ["Religion", "int"],
  ["Sleight of Hand", "dex"], ["Stealth", "dex"], ["Survival", "wis"],
]

const HIT_DICE: Record<string, number> = {
  Barbarian: 12, Fighter: 10, Paladin: 10, Ranger: 10,
  Bard: 8, Cleric: 8, Druid: 8, Monk: 8, Rogue: 8, Warlock: 8,
  Sorcerer: 6, Wizard: 6,
}

const CLASS_SPELLCASTING_ABILITY: Record<string, AbilityKey> = {
  Bard: "cha", Cleric: "wis", Druid: "wis", Paladin: "cha",
  Ranger: "wis", Sorcerer: "cha", Warlock: "cha", Wizard: "int",
}

// Cumulative XP required to reach each level (index = level - 1).
const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000,
  120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
]

const toSkillKey = (s: string) => s.toLowerCase().replace(/ /g, "_")
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}`

// `characters.speed` is free text for some rows ("30 ft. (Walking)"). The stat
// strip appends its own unit, so take the leading figure.
function formatSpeedValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "30"
  if (typeof value === "number") return String(value)
  const match = /(-?\d+)/.exec(String(value))
  return match ? match[1] : String(value)
}

// Columns the sheet treats as lists are plain TEXT for some rows — a bare
// `.join()` on a string throws and unmounts the whole sheet.
function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(Boolean).map(String)
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean)
  return []
}

interface SheetCharacter {
  name: string
  race: string
  class: string
  subclass?: string | null
  level: number
  background?: string
  alignment?: string
  avatarUrl?: string | null
  backdropUrl?: string | null
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
  abilities: Record<AbilityKey, { score: number; modifier: number }>
  savingThrowProficiencies: AbilityKey[]
  skillProficiencies: string[]
  skillExpertises: string[]
  languages?: string[] | string | null
  armorProficiencies?: string[] | string | null
  weaponProficiencies?: string[] | string | null
  toolProficiencies?: string[] | string | null
  features?: unknown
  attacks?: unknown
  species?: string
  personality?: unknown
  /** True only when a real `sheet_spellcasting` block exists. An empty `{}`
   *  leaves this false so the Spells tab is hidden entirely. */
  hasSpellcasting?: boolean
  spellcastingAbility?: string | null
  spellSaveDC?: number | null
  spellAttackBonus?: number | null
  spellCantrips?: string[]
  spellPrepared?: string[]
  spellKnown?: string[]
  spellAlwaysPrepared?: string[]
  spellSlots?: Record<string, { max?: number; used?: number }>
  spellPact?: { level?: number; max?: number; used?: number } | null
  spellFocus?: string | null
  spellRulesVersion?: string | null
}

interface SheetInventoryItem {
  id: string
  name: string
  quantity: number
  weight?: number | null
  value?: number | null
  description?: string | null
  item_type?: string
  equippable_slot?: string | null
}

interface SheetAttack {
  name: string
  type?: string
  range?: string
  hit?: string
  damage?: string
  notes?: string
}

// ----- normalizers ----------------------------------------------------------

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
      { label: "Faith", value: pick("faith", "deity") },
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

function normalizeAttacks(attacks: unknown): SheetAttack[] {
  if (!Array.isArray(attacks)) return []
  return attacks
    .map((a) => {
      if (!a || typeof a !== "object") return null
      const o = a as Record<string, unknown>
      const name = typeof o.name === "string" ? o.name : ""
      if (!name) return null
      const str = (k: string) =>
        typeof o[k] === "string" ? (o[k] as string) : o[k] != null ? String(o[k]) : undefined
      return {
        name,
        type: str("type"),
        range: str("range"),
        hit: str("hit"),
        damage: str("damage"),
        notes: str("notes"),
      }
    })
    .filter(Boolean) as SheetAttack[]
}

// Group a feature by its `source` string. A source naming the class is a class
// feature; one naming the species is a species trait; anything else is a feat.
function featureGroup(source: string | undefined, className: string, species: string): "class" | "species" | "feat" {
  const s = (source || "").toLowerCase()
  if (className && s.includes(className.toLowerCase())) return "class"
  if (species && s.includes(species.toLowerCase())) return "species"
  return "feat"
}

// The 2024 action vocabulary, printed as a reference line under the attack table.
const ACTIONS_IN_COMBAT = [
  "Attack", "Dash", "Disengage", "Dodge", "Grapple", "Help", "Hide", "Improvise",
  "Influence", "Magic", "Ready", "Search", "Shove", "Study", "Utilize",
]

const ORDINAL_LEVEL = (n: number) => {
  if (n === 0) return "Cantrip"
  const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"
  return `${n}${suffix} Level`
}

// ----- spell index (lazy) ----------------------------------------------------
// Spell entries on the character are name-only, but the canonical spells.json
// carries the level / casting time / range / effect / save each row needs. We
// pull it in with a dynamic import the first time the Spells tab opens, so the
// 377 KB dataset never ships in the main dashboard bundle.

interface SpellMeta {
  level: number
  time?: string
  range?: string
  attackRoll: boolean
  save?: string | null
  effect?: string
}

function useSpellIndex(active: boolean): Map<string, SpellMeta> | null {
  const [index, setIndex] = useState<Map<string, SpellMeta> | null>(null)
  useEffect(() => {
    if (!active || index) return
    let cancelled = false
    import("@/lib/data/spells.json")
      .then((mod) => {
        if (cancelled) return
        const arr = ((mod as { default?: unknown }).default ?? mod) as any[]
        const map = new Map<string, SpellMeta>()
        for (const s of Array.isArray(arr) ? arr : []) {
          if (s && typeof s.name === "string") {
            map.set(s.name.toLowerCase(), {
              level: typeof s.level === "number" ? s.level : 0,
              time: typeof s.cast_time === "string" ? s.cast_time : undefined,
              range: typeof s.range === "string" ? s.range : undefined,
              attackRoll: Boolean(s.attack_roll),
              save: s.save?.ability ?? null,
              effect: typeof s.effect === "string" ? s.effect : undefined,
            })
          }
        }
        setIndex(map)
      })
      .catch(() => setIndex(new Map()))
    return () => {
      cancelled = true
    }
  }, [active, index])
  return index
}

// ----- class emblem ---------------------------------------------------------

const EMBLEM_PATHS: Record<string, string> = {
  Barbarian: "M12 40 L24 8 L36 40 M17 30 H31",
  Bard: "M16 38 A7 7 0 1 0 23 31 V10 L34 14",
  Cleric: "M24 8 V40 M14 19 H34",
  Druid: "M24 40 V20 M24 20 C16 20 12 12 18 9 C22 7 24 13 24 20 C24 13 26 7 30 9 C36 12 32 20 24 20",
  Fighter: "M14 40 L34 12 M30 8 L38 16 L34 20 M18 36 L12 42",
  Monk: "M24 9 A15 15 0 1 0 24 39 A15 15 0 1 0 24 9 M24 9 V39",
  Paladin: "M24 8 L37 13 V26 C37 34 31 39 24 41 C17 39 11 34 11 26 V13 Z M24 16 V32 M18 22 H30",
  Ranger: "M12 40 L36 12 M30 10 L38 12 L36 20",
  Rogue: "M14 12 L34 36 M34 12 L14 36",
  Sorcerer: "M24 8 L28 20 L40 24 L28 28 L24 40 L20 28 L8 24 L20 20 Z",
  Warlock: "M24 40 C14 34 10 24 12 12 C18 16 30 16 36 12 C38 24 34 34 24 40 M24 22 V30",
  Wizard: "M24 8 L34 34 H14 Z M18 40 H30",
}

function ClassEmblem({ className: cls }: { className?: string }) {
  const d = EMBLEM_PATHS[cls || ""] || "M24 8 L37 13 V26 C37 34 31 39 24 41 C17 39 11 34 11 26 V13 Z"
  return (
    <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden="true" className="flex-none">
      <path d={d} fill="none" stroke="#c9a86a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ----- component ------------------------------------------------------------

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

  const [hpCurrent, setHpCurrent] = useState(character.hp?.current ?? hpMax)
  const [tempHp, setTempHp] = useState(character.hp?.temp ?? 0)
  const [inspiration, setInspiration] = useState(false)
  const [hpDelta, setHpDelta] = useState("1")
  const [notes, setNotes] = useState("")
  const [tab, setTab] = useState<"actions" | "spells" | "inventory" | "features" | "background" | "notes">("actions")
  const [backdrop, setBackdrop] = useState(0)

  // Tab-local filters/search for the rebuilt D&D-Beyond-style bodies.
  const [featureFilter, setFeatureFilter] = useState<"all" | "class" | "species" | "feat">("all")
  const [actionFilter, setActionFilter] = useState<string>("ALL")
  const [inventoryFilter, setInventoryFilter] = useState<string>("ALL")
  const [spellSearch, setSpellSearch] = useState("")
  const [spellLevelFilter, setSpellLevelFilter] = useState<number | "all">("all")

  const classSpellAbility = CLASS_SPELLCASTING_ABILITY[character.class]
  const spellAbility = (String(character.spellcastingAbility || classSpellAbility || "").toLowerCase() || null) as AbilityKey | null
  const isCaster = Boolean(spellAbility)
  // The Spells tab is shown only for a real spellcasting block. Callers that
  // set `hasSpellcasting` win; older callers fall back to the class-derived guess.
  const showSpells = character.hasSpellcasting ?? isCaster
  const derivedSpellModifier = spellAbility ? character.abilities[spellAbility]?.modifier ?? 0 : 0
  const spellSaveDC = character.spellSaveDC ?? (isCaster ? 8 + pb + derivedSpellModifier : null)
  const spellAttackBonus = character.spellAttackBonus ?? (isCaster ? pb + derivedSpellModifier : null)

  // Re-sync when a different character is loaded into the sheet.
  const identity = `${character.name}|${character.level}|${hpMax}`
  useEffect(() => {
    setHpCurrent(character.hp?.current ?? hpMax)
    setTempHp(character.hp?.temp ?? 0)
    setBackdrop(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity])

  useEffect(() => {
    if (!showSpells && tab === "spells") setTab("actions")
  }, [showSpells, tab])

  // Focus trap + escape + return focus.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const t = requestAnimationFrame(() => panelRef.current?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusable.length === 0) { e.preventDefault(); panelRef.current.focus(); return }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || active === panelRef.current)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener("keydown", onKey)
    return () => { cancelAnimationFrame(t); document.removeEventListener("keydown", onKey) }
  }, [open, onClose])

  useEffect(() => {
    if (!open && previouslyFocused.current) {
      previouslyFocused.current.focus?.()
      previouslyFocused.current = null
    }
  }, [open])

  // ---- derived -------------------------------------------------------------

  const skillBonus = (name: string, ab: AbilityKey) => {
    const key = toSkillKey(name)
    const expert = character.skillExpertises.includes(key)
    const prof = character.skillProficiencies.includes(key)
    return character.abilities[ab].modifier + (expert ? pb * 2 : prof ? pb : 0)
  }
  const skillState = (name: string): "" | "p" | "e" => {
    const key = toSkillKey(name)
    if (character.skillExpertises.includes(key)) return "e"
    if (character.skillProficiencies.includes(key)) return "p"
    return ""
  }
  const saveBonus = (ab: AbilityKey) =>
    character.abilities[ab].modifier + (character.savingThrowProficiencies.includes(ab) ? pb : 0)

  const passiveInsight = 10 + skillBonus("Insight", "wis")
  const passiveInvestigation = 10 + skillBonus("Investigation", "int")

  const senseText = useMemo(() => {
    const s = character.senses
    if (!s) return null
    if (typeof s === "string") return s
    if (typeof s === "object") return Object.values(s as Record<string, unknown>).filter(Boolean).join(" · ")
    return null
  }, [character.senses])

  const personality = normalizePersonality(character.personality)
  const features = normalizeFeatures(character.features)
  const attacks = useMemo(() => normalizeAttacks(character.attacks), [character.attacks])
  const hitDie = HIT_DICE[character.class] ?? 8

  // Lazy-load the canonical spell dataset only once the Spells tab is opened.
  const spellIndex = useSpellIndex(tab === "spells")

  const xp = character.experiencePoints ?? 0
  const lvl = Math.max(1, Math.min(20, character.level))
  const xpFloor = XP_THRESHOLDS[lvl - 1] ?? 0
  const xpNext = lvl >= 20 ? xpFloor : XP_THRESHOLDS[lvl] ?? xpFloor
  const xpPct = lvl >= 20 || xpNext === xpFloor ? 100 : Math.max(0, Math.min(100, ((xp - xpFloor) / (xpNext - xpFloor)) * 100))

  // ---- rolling -------------------------------------------------------------

  const doD20 = async (label: string, modifier: number) => {
    const result = await roll({ die: "d20", numDice: 1, modifier, label })
    announce(describeRoll(result))
  }

  const applyHeal = () => {
    const n = Math.max(0, parseInt(hpDelta, 10) || 0)
    setHpCurrent((v) => Math.min(hpMax, v + n))
  }
  const applyDamage = () => {
    let n = Math.max(0, parseInt(hpDelta, 10) || 0)
    if (tempHp > 0) {
      const absorbed = Math.min(tempHp, n)
      setTempHp(tempHp - absorbed)
      n -= absorbed
    }
    if (n > 0) setHpCurrent((v) => Math.max(0, v - n))
  }

  if (!open) return null

  const TABS: [typeof tab, string][] = [
    ["actions", "Actions"],
    ...(showSpells ? ([["spells", "Spells"]] as [typeof tab, string][]) : []),
    ["inventory", "Inventory"],
    ["features", "Features & Traits"],
    ["background", "Background"],
    ["notes", "Notes"],
  ]

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`${character.name} character sheet`}>
      <ForgeSheetTheme />
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "absolute right-0 top-0 h-full w-full overflow-y-auto outline-none",
          "md:w-[92%] md:max-w-[1320px]",
          "bg-[#0a0806] shadow-[-24px_0_60px_rgba(0,0,0,0.7)]",
          "animate-in slide-in-from-right duration-300",
        )}
      >
        <div className="aop-forge-sheet px-4 pb-16 pt-4 md:px-6">
          {/* controls */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setBackdrop((i) => (i + 1) % BACKDROPS.length)}
              className="hpanel !w-auto flex items-center gap-2 !py-1.5 !px-3 text-[11px] uppercase tracking-[0.12em]"
              title="Change the poster scene"
            >
              <Shuffle className="h-3 w-3 text-[#c9a86a]" />
              Scene · {BACKDROPS[backdrop % BACKDROPS.length].label}
            </button>
            <div className="ml-auto" />
            <button
              onClick={onClose}
              aria-label="Close character sheet"
              className="hpanel !w-auto flex items-center gap-2 !py-1.5 !px-3 text-[11px] uppercase tracking-[0.12em]"
            >
              <X className="h-3.5 w-3.5" /> Close
            </button>
          </div>

          {/* ---------- hero poster ---------- */}
          <div className="hero" style={{ backgroundImage: backdropCss(backdrop, character.backdropUrl) }}>
            <div className="hero-inner">
              <div className="hero-head">
                <div className="hbanner">
                  <ClassEmblem className={character.class} />
                  {character.avatarUrl && (
                    <img
                      src={character.avatarUrl}
                      alt=""
                      className="h-14 w-14 flex-none rounded-full border-2 border-[#c9a86a]/60 object-cover"
                      style={{ objectPosition: "center 18%" }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="hb-name">{character.name}</div>
                    <div className="hb-sub">
                      Level {character.level} {character.race} {character.class}
                      {character.subclass ? ` · ${character.subclass}` : ""}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="hgauge"><i style={{ width: `${xpPct}%` }} /></div>
                      <span className="text-[10px] tracking-[0.1em] text-[#9a8f72]">
                        {lvl >= 20 ? "MAX" : `${xp} / ${xpNext} XP`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="hchips">
                  {[
                    ["Class", character.class],
                    ["Subclass", character.subclass || "—"],
                    ["Race", character.race],
                    ["Background", character.background || "—"],
                    ["Alignment", character.alignment || "—"],
                  ].map(([k, v]) => (
                    <div className="hchip" key={k as string}>
                      <span className="k">{k}</span>
                      <span className="v">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="hero-grid">
                {/* --- column A: medallions + senses --- */}
                <div>
                  {ABILS.map((ab) => {
                    const a = character.abilities[ab]
                    const savep = character.savingThrowProficiencies.includes(ab)
                    return (
                      <button
                        key={ab}
                        className={cn("med", savep && "savep")}
                        onClick={() => doD20(`${ABILITY_NAMES[ab]} Check`, a.modifier)}
                        title={`Roll ${ABILITY_NAMES[ab]} (1d20${signed(a.modifier)})`}
                      >
                        <span className="med-score">{a.score}</span>
                        <span className="med-plaque">
                          <span className="m">{signed(a.modifier)}</span>
                          <span className="n">{ABILITY_NAMES[ab]}</span>
                        </span>
                      </button>
                    )
                  })}

                  <div className="hpanel">
                    <h4>Senses</h4>
                    <div className="hsv-row" style={{ cursor: "default" }}>
                      <span>Passive Perception</span><b className="ml-auto">{character.passivePerception}</b>
                    </div>
                    <div className="hsv-row" style={{ cursor: "default" }}>
                      <span>Passive Insight</span><b className="ml-auto">{passiveInsight}</b>
                    </div>
                    <div className="hsv-row" style={{ cursor: "default" }}>
                      <span>Passive Investigation</span><b className="ml-auto">{passiveInvestigation}</b>
                    </div>
                    {senseText && <div className="mt-1 text-[11px] text-[#9a8f72]">{senseText}</div>}
                  </div>
                </div>

                {/* --- column B: stats, saves/skills, vitals --- */}
                <div className="flex flex-col gap-3">
                  <div className="hstat-row">
                    <div className="hpanel hstat">
                      <span className="v">{character.ac}</span>
                      <span className="k">Armor Class</span>
                    </div>
                    <button
                      className="hpanel hstat"
                      onClick={() => doD20("Initiative", character.initiative ?? character.abilities.dex.modifier)}
                      title="Roll initiative"
                    >
                      <span className="v">{signed(character.initiative ?? character.abilities.dex.modifier)}</span>
                      <span className="k">Initiative</span>
                    </button>
                    <div className="hpanel hstat">
                      <span className="v">{formatSpeedValue(character.speed)}</span>
                      <span className="k">Speed (ft)</span>
                    </div>
                    <button
                      className={cn("hpanel hstat", inspiration && "on")}
                      onClick={() => setInspiration((v) => !v)}
                      title="Toggle Heroic Inspiration"
                    >
                      <span className="v">
                        {inspiration ? <Flame className="mx-auto h-6 w-6 text-[#ff6b35]" /> : <Sparkles className="mx-auto h-6 w-6 text-stone-600" />}
                      </span>
                      <span className="k">Inspiration</span>
                    </button>
                  </div>

                  <div className="hduo">
                    <div className="hpanel hsheet-panel">
                      <div className="hsplit">
                        <div>
                          <h4>Saving Throws</h4>
                          {ABILS.map((ab) => (
                            <button key={ab} className="hsv-row" onClick={() => doD20(`${ABILITY_SHORT[ab]} Save`, saveBonus(ab))}>
                              <span className={cn("hdot", character.savingThrowProficiencies.includes(ab) && "p")} />
                              <span>{ABILITY_NAMES[ab]}</span>
                              <b className="ml-auto">{signed(saveBonus(ab))}</b>
                            </button>
                          ))}
                        </div>
                        <div>
                          <h4>Skills</h4>
                          {SKILLS.map(([name, ab]) => (
                            <button key={name} className="hsk-row" onClick={() => doD20(name, skillBonus(name, ab))}>
                              <span className={cn("hdot", skillState(name))} />
                              <span className="truncate">{name}</span>
                              <b>{signed(skillBonus(name, ab))}</b>
                              <span className="ab">{ABILITY_SHORT[ab]}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="hvitals">
                      <div className="hpanel hHP hcenter">
                        <h4>Hit Points</h4>
                        <div>
                          <span className="big">{hpCurrent}</span>
                          <span className="mx"> / {hpMax}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-center gap-1.5">
                          <button
                            onClick={applyHeal}
                            className="rounded border border-[#3fb96b]/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#3fb96b] hover:bg-[#3fb96b]/10"
                          >Heal</button>
                          <input
                            value={hpDelta}
                            onChange={(e) => setHpDelta(e.target.value.replace(/[^0-9]/g, ""))}
                            inputMode="numeric"
                            aria-label="Hit point amount"
                            className="w-11 rounded border border-[#c9a86a]/40 bg-[#0b0807] px-1 py-0.5 text-center text-xs text-[#f2e8d5]"
                          />
                          <button
                            onClick={applyDamage}
                            className="rounded border border-[#d9232e]/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#d9232e] hover:bg-[#d9232e]/10"
                          >Dmg</button>
                        </div>
                      </div>

                      <div className="hpanel hcenter">
                        <h4>Temp HP</h4>
                        <div className="serif text-[20px] text-[#f2e8d5]">{tempHp}</div>
                      </div>
                      <div className="hpanel hcenter">
                        <h4>Hit Dice</h4>
                        <div className="serif text-[20px] text-[#f2e8d5]">{character.level}d{hitDie}</div>
                      </div>
                      <div className="hpanel hcenter">
                        <h4>Prof. Bonus</h4>
                        <div className="serif text-[20px] text-[#f2e8d5]">{signed(pb)}</div>
                      </div>

                      {character.conditions && character.conditions.length > 0 && (
                        <div className="hpanel">
                          <h4>Conditions</h4>
                          <div className="flex flex-wrap gap-1">
                            {character.conditions.map((c) => (
                              <span key={c} className="rounded-sm border border-[#d9232e]/50 bg-[#d9232e]/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[#e8b0b0]">
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <div className="hpanel hrow2-panel">
                      <h4>Proficiencies &amp; Languages</h4>
                      <ProfLine label="Armor" values={character.armorProficiencies} />
                      <ProfLine label="Weapons" values={character.weaponProficiencies} />
                      <ProfLine label="Tools" values={character.toolProficiencies} />
                      <ProfLine label="Languages" values={character.languages} />
                    </div>
                    <div className="hpanel hrow2-panel">
                      <h4>Features &amp; Traits</h4>
                      {features.length === 0 ? (
                        <div className="text-[12px] text-[#8f8570]">None recorded yet.</div>
                      ) : (
                        features.slice(0, 5).map((f) => (
                          <div key={f.name} className="mb-1.5 text-[12.5px]">
                            <b className="text-[#c9a86a]">{f.name}</b>
                            {f.source && <span className="text-[10px] text-[#8f8570]"> · {f.source}</span>}
                            {f.desc && <div className="text-[#ddd5c6]">{f.desc}</div>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* --- column C: personality --- */}
                <div>
                  <div className="hpanel">
                    <h4>Personality</h4>
                    {personality.length === 0 ? (
                      <div className="text-[12px] text-[#8f8570]">
                        Add traits, ideals, bonds and flaws in the character builder.
                      </div>
                    ) : (
                      personality.map((p) => (
                        <div className="pers-block" key={p.label}>
                          <span className="k">{p.label}</span>
                          <span className="v">{p.value}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ---------- parchment tab box ---------- */}
          <div className="dbx">
            <div className="dtabs">
              {TABS.map(([key, label]) => (
                <button key={key} className={cn("dtab", tab === key && "on")} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="dbx-body">
              {tab === "actions" && (
                <ActionsTab
                  attacks={attacks}
                  filter={actionFilter}
                  onFilter={setActionFilter}
                />
              )}

              {tab === "spells" && (
                <SpellsTab
                  key={identity}
                  character={character}
                  spellAbility={spellAbility}
                  spellModifier={derivedSpellModifier}
                  spellSaveDC={spellSaveDC}
                  spellAttackBonus={spellAttackBonus}
                  spellIndex={spellIndex}
                  search={spellSearch}
                  onSearch={setSpellSearch}
                  levelFilter={spellLevelFilter}
                  onLevelFilter={setSpellLevelFilter}
                  onSpellAttack={() => spellAttackBonus != null && doD20("Spell Attack", spellAttackBonus)}
                />
              )}

              {tab === "inventory" && (
                <InventoryTab
                  key={identity}
                  inventory={inventory}
                  filter={inventoryFilter}
                  onFilter={setInventoryFilter}
                  strengthScore={character.abilities.str.score}
                />
              )}

              {tab === "features" && (
                <FeaturesTab
                  features={features}
                  className={character.class}
                  species={character.species || character.race}
                  filter={featureFilter}
                  onFilter={setFeatureFilter}
                />
              )}

              {tab === "background" && (
                <>
                  <h5>{character.background || "Background"}</h5>
                  {personality.length === 0 ? (
                    <p className="muted">No personality recorded yet.</p>
                  ) : (
                    personality.map((p) => (
                      <div key={p.label} className="mb-2">
                        <b>{p.label}:</b> {p.value}
                      </div>
                    ))
                  )}
                  <div className="muted mt-3">
                    {[character.age && `Age ${character.age}`, character.height, character.weight]
                      .filter(Boolean).join(" · ") || "No physical description recorded."}
                  </div>
                </>
              )}

              {tab === "notes" && (
                <>
                  <h5>Session Notes</h5>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Scratch notes for this session…"
                    aria-label="Session notes"
                  />
                  <p className="muted mt-1">Notes are local to this browser and are not saved to the campaign.</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ----- small pieces ---------------------------------------------------------

// Filter/level chip shared by every rebuilt tab. Styled for the parchment box:
// active chip fills with the deep-red ink, inactive chips read as muted outline.
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors",
        active
          ? "border-[#9e2b25] bg-[#9e2b25] text-[#fdfaf1]"
          : "border-[#c9b88e] bg-[#fffdf6] text-[#6b6255] hover:border-[#9e2b25] hover:text-[#9e2b25]",
      )}
    >
      {label}
    </button>
  )
}

// ---- Features & Traits ------------------------------------------------------

type FeatureItem = { name: string; desc?: string; source?: string }
type FeatureFilter = "all" | "class" | "species" | "feat"

function FeaturesTab({
  features,
  className,
  species,
  filter,
  onFilter,
}: {
  features: FeatureItem[]
  className: string
  species: string
  filter: FeatureFilter
  onFilter: (f: FeatureFilter) => void
}) {
  const grouped = useMemo(() => {
    const g: Record<"class" | "species" | "feat", FeatureItem[]> = { class: [], species: [], feat: [] }
    for (const f of features) g[featureGroup(f.source, className, species)].push(f)
    return g
  }, [features, className, species])

  if (features.length === 0) return <p className="muted">None recorded yet.</p>

  const chips: [FeatureFilter, string][] = [
    ["all", "All"],
    ["class", "Class Features"],
    ["species", "Species Traits"],
    ["feat", "Feats"],
  ]
  const sections: [FeatureFilter, string, FeatureItem[]][] = [
    ["class", "Class Features", grouped.class],
    ["species", "Species Traits", grouped.species],
    ["feat", "Feats", grouped.feat],
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {chips.map(([k, l]) => (
          <Chip key={k} label={l} active={filter === k} onClick={() => onFilter(k)} />
        ))}
      </div>
      {sections.map(([key, title, list]) => {
        if (filter !== "all" && filter !== key) return null
        if (list.length === 0) return null
        return (
          <section key={key} className="mb-5">
            <h5>{title}</h5>
            {list.map((f, i) => (
              <div key={`${f.name}-${i}`} className="mb-3 border-b border-[#e6ddc6] pb-2 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <b className="text-[#4a4438]">{f.name}</b>
                  {f.source && <span className="muted text-[10px]">{f.source}</span>}
                </div>
                {f.desc && <div className="mt-1 whitespace-pre-line text-[#4a4438]">{f.desc}</div>}
              </div>
            ))}
          </section>
        )
      })}
    </>
  )
}

// ---- Actions ----------------------------------------------------------------

function ActionsTab({
  attacks,
  filter,
  onFilter,
}: {
  attacks: SheetAttack[]
  filter: string
  onFilter: (f: string) => void
}) {
  const chips = ["ALL", "ATTACK", "ACTION", "BONUS ACTION", "REACTION", "OTHER", "LIMITED USE"]
  // Only attack entries are backed by `sheet_attacks`; the other categories have
  // no data to draw from, so they show an honest empty state rather than faking rows.
  const showAttacks = filter === "ALL" || filter === "ATTACK"

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h5 className="!mb-0">Actions</h5>
        <span className="text-[11px] uppercase tracking-[0.1em] text-[#6b6255]">Attacks per Action: 1</span>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <Chip key={c} label={c} active={filter === c} onClick={() => onFilter(c)} />
        ))}
      </div>

      {showAttacks && attacks.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Attack</th>
              <th>Range</th>
              <th>Hit/DC</th>
              <th>Damage</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {attacks.map((a, i) => (
              <tr key={`${a.name}-${i}`}>
                <td>
                  <b className="text-[#4a4438]">{a.name}</b>
                  {a.type && <div className="text-[10px] text-[#8a7f6d]">{a.type}</div>}
                </td>
                <td>{a.range || "—"}</td>
                <td>
                  {a.hit ? (
                    <span className="inline-block rounded border border-[#c9b88e] bg-white/60 px-2 py-0.5 font-semibold">{a.hit}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {a.damage ? (
                    <span className="inline-block rounded border border-[#c9b88e] bg-white/60 px-2 py-0.5 font-semibold">{a.damage}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{a.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">{attacks.length === 0 ? "No attacks recorded." : "No entries in this category."}</p>
      )}

      <h5 className="mt-5">Actions in Combat</h5>
      <p className="text-[12px] leading-relaxed text-[#4a4438]">{ACTIONS_IN_COMBAT.join(", ")}</p>
    </>
  )
}

// ---- Inventory --------------------------------------------------------------

function InventoryTab({
  inventory,
  filter,
  onFilter,
  strengthScore,
}: {
  inventory: SheetInventoryItem[]
  filter: string
  onFilter: (f: string) => void
  strengthScore: number
}) {
  // `inventory_items` carries no equipped flag, so ACTIVE is tracked locally.
  const [equipped, setEquipped] = useState<Record<string, boolean>>({})

  const totalWeight = inventory.reduce(
    (sum, it) => sum + (Number(it.weight) || 0) * (Number(it.quantity) || 1),
    0,
  )
  // 5e optional encumbrance variant, keyed off Strength score.
  const encumbrance =
    totalWeight > strengthScore * 10 ? "Heavily Encumbered" : totalWeight > strengthScore * 5 ? "Encumbered" : "Unencumbered"

  const chips = ["ALL", "EQUIPMENT", "BACKPACK", "ATTUNEMENT", "OTHER POSSESSIONS"]
  const matches = (it: SheetInventoryItem) => {
    switch (filter) {
      case "EQUIPMENT":
        return Boolean(it.equippable_slot)
      case "BACKPACK":
      case "OTHER POSSESSIONS":
        return !it.equippable_slot
      case "ATTUNEMENT":
        return /attun/i.test(it.description || "")
      default:
        return true
    }
  }
  const rows = inventory.filter(matches)

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h5 className="!mb-0">Inventory</h5>
        <span className="text-[11px] uppercase tracking-[0.1em] text-[#6b6255]">
          Weight Carried: {Math.round(totalWeight * 10) / 10} lb. · {encumbrance}
        </span>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <Chip key={c} label={c} active={filter === c} onClick={() => onFilter(c)} />
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="muted">Nothing to show.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Active</th>
              <th>Name</th>
              <th>Weight</th>
              <th>Qty</th>
              <th>Cost (GP)</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => (
              <tr key={it.id}>
                <td>
                  {it.equippable_slot ? (
                    <input
                      type="checkbox"
                      checked={Boolean(equipped[it.id])}
                      onChange={() => setEquipped((s) => ({ ...s, [it.id]: !s[it.id] }))}
                      aria-label={`Equip ${it.name}`}
                      className="h-3.5 w-3.5 accent-[#9e2b25]"
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <b className="text-[#4a4438]">{it.name}</b>
                  {it.item_type && <div className="text-[10px] capitalize text-[#8a7f6d]">{it.item_type}</div>}
                </td>
                <td>{it.weight ?? "—"}</td>
                <td>{it.quantity}</td>
                <td>{it.value ?? "—"}</td>
                <td>{it.description || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

// ---- Spells -----------------------------------------------------------------

function SpellsTab({
  character,
  spellAbility,
  spellModifier,
  spellSaveDC,
  spellAttackBonus,
  spellIndex,
  search,
  onSearch,
  levelFilter,
  onLevelFilter,
  onSpellAttack,
}: {
  character: SheetCharacter
  spellAbility: AbilityKey | null
  spellModifier: number
  spellSaveDC: number | null
  spellAttackBonus: number | null
  spellIndex: Map<string, SpellMeta> | null
  search: string
  onSearch: (s: string) => void
  levelFilter: number | "all"
  onLevelFilter: (l: number | "all") => void
  onSpellAttack: () => void
}) {
  const slots = character.spellSlots || {}

  // Local, interactive slot tracking so the pips and the USE buttons agree.
  const [slotUsed, setSlotUsed] = useState<Record<number, number>>(() => {
    const m: Record<number, number> = {}
    for (const [k, v] of Object.entries(slots)) {
      const n = Number(k)
      if (!Number.isNaN(n)) m[n] = Number(v?.used ?? 0)
    }
    return m
  })

  // Merge every spell source into a single de-duplicated list, resolving each
  // spell's level (and its casting details) from the canonical dataset. Names
  // that aren't in the dataset fall back to level 1 (or 0 for cantrips).
  const entries = useMemo(() => {
    const seen = new Map<string, { name: string; level: number; meta?: SpellMeta }>()
    const add = (names: string[] | undefined, forced?: number) => {
      for (const raw of names || []) {
        const name = String(raw).trim()
        if (!name) continue
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        const meta = spellIndex?.get(key)
        const level = forced != null ? forced : meta?.level ?? 1
        seen.set(key, { name, level, meta })
      }
    }
    add(character.spellCantrips, 0)
    add(character.spellPrepared)
    add(character.spellAlwaysPrepared)
    add(character.spellKnown)
    return Array.from(seen.values())
  }, [character.spellCantrips, character.spellPrepared, character.spellAlwaysPrepared, character.spellKnown, spellIndex])

  const slotLevels = Object.keys(slots)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
  const levels = Array.from(new Set([0, ...entries.map((e) => e.level), ...slotLevels])).sort((a, b) => a - b)

  const q = search.trim().toLowerCase()
  const inLevelFilter = (lvl: number) => levelFilter === "all" || levelFilter === lvl

  const hitDc = (meta?: SpellMeta) => {
    if (!meta) return "—"
    if (meta.attackRoll && spellAttackBonus != null) return signed(spellAttackBonus)
    if (meta.save) return `DC ${spellSaveDC ?? "—"} ${meta.save.slice(0, 3).toUpperCase()}`
    return "—"
  }

  const castSlot = (lvl: number, max: number) =>
    setSlotUsed((s) => ({ ...s, [lvl]: Math.min(max, (s[lvl] ?? 0) + 1) }))
  const setPip = (lvl: number, index: number, used: number) =>
    setSlotUsed((s) => ({ ...s, [lvl]: index < used ? index : index + 1 }))

  return (
    <>
      {/* header stats */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <SpellHeaderStat label={`${spellAbility?.toUpperCase() || "—"} Mod`} value={signed(spellModifier)} />
        <button
          type="button"
          onClick={onSpellAttack}
          disabled={spellAttackBonus == null}
          className="rounded border border-[#c9b88e] bg-white/55 px-3 py-2 text-center hover:border-[#9e2b25] disabled:opacity-50"
        >
          <span className="block text-[9px] uppercase tracking-wider text-[#8a7f6d]">Spell Attack</span>
          <b className="text-[16px] text-[#4a4438]">{spellAttackBonus != null ? signed(spellAttackBonus) : "—"}</b>
        </button>
        <SpellHeaderStat label="Save DC" value={spellSaveDC ?? "—"} />
      </div>

      {/* search + level chips */}
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search spells…"
        aria-label="Search spells"
        className="mb-3 w-full rounded border border-[#c9b88e] bg-[#fffdf6] px-2.5 py-1.5 text-[12px] text-[#4a4438] placeholder:text-[#a89e88]"
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Chip label="All" active={levelFilter === "all"} onClick={() => onLevelFilter("all")} />
        {levels.map((lvl) => (
          <Chip
            key={lvl}
            label={lvl === 0 ? "Cantrip" : `Lv ${lvl}`}
            active={levelFilter === lvl}
            onClick={() => onLevelFilter(lvl)}
          />
        ))}
      </div>

      {!spellIndex && <p className="muted mb-3">Loading spell details…</p>}

      {levels.filter(inLevelFilter).map((lvl) => {
        const rows = entries
          .filter((e) => e.level === lvl && (!q || e.name.toLowerCase().includes(q)))
          .sort((a, b) => a.name.localeCompare(b.name))
        const max = Number(slots[String(lvl)]?.max ?? 0)
        const used = slotUsed[lvl] ?? 0
        // Drop empty non-cantrip levels that have no slots either — nothing to show.
        if (rows.length === 0 && max === 0 && lvl !== 0) return null
        return (
          <section key={lvl} className="mb-4">
            <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-[#c9b88e] pb-1">
              <h5 className="!mb-0">{ORDINAL_LEVEL(lvl)}</h5>
              {max > 0 && (
                <div className="flex items-center gap-1" role="group" aria-label={`Level ${lvl} spell slots`}>
                  {Array.from({ length: max }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPip(lvl, i, used)}
                      aria-label={`Slot ${i + 1} of ${max} ${i < used ? "used" : "available"}`}
                      aria-pressed={i < used}
                      className={cn(
                        "h-3.5 w-3.5 rounded-sm border transition-colors",
                        i < used ? "border-[#9e2b25] bg-[#9e2b25]" : "border-[#c9b88e] bg-transparent hover:border-[#9e2b25]",
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
            {rows.length === 0 ? (
              max > 0 ? (
                <p className="muted">
                  You do not have any spells at this level available, but you can cast lower level spells using these
                  slots.
                </p>
              ) : null
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Time</th>
                    <th>Range</th>
                    <th>Hit/DC</th>
                    <th>Effect</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.name}>
                      <td>
                        <b className="text-[#4a4438]">{e.name}</b>
                      </td>
                      <td>{e.meta?.time || "—"}</td>
                      <td>{e.meta?.range || "—"}</td>
                      <td>{hitDc(e.meta)}</td>
                      <td className="max-w-[220px]">{e.meta?.effect || "—"}</td>
                      <td>
                        {lvl === 0 ? (
                          <span className="rounded border border-[#c9b88e] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[#6b6255]">
                            At Will
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => castSlot(lvl, max)}
                            disabled={max === 0 || used >= max}
                            className="rounded border border-[#9e2b25] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#9e2b25] transition-colors hover:bg-[#9e2b25] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Use
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )
      })}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#c9b88e] pt-3">
        <p className="muted">
          {character.spellRulesVersion ? `Rules: ${character.spellRulesVersion}` : "Manage spell choices in The Forge."}
        </p>
        <a
          href="/forge"
          className="rounded border border-[#9e2b25] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#9e2b25] hover:bg-[#9e2b25] hover:text-white"
        >
          Manage Spells in The Forge
        </a>
      </div>
    </>
  )
}

function SpellHeaderStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-[#c9b88e] bg-white/55 px-3 py-2 text-center">
      <span className="block text-[9px] uppercase tracking-wider text-[#8a7f6d]">{label}</span>
      <b className="text-[16px] text-[#4a4438]">{value}</b>
    </div>
  )
}

// Defensive on purpose: these come from character columns the sheet treats as
// arrays but which are plain TEXT for some rows. A bare `.join()` throws and
// unmounts the entire sheet.
function ProfLine({ label, values }: { label: string; values?: string[] | string | null }) {
  const text = asList(values).join(", ")
  return (
    <div className="text-[12.5px]">
      <b className="text-[#c9a86a]">{label}:</b>{" "}
      <span className="text-[#ddd5c6]">{text || "None"}</span>
    </div>
  )
}
