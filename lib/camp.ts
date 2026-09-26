// lib/camp.ts
//
// Ashes of Prometheus — the Camp context: a menu of time.
// Spec: claude_Camp_Module.md (2026-09-26). Sits beside lib/long-rest.ts
// (the night itself) and lib/exhaustion.ts (hunger). This file owns everything
// the party can DO at the fire that those two do not: the short rest, the
// watch, foraging, levelling, crafting, and the talk that moves relationships.
//
// Pure functions. No database, no rendering. Seeded rng in, facts out. The
// chat route owns the rows — same split as lib/long-rest and lib/game-context.
//
// EVERY NUMBER HERE HAS A SOURCE, cited inline as one of:
//   SRD 5.1        — campaign_books.slug 'srd-5-1', search_srd()
//   OotA-Enc p.N   — Out of the Abyss, D&D Encounters (campaign_books 'oota-encounters')
//   DMG p.N        — Dungeon Master's Guide (Sam owns it; NOT in the SRD, flagged)
//   HOUSE RULE     — Sam's call, dated. Explicit, never accidental.
// Nothing is improvised. Where a rule is missing the function says so in its
// `flags` rather than filling the gap.

import {
  abilityMod,
  proficiencyForLevel,
  resolveSkillCheck,
  type CheckResult,
  type Rng,
  type SheetSlice,
} from "./game-context"

// ---------------------------------------------------------------------------
// The menu
// ---------------------------------------------------------------------------

/**
 * What one character can do with a camp. `sleep` is the long rest itself
 * (lib/long-rest.ts) and is always available; the rest compete for
 * `characters.rest_actions_remaining`.
 */
export type CampAction = "watch" | "forage" | "tend" | "talk" | "perform" | "craft" | "level_up" | "sleep"

/**
 * HOUSE RULE (Sam, 2026-08-20 Playable Layer §7, confirmed 2026-09-26): each
 * character gets ONE camp action per long rest besides sleeping. It is what
 * makes "who forages, who keeps watch, who talks to whom" a decision. The
 * SRD has no such budget — downtime there is unbounded. Column already exists
 * (`characters.rest_actions_remaining`, unused until now).
 */
export const CAMP_ACTIONS_PER_REST = 1

export function canTakeCampAction(remaining: number | null | undefined, action: CampAction): { ok: boolean; reason: string } {
  if (action === "sleep") return { ok: true, reason: "sleeping is never a spent action" }
  const left = Math.max(0, Math.trunc(Number(remaining) || 0))
  return left > 0
    ? { ok: true, reason: `${left} camp action${left === 1 ? "" : "s"} left` }
    : { ok: false, reason: "no camp actions left this rest" }
}

// ---------------------------------------------------------------------------
// Hit Dice
// ---------------------------------------------------------------------------

/** "1d8" / "5d12" as `characters.sheet_hit_dice` stores it → die size, or null. */
export function parseHitDie(sheetHitDice: string | null | undefined): number | null {
  const m = String(sheetHitDice ?? "").match(/d\s*(\d+)/i)
  if (!m) return null
  const n = Number(m[1])
  return [6, 8, 10, 12].includes(n) ? n : null
}

// ---------------------------------------------------------------------------
// Short rest — SRD 5.1, Adventuring: Resting, Short Rest
// ---------------------------------------------------------------------------
//
//   "A short rest is a period of downtime, at least 1 hour long ... A
//    character can spend one or more Hit Dice at the end of a short rest, up
//    to the character's maximum number of Hit Dice, which is equal to the
//    character's level. For each Hit Die spent in this way, the player rolls
//    the die and adds the character's Constitution modifier to it. The
//    character regains hit points equal to the total (minimum of 0). The
//    player can decide to spend an additional Hit Die after each roll."
//
// Song of Rest (SRD 5.1, Classes: Bard, 2nd level): anyone who spends at least
// one Hit Die regains an extra 1d6 (d8 at 9th, d10 at 13th, d12 at 17th).
// The bard need not spend a die to sing; they DO get the bonus if they spend one.
//
// Pact Magic (SRD 5.1, Classes: Warlock): "regain all expended spell slots
// when you finish a short or long rest." Read from sheet_spellcasting.pact.
//
// NOT implemented, reported in `flags` instead: every other class feature
// that resets on a short rest (Channel Divinity, Second Wind, Action Surge,
// Ki, Wild Shape, Arcane Recovery...). They live as free text in
// sheet_features and there is no column to reset. The DM narrates them; this
// file refuses to guess at them.

