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
import { X, Dices, Flame, Sparkles, Shuffle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDice, describeRoll } from "@/components/dice/dice-provider"
import { ForgeSheetTheme, BACKDROPS, backdropCss, backdropIndexFor } from "./forge-sheet-theme"

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
  const [backdrop, setBackdrop] = useState(() => backdropIndexFor(character.name || "character"))

  const isCaster = Boolean(character.spellcastingAbility)

  // Re-sync when a different character is loaded into the sheet.
  const identity = `${character.name}|${character.level}|${hpMax}`
  useEffect(() => {
    setHpCurrent(character.hp?.current ?? hpMax)
    setTempHp(character.hp?.temp ?? 0)
    setBackdrop(backdropIndexFor(character.name || "character"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity])

  useEffect(() => {
    if (!isCaster && tab === "spells") setTab("actions")
  }, [isCaster, tab])

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
  const hitDie = HIT_DICE[character.class] ?? 8

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
    ...(isCaster ? ([["spells", "Spells"]] as [typeof tab, string][]) : []),
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
                <>
                  <h5>Standard Actions</h5>
                  <div className="flex flex-wrap gap-2">
                    {["Attack", "Dash", "Disengage", "Dodge", "Help", "Hide", "Ready", "Search", "Use an Object"].map((a) => (
                      <span key={a} className="rounded border border-[#c9b88e] px-2 py-1 text-[12px]">{a}</span>
                    ))}
                  </div>
                  <h5 className="mt-4">Rolls</h5>
                  <div className="flex flex-wrap gap-2">
                    <RollChip label="Initiative" onClick={() => doD20("Initiative", character.initiative ?? character.abilities.dex.modifier)} />
                    {ABILS.map((ab) => (
                      <RollChip key={ab} label={`${ABILITY_SHORT[ab]} Save`} onClick={() => doD20(`${ABILITY_SHORT[ab]} Save`, saveBonus(ab))} />
                    ))}
                  </div>
                </>
              )}

              {tab === "spells" && (
                <>
                  <h5>Spellcasting</h5>
                  <table>
                    <tbody>
                      <tr><td>Ability</td><td>{String(character.spellcastingAbility || "—").toUpperCase()}</td></tr>
                      <tr><td>Save DC</td><td>{character.spellSaveDC ?? "—"}</td></tr>
                      <tr><td>Attack Bonus</td><td>{character.spellAttackBonus != null ? signed(character.spellAttackBonus) : "—"}</td></tr>
                    </tbody>
                  </table>
                  <p className="muted mt-3">Prepared spells and slots live on the dashboard rail.</p>
                </>
              )}

              {tab === "inventory" && (
                <>
                  <h5>Carried</h5>
                  {inventory.length === 0 ? (
                    <p className="muted">Nothing carried.</p>
                  ) : (
                    <table>
                      <thead><tr><th>Item</th><th>Qty</th><th>Weight</th><th>Slot</th></tr></thead>
                      <tbody>
                        {inventory.map((it) => (
                          <tr key={it.id}>
                            <td>{it.name}</td>
                            <td>{it.quantity}</td>
                            <td>{it.weight ?? "—"}</td>
                            <td>{it.equippable_slot || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}

              {tab === "features" && (
                <>
                  <h5>Features &amp; Traits</h5>
                  {features.length === 0 ? (
                    <p className="muted">None recorded yet.</p>
                  ) : (
                    features.map((f) => (
                      <div key={f.name} className="mb-3">
                        <b>{f.name}</b>
                        {f.source && <span className="muted"> · {f.source}</span>}
                        {f.desc && <div>{f.desc}</div>}
                      </div>
                    ))
                  )}
                </>
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

function RollChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded border border-[#c9b88e] bg-[#fffdf6] px-2.5 py-1 text-[12px] text-[#4a4438] transition-colors hover:border-[#9e2b25] hover:text-[#9e2b25]"
    >
      <Dices className="h-3 w-3" />
      {label}
    </button>
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