export const SHORT_REST_MINUTES = 60

export function songOfRestDie(bardLevel: number): number {
  if (bardLevel >= 17) return 12
  if (bardLevel >= 13) return 10
  if (bardLevel >= 9) return 8
  if (bardLevel >= 2) return 6
  return 0
}

export interface ShortRester {
  id: string
  name: string
  level: number
  hp: number
  hpMax: number
  conScore: number
  /** `characters.sheet_hit_dice`, e.g. "3d8". */
  sheetHitDice: string | null
  /** `characters.hit_dice_remaining`. Null = sheet does not track them. */
  hitDiceRemaining: number | null
  /** How many dice this character chooses to spend now. Clamped to what they have. */
  spend: number
  /** `sheet_spellcasting.pact === true` — warlock slots come back. */
  pact?: boolean
  /** Bard class level, when this character is a bard (0 otherwise). */
  bardLevel?: number
  /** Dying characters cannot rest — handled the same way lib/long-rest does. */
  dying?: boolean
}

export interface ShortRestOutcome {
  id: string
  name: string
  diceSpent: number
  rolls: number[]
  songOfRest: number | null
  healed: number
  hp: number
  hitDiceRemaining: number | null
  pactSlotsRestored: boolean
  note: string
}

export interface ShortRestResult {
  /** Who sang, if anyone (highest-level bard in the party). */
  bard: { id: string; name: string; die: number } | null
  outcomes: ShortRestOutcome[]
  /** Things the DM must resolve by hand — never silently skipped. */
  flags: string[]
  minutes: number
}

export function shortRest(party: ShortRester[], rng: Rng): ShortRestResult {
  const flags: string[] = []
  const singer = party
    .filter((p) => (p.bardLevel ?? 0) >= 2 && !p.dying && p.hp > 0)
    .sort((a, b) => (b.bardLevel ?? 0) - (a.bardLevel ?? 0))[0]
  const bard = singer ? { id: singer.id, name: singer.name, die: songOfRestDie(singer.bardLevel ?? 0) } : null

  const outcomes = party.map<ShortRestOutcome>((p) => {
    const die = parseHitDie(p.sheetHitDice)
    const con = abilityMod(p.conScore)
    const base = (extra: Partial<ShortRestOutcome>, note: string): ShortRestOutcome => ({
      id: p.id, name: p.name, diceSpent: 0, rolls: [], songOfRest: null, healed: 0, hp: p.hp,
      hitDiceRemaining: p.hitDiceRemaining, pactSlotsRestored: false, note, ...extra,
    })

    if (p.dying) return base({}, `${p.name} is dying and cannot rest — stabilise them first.`)
    if (p.hp <= 0) return base({}, `${p.name} is at 0 hit points and gains nothing from a short rest.`)

    // Pact slots come back whether or not a die is spent.
    const pactSlotsRestored = !!p.pact

    if (p.hitDiceRemaining == null) {
      flags.push(`${p.name}: hit_dice_remaining is null — sheet does not track Hit Dice; nothing spent.`)
      return base({ pactSlotsRestored }, `${p.name} rests (no Hit Dice tracked on this sheet).`)
    }
    if (die == null) {
      flags.push(`${p.name}: sheet_hit_dice "${p.sheetHitDice}" is not a d6/d8/d10/d12 — cannot roll.`)
      return base({ pactSlotsRestored }, `${p.name} rests, but the sheet's Hit Die is unreadable.`)
    }

    const want = Math.max(0, Math.trunc(p.spend))
    // No point spending dice at full hit points; the player's intent is clamped to what they own.
    const spend = p.hp >= p.hpMax ? 0 : Math.min(want, p.hitDiceRemaining)
    const rolls: number[] = []
    let healed = 0
    for (let i = 0; i < spend; i++) {
      const r = 1 + Math.floor(rng() * die)
      rolls.push(r)
      healed += Math.max(0, r + con) // "(minimum of 0)" per die
    }
    let song: number | null = null
    if (spend > 0 && bard) {
      song = 1 + Math.floor(rng() * bard.die)
      healed += song
    }
    const hp = Math.min(p.hpMax, p.hp + healed)
    const actuallyHealed = hp - p.hp
    const parts = [
      spend > 0 ? `spends ${spend} Hit Di${spend === 1 ? "e" : "ce"} (d${die}: ${rolls.join("+")}, CON ${con >= 0 ? "+" : ""}${con} each)` : "spends no Hit Dice",
      song != null ? `+ Song of Rest d${bard!.die}(${song})` : "",
      actuallyHealed > 0 ? `→ regains ${actuallyHealed} (${hp}/${p.hpMax})` : "",
      pactSlotsRestored ? "pact slots restored" : "",
    ].filter(Boolean)
    return base(
      { diceSpent: spend, rolls, songOfRest: song, healed: actuallyHealed, hp, hitDiceRemaining: p.hitDiceRemaining - spend, pactSlotsRestored },
      `${p.name} ${parts.join(", ")}.`,
    )
  })

  flags.push(
    "Class features that reset on a short rest (Channel Divinity, Second Wind, Action Surge, Ki, Wild Shape, Arcane Recovery) are free text in sheet_features — the DM resets them; this file does not.",
  )
  return { bard, outcomes, flags, minutes: SHORT_REST_MINUTES }
}

// ---------------------------------------------------------------------------
// The watch — interruption comes from the node, not from a special case
// ---------------------------------------------------------------------------
//
// OotA-Enc p.30 "Random Encounters" (encounter_tables.table_key
// 'underdark_random', d20): 1–13 nothing, 14–15 terrain, 16–17 creatures,
// 18–20 terrain with creatures. Creatures then roll on 'underdark_creature'
// (p.32), which ALREADY carries the positive tail Sam asked for: 17 Society of
// Brilliance, 19–20 Traders. No homebrew table is needed and none is added.
//
// The rows are passed IN from encounter_table_rows so this file can never
// invent an entry (see the dnd-5e skill: fake tables have reached production
// before). If the rows for a key are missing, the answer is "no table", not a
// guess.

export interface EncounterRow {
  table_key: string
  roll_min: number
  roll_max: number
  result: string
  detail?: unknown
}

export interface WatchResult {
  tableKey: string
  die: number
  roll: number
  result: string | null
  detail: unknown
  /** Lowercase result — 'no encounter', 'traders' etc. — for the router. */
  kind: "none" | "terrain" | "creatures" | "terrain_creatures" | "other"
  note: string
}

export function rollEncounterTable(rows: EncounterRow[], tableKey: string, die: number, rng: Rng): WatchResult {
  const roll = 1 + Math.floor(rng() * die)
  const hit = rows.find((r) => r.table_key === tableKey && roll >= r.roll_min && roll <= r.roll_max)
  const text = hit?.result ?? null
  const lc = (text ?? "").toLowerCase()
  const kind: WatchResult["kind"] =
    !text ? "other"
    : lc.startsWith("no encounter") ? "none"
    : lc.includes("terrain") && lc.includes("creature") ? "terrain_creatures"
    : lc.startsWith("terrain") ? "terrain"
    : lc.includes("creature") ? "creatures"
    : "other"
  return {
    tableKey, die, roll, result: text, detail: hit?.detail ?? null, kind,
    note: text ? `d${die}(${roll}) on ${tableKey}: ${text}` : `d${die}(${roll}) on ${tableKey}: NO ROW — table rows missing, DM rules it`,
  }
}

/**
 * One check per long rest at the fire, as OotA-Enc p.32 does for the rest
 * near the drow warning sign ("if the characters take a long rest ... roll a
 * d20 ... at the end of their rest"). The node decides WHICH table: pass the
 * key from travel_nodes.metadata.encounter_table, defaulting to the Underdark
 * random table. A node with metadata.safe = true rolls nothing — safety is a
 * property of where you camped, not a special case.
 */
export function resolveWatch(
  node: { safe?: boolean; encounterTable?: string | null },
  rows: EncounterRow[],
  rng: Rng,
  opts: { creatureTable?: string } = {},
): { interrupted: boolean; first: WatchResult | null; creature: WatchResult | null; note: string } {
  if (node.safe) return { interrupted: false, first: null, creature: null, note: "Safe camp: no encounter check." }
  const key = node.encounterTable ?? "underdark_random"
  const die = rows.find((r) => r.table_key === key) ? Math.max(...rows.filter((r) => r.table_key === key).map((r) => r.roll_max)) : 20
  const first = rollEncounterTable(rows, key, die, rng)
  let creature: WatchResult | null = null
  if (first.kind === "creatures" || first.kind === "terrain_creatures") {
    const ck = opts.creatureTable ?? "underdark_creature"
    const cdie = Math.max(20, ...rows.filter((r) => r.table_key === ck).map((r) => r.roll_max))
    creature = rollEncounterTable(rows, ck, cdie, rng)
  }
  const interrupted = first.kind !== "none"
  return {
    interrupted, first, creature,
    note: [first.note, creature?.note].filter(Boolean).join(" → "),
  }
}

// ---------------------------------------------------------------------------
// Foraging — OotA-Enc p.25 + DMG p.111
// ---------------------------------------------------------------------------
//
// OotA-Enc p.25: "A foraging character makes a Wisdom (Survival) check. The
// DC is typically 15, but might be as high as 20 in some parts of the
// Underdark." Fast pace forbids foraging; slow pace improves it (p.24).
//
// DMG p.111 (NOT SRD — Sam owns the DMG; the OotA guide p.8 points here):
// on a success the forager finds 1d6 + WIS modifier pounds of food and the
// same in gallons of water. One person-day = 1 lb food + 1 gal water
// (SRD 5.1, Adventuring: Food and Water), so the yield IS the number of
// `party_supplies` added. Half yield for food-only or water-only sites is a
// DM ruling, not modelled.
//
// HOMEBREW READING (flagged): "improved foraging" at slow pace is read as
// advantage on the check. The book does not say how much better. Sam's call.

export type Pace = "fast" | "normal" | "slow"

export interface ForageResult {
  actor: string
  allowed: boolean
  check: CheckResult | null
  /** Person-days of food+water found → add to party_supplies.supplies. */
  supplies: number
  yieldRoll: number | null
  note: string
  flags: string[]
}

export function forage(sheet: SheetSlice, rng: Rng, opts: { dc?: number; pace?: Pace } = {}): ForageResult {
  const dc = opts.dc ?? 15
  const pace = opts.pace ?? "normal"
  const flags = ["Yield formula is DMG p.111 (1d6 + WIS), not SRD. Slow-pace advantage is a homebrew reading of 'improved foraging'."]
  if (pace === "fast") {
    return { actor: sheet.name, allowed: false, check: null, supplies: 0, yieldRoll: null, note: `${sheet.name} cannot forage at a fast pace (OotA-Enc p.24).`, flags }
  }
  const check = resolveSkillCheck(sheet, "survival", dc, rng, { advantage: pace === "slow" ? 1 : 0 })
  if (!check.success) {
    return { actor: sheet.name, allowed: true, check, supplies: 0, yieldRoll: null, note: `${sheet.name} forages and finds nothing: ${check.arithmetic}.`, flags }
  }
  const d6 = 1 + Math.floor(rng() * 6)
  const wis = abilityMod(sheet.wis_score)
  const supplies = Math.max(0, d6 + wis)
  return {
    actor: sheet.name, allowed: true, check, supplies, yieldRoll: d6,
    note: `${sheet.name} forages: ${check.arithmetic} → finds d6(${d6}) + WIS(${wis >= 0 ? "+" : ""}${wis}) = ${supplies} day${supplies === 1 ? "" : "s"} of food and water.`,
    flags,
  }
}

// ---------------------------------------------------------------------------
// Levelling — SRD 5.1, Characterization: Beyond 1st Level
// ---------------------------------------------------------------------------
//
// HOUSE RULE (Sam, 2026-08-20, Playable Layer §7): level-ups happen at camp.
// The SRD lets you level anywhere; here the fire is the only place, with
// three location-gated exceptions (school of magic, temple, patron/deity)
// that a node may grant via metadata.allows_level_up = true. This is a rule,
// not an accident, so the gate is a function the route must call.
//
// "Each time you gain a level, you gain 1 additional Hit Die. Roll that Hit
//  Die, add your Constitution modifier to the roll, and add the total to your
//  hit point maximum. Alternatively, you can use the fixed value shown in your
//  class entry, which is the average result of the die roll (rounded up)."
//
// The PHB adds "(minimum of 1)" per level; the SRD text omits it. Applied
// here as the PHB reading — a negative-CON caster rolling a 1 losing hit
// points on level-up is not a rule anyone plays. Flagged.
//
// What this DOES: level, proficiency bonus, Hit Dice, hp_max, xp_to_next, and
// the slot table for the five SRD full casters through level 10 (the same
// table lib/game-data.ts and the dnd-5e skill already carry).
// What it REFUSES: multiclassed sheets (Freía is Rogue 3 / Warlock 2 — which
// class levels is a player choice with its own prerequisites, SRD
// "Multiclassing"); subclass features, ASIs and spells known, which it lists
// as `pendingChoices` for the players to make at the fire.

export const XP_THRESHOLDS: number[] = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
] // index = level - 1 (SRD 5.1, Character Advancement)

export function levelForXp(xp: number): number {
  let lvl = 1
  for (let i = 1; i < XP_THRESHOLDS.length; i++) if (xp >= XP_THRESHOLDS[i]) lvl = i + 1
  return lvl
}

export function xpToNext(level: number): number {
  return level >= 20 ? 0 : XP_THRESHOLDS[level] // threshold of level+1
}

/** SRD full-caster slots by class level, 1..10. Beyond 10: flagged manual. */
export const FULL_CASTER_SLOTS: Record<number, number[]> = {
  1: [2], 2: [3], 3: [4, 2], 4: [4, 3], 5: [4, 3, 2], 6: [4, 3, 3], 7: [4, 3, 3, 1],
  8: [4, 3, 3, 2], 9: [4, 3, 3, 3, 1], 10: [4, 3, 3, 3, 2],
}
export const FULL_CASTERS = new Set(["bard", "cleric", "druid", "sorcerer", "wizard"])

/** ASI levels per SRD class table. Everyone: 4, 8, 12, 16, 19. Extras noted. */
export const ASI_LEVELS: Record<string, number[]> = {
  default: [4, 8, 12, 16, 19],
  fighter: [4, 6, 8, 12, 14, 16, 19],
  rogue: [4, 8, 10, 12, 16, 19],
}

export function isMulticlass(cls: string | null | undefined): boolean {
  return /\d.*\/|\//.test(String(cls ?? ""))
}

export interface LevelUpInput {
  name: string
  class: string | null
  level: number
  xp: number
  hpMax: number
  conScore: number
  sheetHitDice: string | null
  hitDiceRemaining: number | null
  /** `sheet_spellcasting.slots` as stored, or null for non-casters. */
  slots: Record<string, { max?: number; used?: number }> | null
  /** "roll" uses the dice roller (never lose it); "fixed" is the SRD average. */
  method: "roll" | "fixed"
}

export interface LevelUpOutcome {
  ok: boolean
  reason: string
  level: number
  hpMax: number
  hpGain: number
  hpRoll: number | null
  proficiencyBonus: number
  sheetHitDice: string | null
  hitDiceRemaining: number | null
  xpToNext: number
  slots: Record<string, { max: number; used: number }> | null
  pendingChoices: string[]
  flags: string[]
}

export function canLevelUp(c: { xp: number; level: number }): boolean {
  return levelForXp(c.xp) > c.level && c.level < 20
}

/** The house-rule gate. Camp, or a node that explicitly allows it. */
export function levelUpAllowedHere(context: string, node: { allowsLevelUp?: boolean } = {}): { ok: boolean; reason: string } {
  if (context === "camp") return { ok: true, reason: "at camp (house rule: level-ups happen by the fire)" }
  if (node.allowsLevelUp) return { ok: true, reason: "node allows level-up (school, temple, or patron — house rule exception)" }
  return { ok: false, reason: `level-ups are gated to camp (house rule, 2026-08-20); currently in ${context}` }
}

export function levelUp(c: LevelUpInput, rng: Rng): LevelUpOutcome {
  const flags: string[] = []
  const base = (ok: boolean, reason: string, extra: Partial<LevelUpOutcome> = {}): LevelUpOutcome => ({
    ok, reason, level: c.level, hpMax: c.hpMax, hpGain: 0, hpRoll: null,
    proficiencyBonus: proficiencyForLevel(c.level), sheetHitDice: c.sheetHitDice,
    hitDiceRemaining: c.hitDiceRemaining, xpToNext: xpToNext(c.level), slots: null,
    pendingChoices: [], flags, ...extra,
  })

  if (!canLevelUp(c)) return base(false, `${c.name} has ${c.xp} XP — next level at ${xpToNext(c.level)}.`)
  if (isMulticlass(c.class)) return base(false, `${c.name} is multiclassed (${c.class}); which class gains the level is a player choice with SRD prerequisites — DM resolves by hand.`)
  const die = parseHitDie(c.sheetHitDice)
  if (die == null) return base(false, `${c.name}: sheet_hit_dice "${c.sheetHitDice}" unreadable; cannot roll hit points.`)

  const next = c.level + 1 // one level at a time, even if XP would allow two
  if (levelForXp(c.xp) > next) flags.push(`${c.name} has XP for level ${levelForXp(c.xp)}; applying one level at a time — call again.`)

  const con = abilityMod(c.conScore)
  const roll = c.method === "roll" ? 1 + Math.floor(rng() * die) : Math.ceil((die + 1) / 2)
  const gain = Math.max(1, roll + con)
  flags.push("Minimum 1 hp per level is PHB wording; SRD 5.1 omits it. Applied.")

  const cls = String(c.class ?? "").trim().toLowerCase()
  let slots: LevelUpOutcome["slots"] = null
  if (FULL_CASTERS.has(cls)) {
    const table = FULL_CASTER_SLOTS[next]
    if (table) {
      slots = {}
      table.forEach((max, i) => {
        const lvl = String(i + 1)
        const prev = c.slots?.[lvl]
        slots![lvl] = { max, used: Math.min(prev?.used ?? 0, max) }
      })
    } else {
      flags.push(`Slot table beyond level 10 not carried here — set slots for level ${next} by hand (SRD class table).`)
    }
  }

  const pending: string[] = []
  const asi = ASI_LEVELS[cls] ?? ASI_LEVELS.default
  if (asi.includes(next)) pending.push(`Ability Score Improvement at ${next} (two +1s or one +2, max 20) — player chooses.`)
  pending.push(`Class features for ${cls || "class"} level ${next}: read the SRD class table; append to sheet_features.`)
  if (FULL_CASTERS.has(cls)) pending.push(`Spells known/prepared for level ${next} — player chooses from spells.json.`)

  return base(true, `${c.name} reaches level ${next}.`, {
    level: next,
    hpMax: c.hpMax + gain,
    hpGain: gain,
    hpRoll: roll,
    proficiencyBonus: proficiencyForLevel(next),
    sheetHitDice: `${next}d${die}`,
    hitDiceRemaining: c.hitDiceRemaining == null ? null : c.hitDiceRemaining + 1, // the new die is unspent
    xpToNext: xpToNext(next),
    slots,
    pendingChoices: pending,
  })
}

// ---------------------------------------------------------------------------
// Crafting — SRD 5.1, Adventuring: Downtime Activities, Crafting
// ---------------------------------------------------------------------------
//
//   "You must be proficient with tools related to the object ... For every
//    day of downtime you spend crafting, you can craft one or more items with
//    a total market value not exceeding 5 gp, and you must expend raw
//    materials worth half the total market value. If something you want to
//    craft has a market value greater than 5 gp, you make progress every day
//    in 5 gp increments until you reach the market value of the item."
//
// Only catalog items (`items` table) can be crafted — the AI cannot invent
// items (Architecture, Layer 2B). What tools, materials and location an item
// needs is DATA on the item (`items.properties.craft`), never a guess here.
// If an item has no craft block, the answer is "not craftable", not a ruling.

export const CRAFT_GP_PER_DAY = 5

export interface CraftableItem {
  slug: string
  name: string
  /** `items.value` in gp. */
  value: number | null
  /** `items.properties.craft` — absent means not craftable. */
  craft?: { tools?: string; materials?: { slug: string; qty: number }[]; requires?: string | null } | null
}

export interface CraftResult {
  ok: boolean
  reason: string
  /** Days needed in total, at 5 gp/day. */
  daysTotal: number
  /** Progress in gp after this camp's crafting day. */
  progressGp: number
  /** Raw materials that must be spent, in gp (half market value). */
  materialsGp: number
  complete: boolean
  note: string
}

export function craftProgress(
  item: CraftableItem,
  crafter: { name: string; toolProficiencies: string[] },
  progressBeforeGp: number,
  opts: { nodeProvides?: string[]; days?: number } = {},
): CraftResult {
  const value = Math.max(0, Number(item.value) || 0)
  const daysTotal = Math.max(1, Math.ceil(value / CRAFT_GP_PER_DAY))
  const materialsGp = Math.ceil(value / 2)
  const base = (ok: boolean, reason: string, extra: Partial<CraftResult> = {}): CraftResult => ({
    ok, reason, daysTotal, progressGp: progressBeforeGp, materialsGp, complete: false, note: reason, ...extra,
  })
  if (!item.craft) return base(false, `${item.name} has no craft data in the catalog — not craftable (never improvised).`)
  if (value <= 0) return base(false, `${item.name} has no market value on record — cannot price the work.`)
  const tool = (item.craft.tools ?? "").toLowerCase()
  if (tool && !crafter.toolProficiencies.some((t) => t.toLowerCase() === tool)) {
    return base(false, `${crafter.name} is not proficient with ${item.craft.tools} (SRD: proficiency required).`)
  }
  if (item.craft.requires && !(opts.nodeProvides ?? []).map((s) => s.toLowerCase()).includes(item.craft.requires.toLowerCase())) {
    return base(false, `${item.name} needs a ${item.craft.requires} — this camp has none.`)
  }
  const days = Math.max(1, Math.trunc(opts.days ?? 1))
  const progress = Math.min(value, progressBeforeGp + days * CRAFT_GP_PER_DAY)
  const complete = progress >= value
  return base(true, "crafting", {
    progressGp: progress, complete,
    note: complete
      ? `${crafter.name} finishes ${item.name} (${value} gp; materials ${materialsGp} gp spent).`
      : `${crafter.name} works on ${item.name}: ${progress}/${value} gp, ${Math.ceil((value - progress) / CRAFT_GP_PER_DAY)} more day(s).`,
  })
}

// ---------------------------------------------------------------------------
// Talk — the payload. Relationship deltas happen here.
// ---------------------------------------------------------------------------
//
// Sam's gravity system (learnings.md): every event scored 0–100; positive
// events land at 60–70% weight ("palliation is harder than aggravation").
// The six hidden dimensions are Trust, Fear, Respect, Affection, Debt,
// Resentment. This shapes a `relationship_events` row; the DM (Malachar,
// Layer 1) supplies the kind, gravity and deltas from the scene — this file
// only applies the weighting and refuses out-of-range values.

export const PALLIATION_WEIGHT = 0.65 // midpoint of Sam's 60–70%
export type RelationshipDimension = "trust" | "fear" | "respect" | "affection" | "debt" | "resentment"

export interface TalkEvent {
  subjectId: string
  objectId: string
  kind: string
  /** 0–100 as scored by Layer 1. */
  gravity: number
  deltas: Partial<Record<RelationshipDimension, number>>
  note?: string
}

export function weightRelationshipEvent(ev: TalkEvent): { row: TalkEvent & { source: string }; positive: boolean; appliedGravity: number } {
  const gravity = Math.max(0, Math.min(100, Math.trunc(ev.gravity)))
  // Positive = raises trust/respect/affection or lowers fear/resentment.
  const score = (ev.deltas.trust ?? 0) + (ev.deltas.respect ?? 0) + (ev.deltas.affection ?? 0) - (ev.deltas.fear ?? 0) - (ev.deltas.resentment ?? 0)
  const positive = score > 0
  const applied = positive ? Math.round(gravity * PALLIATION_WEIGHT) : gravity
  const deltas: TalkEvent["deltas"] = {}
  for (const [k, v] of Object.entries(ev.deltas)) {
    if (typeof v !== "number") continue
    deltas[k as RelationshipDimension] = positive ? Math.round(v * PALLIATION_WEIGHT * 100) / 100 : v
  }
  return {
    row: { ...ev, gravity: applied, deltas, source: "camp:talk" },
    positive,
    appliedGravity: applied,
  }
}

// ---------------------------------------------------------------------------
// Perform — bard at the fire
// ---------------------------------------------------------------------------
//
// HOUSE RULE (Sam, 2026-08-20: "bard performance as a camp action"). The SRD
// gives a camp performance no mechanic beyond Song of Rest (short rest) and
// the Performance skill. Modelled as one Charisma (Performance) check the
// DM reads for the relationship scene: the total decides a gravity BAND, the
// DM decides the deltas. No hit points, no slots, no buffs — those would be
// invented.

export function perform(sheet: SheetSlice, rng: Rng, dc = 10): { check: CheckResult; band: "flat" | "warm" | "moving"; note: string } {
  const check = resolveSkillCheck(sheet, "performance", dc, rng)
  const band = check.total >= dc + 10 ? "moving" : check.success ? "warm" : "flat"
  return { check, band, note: `${sheet.name} performs: ${check.arithmetic} → ${band}.` }
}
