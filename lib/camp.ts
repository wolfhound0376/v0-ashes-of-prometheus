// Camp — where time is spent on purpose.
//
// Decision of record: docs/claude_Camp_Module.md (2026-09-26). Read it first;
// this file is the rules in that document and nothing the document does not
// say. The night itself (long rest, food, exhaustion) already lives in
// lib/long-rest and lib/exhaustion and is NOT repeated here. This module is
// what the party does around that night: the short rest, the watch, foraging,
// levelling, crafting, and the talk that moves relationships.
//
// Pure, like lib/long-rest and lib/game-context. Rows and rolls in, rows and
// words out. The chat route owns the database; this file owns the rule, so the
// rule can be read in one place and tested without Supabase. Every function
// that rolls takes an `Rng` so the route can feed it the physical result from
// the Three.js dice roller (never lose the roller) and a test can script the
// faces.
//
// SOURCES, so nothing here can be mistaken for an improvisation:
//   SRD 5.1        Resting; Beyond 1st Level; Between Adventures: Crafting;
//                  Bard (Song of Rest); Warlock (Pact Magic); Using Ability
//                  Scores (Typical DCs).
//   OotA-Enc       Out of the Abyss — D&D Encounters ch.2: foraging DC p.25,
//                  random encounters pp.30–32 (the rows live in
//                  `encounter_table_rows`, loaded 2026-08-21).
//   DMG p.111      Foraging yield 1d6 + WIS modifier. NOT SRD — flagged in the
//                  result every time it is used.
//   House rules    Each one is labelled "Sam, <date>" or "needs Sam's yes"
//                  where it applies, and surfaced in `flags` at runtime so a
//                  ruling that has not been given cannot pass as one that has.
//
// Where a rule is missing the function returns a `flags` entry, never a guess.

import {
  abilityMod,
  proficiencyForLevel,
  resolveSkillCheck,
  type CheckResult,
  type GameContext,
  type Rng,
  type SheetSlice,
} from "./game-context"
import { XP_THRESHOLDS } from "./game-data"

// ============================================================================
// §2 THE MENU — one camp action per character per rest
// ============================================================================

/** Every camp action. `sleep` is deliberately absent: it is never an action. */
export const CAMP_ACTIONS = ["watch", "forage", "tend", "talk", "perform", "craft", "level_up"] as const
export type CampAction = (typeof CAMP_ACTIONS)[number]

/**
 * The budget `characters.rest_actions_remaining` is set to when the party makes
 * camp. One, not more: the SRD has no camp-action economy at all, so this is
 * Sam's rule (Playable Layer §7), and the column that already exists holds it.
 */
export const CAMP_ACTIONS_PER_REST = 1

/** What `make_camp` writes to every character's `rest_actions_remaining`. */
export function makeCampBudget(): number {
  return CAMP_ACTIONS_PER_REST
}

export interface SpendOutcome {
  ok: boolean
  /** The value to write back to `rest_actions_remaining`. Unchanged on refusal. */
  remaining: number
  note: string
}

/**
 * Spend one camp action. Refuses when the budget is gone, and refuses anything
 * that is not on the menu — a raw string from a tag cannot buy an action the
 * document does not list.
 */
export function spendCampAction(remaining: number | null | undefined, action: string): SpendOutcome {
  const have = Math.max(0, Math.trunc(Number(remaining) || 0))
  if (!(CAMP_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, remaining: have, note: `"${action}" is not a camp action. Sleeping is free; the menu is ${CAMP_ACTIONS.join(", ")}.` }
  }
  if (have <= 0) {
    return { ok: false, remaining: have, note: `No camp action left this rest (${action} refused).` }
  }
  return { ok: true, remaining: have - 1, note: `${action}: ${have - 1} camp action${have - 1 === 1 ? "" : "s"} left this rest.` }
}

// ============================================================================
// §3 THE WATCH — interruption is a property of the node
// ============================================================================

/** One row of `encounter_table_rows`, as the table stores it. */
export interface EncounterTableRow {
  table_key: string
  roll_min: number
  roll_max: number
  result: string
  /** `{ rolls: [subtable...] }`, `{ bestiary: "Grick", count: "1d4" }`, `{ note: "reroll ... if resting" }` … */
  detail: Record<string, unknown> | null
}

/** One row of `encounter_tables`. Only `die` matters here; it is d20 for every OotA table. */
export interface EncounterTable {
  table_key: string
  die: number | null
}

/** The slice of a `travel_nodes` row the watch reads. */
export interface WatchNode {
  name?: string | null
  metadata?: {
    /** `true` → nobody rolls. A safe node is a fact about the node, not a mood. */
    safe?: boolean
    /** Which table this node rolls on. Defaults to the OotA random table. */
    encounter_table?: string
    [key: string]: unknown
  } | null
}

export const DEFAULT_ENCOUNTER_TABLE = "underdark_random"
export const DEFAULT_ENCOUNTER_DIE = 20

/** One resolved roll in the chain (`underdark_random` → `underdark_creature` → `underdark_ambush`). */
export interface WatchRoll {
  tableKey: string
  die: number
  roll: number
  /** Null when no row covers the roll — the DM rules it. */
  result: string | null
  detail: Record<string, unknown> | null
  /** Set when the row was rerolled because the party was resting (OotA: Ambushers). */
  rerolledFrom?: string
}

export interface WatchOutcome {
  /** False on a safe node: nothing was rolled and there is nothing to narrate. */
  rolled: boolean
  tableKey: string | null
  /** Every roll made, outermost first. */
  chain: WatchRoll[]
  /** The leaf results the DM narrates, in the order they came up. */
  results: string[]
  /** Bestiary names from any leaf row that carries one. */
  creatures: string[]
  /**
   * `"surprise"` when a creature came up: the route hands off to
   * lib/game-context `resolveSurprise` (watcher's passive Perception against
   * the creature's Stealth) and then initiative. Nothing new is built here.
   */
  handoff: "surprise" | null
  /** Missing rows, missing tables, and any other reason the DM must rule. */
  flags: string[]
  note: string
}

const rowFor = (rows: EncounterTableRow[], tableKey: string, roll: number) =>
  rows.find((r) => r.table_key === tableKey && roll >= r.roll_min && roll <= r.roll_max) ?? null

const dieFor = (tables: EncounterTable[] | undefined, tableKey: string) => {
  const t = tables?.find((x) => x.table_key === tableKey)
  const die = Math.trunc(Number(t?.die))
  return die > 0 ? die : DEFAULT_ENCOUNTER_DIE
}

/**
 * The watch: one roll on the node's encounter table at the end of the rest
 * (OotA-Enc p.30/32). The rows come from the database, passed in — a table
 * this function has never heard of returns a flag, never an invented result.
 *
 * `opts.resting` is true at camp by definition; it triggers the book's own
 * "reroll this result if the characters are resting" note on the Ambushers
 * row, once. The positive tail (Society of Brilliance 17, Traders 19–20) is
 * already in the loaded rows; "if you trust them" is the scene, not the roll.
 */
export function resolveWatch(
  node: WatchNode,
  rows: EncounterTableRow[],
  rng: Rng,
  opts: { resting?: boolean; tables?: EncounterTable[] } = {},
): WatchOutcome {
  const meta = node.metadata ?? {}
  const where = node.name ? ` at ${node.name}` : ""
  if (meta.safe === true) {
    return { rolled: false, tableKey: null, chain: [], results: [], creatures: [], handoff: null, flags: [], note: `The night${where} passes undisturbed — this is a safe node; no roll.` }
  }

  const tableKey = typeof meta.encounter_table === "string" && meta.encounter_table ? meta.encounter_table : DEFAULT_ENCOUNTER_TABLE
  const resting = opts.resting ?? true
  const chain: WatchRoll[] = []
  const results: string[] = []
  const creatures: string[] = []
  const flags: string[] = []

  const rollOn = (key: string, depth: number): void => {
    if (depth > 4) {
      flags.push(`Encounter table "${key}" nests deeper than four rolls — stopped; DM rules it.`)
      return
    }
    if (!rows.some((r) => r.table_key === key)) {
      flags.push(`NO ROW — encounter table "${key}" has no rows loaded; DM rules it.`)
      chain.push({ tableKey: key, die: 0, roll: 0, result: null, detail: null })
      return
    }
    const die = dieFor(opts.tables, key)
    let roll = 1 + Math.floor(rng() * die)
    let row = rowFor(rows, key, roll)
    let rerolledFrom: string | undefined
    // OotA: "reroll this result if the characters are resting." Once.
    if (resting && row && typeof row.detail?.note === "string" && /reroll/i.test(row.detail.note) && /rest/i.test(row.detail.note)) {
      rerolledFrom = row.result
      roll = 1 + Math.floor(rng() * die)
      row = rowFor(rows, key, roll)
    }
    const entry: WatchRoll = { tableKey: key, die, roll, result: row?.result ?? null, detail: row?.detail ?? null }
    if (rerolledFrom) entry.rerolledFrom = rerolledFrom
    chain.push(entry)
    if (!row) {
      flags.push(`NO ROW — ${key} has no row for a ${roll}; DM rules it.`)
      return
    }
    const sub = Array.isArray(row.detail?.rolls) ? (row.detail!.rolls as unknown[]).filter((s): s is string => typeof s === "string") : null
    if (sub && sub.length) {
      for (const k of sub) rollOn(k, depth + 1)
      return
    }
    results.push(row.result)
    if (typeof row.detail?.bestiary === "string") creatures.push(row.detail.bestiary)
  }
  rollOn(tableKey, 0)

  const handoff = creatures.length ? "surprise" : null
  const head = chain[0]
  let note: string
  if (!results.length) note = `Watch${where}: rolled on ${tableKey} — no result to read; see flags.`
  else if (results.length === 1 && head && /no encounter/i.test(results[0])) note = `Watch${where}: ${head.roll} on ${tableKey} — no encounter.`
  else note = `Watch${where}: ${results.join("; ")}${creatures.length ? ` — ${creatures.join(", ")} approach; resolve surprise, then initiative.` : "."}`
  return { rolled: true, tableKey, chain, results, creatures, handoff, flags, note }
}

// ============================================================================
// §2 FORAGE — WIS (Survival), yield in person-days of food
// ============================================================================

/** OotA-Enc p.25: foraging in the Underdark is DC 15. Harder ground goes to 20; an underground stream drops it to 10 (terrain table). */
export const FORAGE_DC_DEFAULT = 15
export const FORAGE_DC_MAX = 20

export interface ForageOutcome {
  check: CheckResult
  /** Person-days of food added to `party_supplies.supplies`. Zero on a miss. */
  supplies: number
  /** The d6 face, when the check succeeded. */
  yieldDie: number | null
  flags: string[]
  note: string
}

/**
 * Forage for the party. Success adds 1d6 + WIS modifier person-days of food.
 *
 * The DC is the book's (OotA-Enc p.25). The YIELD is DMG p.111 — not SRD — and
 * says so in `flags` every time it fires. `opts.slowPace` is the "improved
 * foraging" the book grants for slow travel without quantifying; reading it as
 * advantage is Claude's proposal and is flagged until Sam says yes.
 */
export function forage(sheet: SheetSlice, rng: Rng, opts: { dc?: number; slowPace?: boolean } = {}): ForageOutcome {
  const flags: string[] = []
  const dc = Math.max(1, Math.trunc(opts.dc ?? FORAGE_DC_DEFAULT))
  if (dc > FORAGE_DC_MAX) flags.push(`Forage DC ${dc} is above the book's ceiling of ${FORAGE_DC_MAX} (OotA-Enc p.25); DM's call.`)
  if (opts.slowPace) flags.push("Slow pace read as advantage on the forage check — house rule, needs Sam's yes.")
  const check = resolveSkillCheck(sheet, "survival", dc, rng, { advantage: opts.slowPace ? 1 : 0 })
  if (!check.success) {
    return { check, supplies: 0, yieldDie: null, flags, note: `${sheet.name} forages and finds nothing (${check.arithmetic}).` }
  }
  const die = 1 + Math.floor(rng() * 6)
  const wis = abilityMod(sheet.wis_score)
  const supplies = Math.max(0, die + wis)
  flags.push("Forage yield 1d6 + WIS modifier is DMG p.111, not SRD.")
  return {
    check,
    supplies,
    yieldDie: die,
    flags,
    note: `${sheet.name} forages ${supplies} day${supplies === 1 ? "" : "s"} of food (d6(${die}) + WIS(${wis >= 0 ? "+" : ""}${wis}); ${check.arithmetic}).`,
  }
}

// ============================================================================
// §2 TEND — the short rest
// ============================================================================

/** SRD 5.1 class table. Used only when `sheet_hit_dice` does not name the die. */
export const CLASS_HIT_DIE: Record<string, number> = {
  barbarian: 12,
  fighter: 10, paladin: 10, ranger: 10,
  bard: 8, cleric: 8, druid: 8, monk: 8, rogue: 8, warlock: 8,
  sorcerer: 6, wizard: 6,
}

/** `"5d12"` → 12. `"1d8"` → 8. Anything else → null. */
export function parseHitDie(sheetHitDice: string | null | undefined): number | null {
  const m = /^\s*\d*\s*d\s*(\d+)\s*$/i.exec(sheetHitDice ?? "")
  return m ? Number(m[1]) : null
}

/** The die for this character: the sheet's, else the class's, else null (flagged upstream). */
export function hitDieFor(c: { class?: string | null; sheet_hit_dice?: string | null }): number | null {
  return parseHitDie(c.sheet_hit_dice) ?? CLASS_HIT_DIE[(c.class ?? "").trim().toLowerCase()] ?? null
}

/**
 * Is this a multiclassed sheet? `"Rogue 3 / Warlock 2"` and `"3d8+2d8"` both
 * say yes. Levelling one is a player choice with SRD prerequisites, so the
 * module refuses it rather than picking a class.
 */
export function isMulticlass(c: { class?: string | null; sheet_hit_dice?: string | null }): boolean {
  const cls = (c.class ?? "").trim()
  if (/[\/,+&]|\band\b/i.test(cls)) return true
  if ((cls.match(/\b\d+\b/g) ?? []).length >= 2) return true
  const hd = c.sheet_hit_dice ?? ""
  return /[+\/,]/.test(hd) || (hd.match(/d\d+/gi) ?? []).length >= 2
}

export type ShortRestVitality = "up" | "dying" | "stable" | "dead"

export interface ShortRester {
  id: string
  name: string
  level: number | null
  class?: string | null
  sheet_hit_dice?: string | null
  hp: number | null
  hpMax: number | null
  hitDiceRemaining: number | null
  con_score: number | null
  /** How many Hit Dice this character chooses to spend. */
  spend: number
  /** `sheet_spellcasting`, for Pact Magic. `pact: true` → slots refill on a short rest (SRD Warlock). */
  spellcasting?: { pact?: boolean; slots?: Record<string, { max?: number; used?: number } | null> | null; [k: string]: unknown } | null
  vitality: ShortRestVitality
}

/** Song of Rest (SRD Bard 2nd): the bard's level decides the die. */
export interface SongOfRest {
  bardId: string
  bardName: string
  bardLevel: number
}

/** SRD Bard: d6 at 2nd, d8 at 9th, d10 at 13th, d12 at 17th. Null below 2nd. */
export function songOfRestDie(bardLevel: number): number | null {
  const l = Math.trunc(bardLevel || 0)
  if (l >= 17) return 12
  if (l >= 13) return 10
  if (l >= 9) return 8
  if (l >= 2) return 6
  return null
}

export interface ShortRestOutcome {
  id: string
  name: string
  rested: boolean
  hp: number
  hitDiceRemaining: number | null
  /** Each Hit Die spent: the face and what it healed after CON. */
  dice: { face: number; healed: number }[]
  songOfRest: { face: number; healed: number } | null
  healed: number
  /** Rebuilt slot map when Pact Magic refilled, else null (write nothing). */
  slots: Record<string, { max?: number; used?: number }> | null
  pactSlotsRestored: number
  flags: string[]
  note: string
}

export interface ShortRestResult {
  characters: ShortRestOutcome[]
  /** What `rest_events` should carry. */
  restEvent: { rest_type: "short"; bard_character_id: string | null; bard_spent_die: boolean }
  /** SRD: a short rest is at least one hour. `time_advancement_rules.short_rest` says 60. */
  minutes: number
}

export const SHORT_REST_MINUTES = 60

/**
 * SRD 5.1, Resting: Short Rest. "A character can spend one or more Hit Dice at
 * the end of a short rest... For each Hit Die spent in this way, the player
 * rolls the die and adds the character's Constitution modifier to it. The
 * character regains hit points equal to the total."
 *
 * A die that comes up below a negative CON modifier heals nothing rather than
 * wounding — hit points are "regained", never lost, by resting.
 *
 * Song of Rest: every character who spends at least one Hit Die also regains
 * the bard's die, once. The bard may be one of the resters; `bard_spent_die`
 * records whether they spent a Hit Die themselves, which is what the
 * `rest_events` column was made for.
 *
 * The dying and the dead do not short-rest, same as the long rest. A stable
 * character at 0 may spend Hit Dice — the SRD's 1-hp clause is written on the
 * long rest only — and that is flagged, not assumed silently.
 */
export function shortRest(party: ShortRester[], rng: Rng, song: SongOfRest | null = null): ShortRestResult {
  const songDie = song ? songOfRestDie(song.bardLevel) : null
  let bardSpentDie = false
  const characters = party.map((c): ShortRestOutcome => {
    const flags: string[] = []
    const hp = Math.max(0, c.hp ?? 0)
    const max = Math.max(0, c.hpMax ?? 0)
    const base: ShortRestOutcome = {
      id: c.id, name: c.name, rested: false, hp, hitDiceRemaining: c.hitDiceRemaining, dice: [], songOfRest: null,
      healed: 0, slots: null, pactSlotsRestored: 0, flags, note: "",
    }
    if (c.vitality === "dead") return { ...base, note: `${c.name} is dead and does not rest.` }
    if (c.vitality === "dying") return { ...base, note: `${c.name} is dying and cannot rest. Stabilise or heal them first.` }
    if (c.vitality === "stable" && hp <= 0) flags.push(`${c.name} is stable at 0: the SRD's 1-hp clause is on the long rest only, so Hit Dice may be spent — DM may rule otherwise.`)

    const die = hitDieFor(c)
    const con = abilityMod(c.con_score ?? 10)
    const have = c.hitDiceRemaining
    let want = Math.max(0, Math.trunc(c.spend || 0))
    if (want > 0 && die == null) {
      flags.push(`${c.name}: no Hit Die on the sheet (sheet_hit_dice "${c.sheet_hit_dice ?? ""}", class "${c.class ?? ""}") — cannot spend.`)
      want = 0
    }
    if (want > 0 && have == null) {
      flags.push(`${c.name}: hit_dice_remaining is null — the sheet does not track Hit Dice; nothing spent.`)
      want = 0
    }
    if (have != null && want > have) {
      flags.push(`${c.name} asked to spend ${want} Hit Dice but has ${have}; spending ${have}.`)
      want = have
    }

    let cur = hp
    const dice: { face: number; healed: number }[] = []
    for (let i = 0; i < want && die != null; i++) {
      const face = 1 + Math.floor(rng() * die)
      const healed = Math.min(Math.max(0, face + con), Math.max(0, max - cur))
      cur += healed
      dice.push({ face, healed })
    }
    let songOfRest: { face: number; healed: number } | null = null
    if (want > 0 && songDie != null) {
      const face = 1 + Math.floor(rng() * songDie)
      const healed = Math.min(face, Math.max(0, max - cur))
      cur += healed
      songOfRest = { face, healed }
    }
    if (want > 0 && song && c.id === song.bardId) bardSpentDie = true

    let slots: Record<string, { max?: number; used?: number }> | null = null
    let pactSlotsRestored = 0
    if (c.spellcasting?.pact === true && c.spellcasting.slots) {
      slots = {}
      for (const [lvl, entry] of Object.entries(c.spellcasting.slots)) {
        if (!entry) continue
        pactSlotsRestored += entry.used ?? 0
        slots[lvl] = { ...entry, used: 0 }
      }
      if (pactSlotsRestored === 0) slots = null
    }

    const healed = cur - hp
    const parts: string[] = []
    if (dice.length) parts.push(`spends ${dice.length} Hit Di${dice.length === 1 ? "e" : "ce"} (d${die}: ${dice.map((d) => d.face).join(", ")}${con ? `, CON ${con > 0 ? "+" : ""}${con} each` : ""})`)
    if (songOfRest) parts.push(`Song of Rest d${songDie}(${songOfRest.face})`)
    if (pactSlotsRestored) parts.push(`${pactSlotsRestored} pact slot${pactSlotsRestored === 1 ? "" : "s"} back`)
    const note = parts.length
      ? `${c.name} ${parts.join(", ")} — regains ${healed} hp (${cur}/${max}).`
      : `${c.name} takes a short rest and spends nothing.`
    return {
      ...base, rested: true, hp: cur, hitDiceRemaining: have == null ? null : have - want, dice, songOfRest, healed, slots, pactSlotsRestored, note,
    }
  })
  if (song && songDie == null) {
    characters.forEach((c) => c.flags.push(`${song.bardName} is level ${song.bardLevel}: Song of Rest starts at 2nd (SRD Bard). No extra die.`))
  }
  return {
    characters,
    restEvent: { rest_type: "short", bard_character_id: song && songDie != null ? song.bardId : null, bard_spent_die: bardSpentDie },
    minutes: SHORT_REST_MINUTES,
  }
}

// ============================================================================
// §5 TALK — the payload
// ============================================================================

/** The six hidden dimensions Layer 1 moves at the fire. */
export const RELATIONSHIP_DIMENSIONS = ["trust", "fear", "respect", "affection", "debt", "resentment"] as const
export type RelationshipDimension = (typeof RELATIONSHIP_DIMENSIONS)[number]

/**
 * Sam's palliation rule: a positive event lands at 60–70% of its weight, so
 * relief never erases what came before; a negative lands in full. 0.65 is the
 * midpoint. "Relief without erasure."
 */
export const PALLIATION = 0.65

export interface TalkScene {
  /** `characters.id` (or npc id) of who felt it and who caused it. */
  subjectId: string
  objectId: string
  /** Free vocabulary from Layer 1: "confession", "shared_watch", "betrayal_recalled" … */
  kind: string
  /** Layer 1's 0–100 weight of the scene. */
  gravity: number
  valence: "positive" | "negative"
  /** Per-dimension movement Layer 1 proposes, before weighting. */
  deltas: Partial<Record<RelationshipDimension, number>>
  note?: string | null
}

/** One row for `relationship_events`. Column names match the table. */
export interface RelationshipEventRow {
  subject_id: string
  object_id: string
  kind: string
  gravity: number
  deltas: Partial<Record<RelationshipDimension, number>>
  note: string | null
  source: "camp:talk"
}

const round = (n: number) => (n < 0 ? -Math.round(-n) : Math.round(n))

/**
 * Weight one camp conversation into a `relationship_events` row. Positive
 * scenes are scaled by PALLIATION (gravity and every delta alike); negative
 * scenes land whole. Unknown dimensions are dropped rather than written, so a
 * typo in Layer 1's output cannot invent a seventh dimension.
 */
export function weightRelationshipEvent(scene: TalkScene): RelationshipEventRow {
  const factor = scene.valence === "positive" ? PALLIATION : 1
  const gravity = Math.max(0, Math.min(100, round(Math.max(0, Math.min(100, scene.gravity)) * factor)))
  const deltas: Partial<Record<RelationshipDimension, number>> = {}
  for (const dim of RELATIONSHIP_DIMENSIONS) {
    const v = scene.deltas[dim]
    if (typeof v !== "number" || !Number.isFinite(v)) continue
    deltas[dim] = round(v * factor)
  }
  return {
    subject_id: scene.subjectId,
    object_id: scene.objectId,
    kind: scene.kind,
    gravity,
    deltas,
    note: scene.note ?? null,
    source: "camp:talk",
  }
}

// ============================================================================
// §2 PERFORM — a Performance check read as a band
// ============================================================================

export type PerformanceBand = "flat" | "warm" | "moving"

/**
 * Where the bands sit. The SRD's Typical Difficulty Classes ladder (Easy 10,
 * Medium 15) is the only published scale to hang them on; that reading is
 * Claude's and needs Sam's yes, so it is flagged in every result.
 */
export const PERFORMANCE_BANDS: { warm: number; moving: number } = { warm: 10, moving: 15 }

export interface PerformOutcome {
  check: CheckResult
  band: PerformanceBand
  /** Always null: the DM sets any relationship deltas after reading the band. No mechanical buff (Sam, 2026-08-20). */
  deltas: null
  flags: string[]
  note: string
}

/** Bard performance is a camp action with no mechanical buff — one CHA (Performance) check the DM reads. Sam, 2026-08-20. */
export function perform(sheet: SheetSlice, rng: Rng): PerformOutcome {
  const check = resolveSkillCheck(sheet, "performance", PERFORMANCE_BANDS.warm, rng)
  const band: PerformanceBand = check.total >= PERFORMANCE_BANDS.moving ? "moving" : check.total >= PERFORMANCE_BANDS.warm ? "warm" : "flat"
  return {
    check,
    band,
    deltas: null,
    flags: [`Band thresholds (${PERFORMANCE_BANDS.warm}/${PERFORMANCE_BANDS.moving}) follow the SRD Typical DC ladder — a reading, needs Sam's yes.`],
    note: `${sheet.name} performs: ${check.total} — ${band}. (${check.arithmetic.replace(/ vs DC \d+$/, "")})`,
  }
}

// ============================================================================
// §6 CRAFT — catalog only
// ============================================================================

/** SRD 5.1, Between Adventures: Crafting — 5 gp of progress per day; raw materials cost half the market value. */
export const CRAFT_GP_PER_DAY = 5
export const CRAFT_MATERIALS_FRACTION = 0.5

/** The recipe convention on `items.properties.craft`. No block → not craftable. */
export interface CraftRecipe {
  tools: string
  materials?: { slug: string; qty: number }[]
  /** A facility the location must offer: "forge", "alchemy_lab" … */
  requires?: string | null
}

export interface CraftableItem {
  name: string
  /** `items.value` in gp. */
  value: number | null
  properties: { craft?: CraftRecipe | null; [k: string]: unknown } | null
}

export interface Crafter {
  name: string
  /** `sheet_proficiencies.tools`. */
  tools: string[] | null | undefined
}

export interface CraftSite {
  /** Facilities the node offers, e.g. `travel_nodes.metadata.facilities`. */
  facilities?: string[] | null
}

export interface CraftOutcome {
  craftable: boolean
  /** Why not, in one line. Null when craftable. */
  reason: string | null
  /** Market value (gp) — the total progress needed. */
  totalGp: number
  /** What the materials cost: half the market value, SRD. */
  materialsGp: number
  /** Progress after this session's days. */
  progressGp: number
  daysWorked: number
  daysRemaining: number
  done: boolean
  flags: string[]
  note: string
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

/**
 * One crafting session. `progressGp` is what was already banked; `days` is how
 * many camp-days go into it now. The AI cannot invent items (Layer 2B): only a
 * catalog row with a `craft` block can be made, and only by someone proficient
 * with the named tools, where the required facility exists, holding the
 * materials. Every refusal names its reason so the DM can read it out.
 */
export function craftProgress(
  item: CraftableItem,
  crafter: Crafter,
  site: CraftSite,
  onHand: { slug: string; qty: number }[],
  progressGp: number,
  days: number,
): CraftOutcome {
  const flags: string[] = []
  const recipe = item.properties?.craft ?? null
  const value = Math.max(0, Math.trunc(Number(item.value) || 0))
  const refuse = (reason: string): CraftOutcome => ({
    craftable: false, reason, totalGp: value, materialsGp: Math.ceil(value * CRAFT_MATERIALS_FRACTION), progressGp: Math.max(0, progressGp),
    daysWorked: 0, daysRemaining: Math.max(0, Math.ceil((value - Math.max(0, progressGp)) / CRAFT_GP_PER_DAY)), done: false, flags, note: `${item.name}: ${reason}`,
  })

  if (!recipe || typeof recipe.tools !== "string" || !recipe.tools) return refuse("not craftable — no craft recipe on the catalog row.")
  if (value <= 0) return refuse("no market value on the catalog row, so crafting cannot be priced (SRD prices progress against value).")
  const tools = (crafter.tools ?? []).map(norm)
  if (!tools.includes(norm(recipe.tools))) return refuse(`${crafter.name} is not proficient with ${recipe.tools}.`)
  if (recipe.requires) {
    const here = (site.facilities ?? []).map(norm)
    if (!here.includes(norm(recipe.requires))) return refuse(`needs a ${recipe.requires} and there is none here.`)
  }
  for (const m of recipe.materials ?? []) {
    const have = onHand.filter((h) => h.slug === m.slug).reduce((n, h) => n + Math.max(0, h.qty), 0)
    if (have < m.qty) return refuse(`short of materials — ${m.slug} ${have}/${m.qty}.`)
  }

  const d = Math.max(0, Math.trunc(days || 0))
  const before = Math.max(0, Math.trunc(progressGp || 0))
  const after = Math.min(value, before + d * CRAFT_GP_PER_DAY)
  const daysRemaining = Math.ceil((value - after) / CRAFT_GP_PER_DAY)
  const done = after >= value
  return {
    craftable: true,
    reason: null,
    totalGp: value,
    materialsGp: Math.ceil(value * CRAFT_MATERIALS_FRACTION),
    progressGp: after,
    daysWorked: d,
    daysRemaining,
    done,
    flags,
    note: done
      ? `${crafter.name} finishes the ${item.name} (${after}/${value} gp of work).`
      : `${crafter.name} works ${d} day${d === 1 ? "" : "s"} on the ${item.name}: ${after}/${value} gp, ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} to go.`,
  }
}

// ============================================================================
// §4 LEVELLING — gated to camp, one level at a time
// ============================================================================

/** SRD 5.1, Beyond 1st Level: the XP table, from lib/game-data (one copy; the chat route's inline array should go). */
export const XP_TABLE = XP_THRESHOLDS
export const MAX_LEVEL = 20

/** The level this much XP earns. */
export function levelForXp(xp: number): number {
  const x = Math.max(0, Math.trunc(Number(xp) || 0))
  let level = 1
  for (let l = 2; l <= MAX_LEVEL; l++) if (x >= XP_TABLE[l]) level = l
  return level
}

/** XP at which the NEXT level begins, as `characters.xp_to_next` stores it (300 at level 1, 14000 at level 5). Null at 20. */
export function xpToNext(level: number): number | null {
  const l = Math.max(1, Math.trunc(level || 1))
  return l >= MAX_LEVEL ? null : XP_TABLE[l + 1]
}

/** The slice of a `travel_nodes` row the gate reads. */
export interface LevelUpSite {
  metadata?: { allows_level_up?: boolean; [k: string]: unknown } | null
}

/**
 * Level-ups happen at camp. Exceptions are location-gated — a school of magic,
 * a temple, a patron — via `travel_nodes.metadata.allows_level_up = true`.
 * Sam, 2026-08-20.
 */
export function levelUpAllowedHere(context: GameContext, node: LevelUpSite | null | undefined): boolean {
  return context === "camp" || node?.metadata?.allows_level_up === true
}

/** Full casters (SRD): Bard, Cleric, Druid, Sorcerer, Wizard — the shared slot table. */
export const FULL_CASTERS = ["bard", "cleric", "druid", "sorcerer", "wizard"] as const
/** Half casters (SRD): Paladin, Ranger — their own table, not written here (flagged). */
export const HALF_CASTERS = ["paladin", "ranger"] as const

/** SRD 5.1 full-caster spell slots per spell level, character levels 1–10. Beyond 10 is flagged, not written. */
export const FULL_CASTER_SLOTS: Record<number, number[]> = {
  1: [2],
  2: [3],
  3: [4, 2],
  4: [4, 3],
  5: [4, 3, 2],
  6: [4, 3, 3],
  7: [4, 3, 3, 1],
  8: [4, 3, 3, 2],
  9: [4, 3, 3, 3, 1],
  10: [4, 3, 3, 3, 2],
}

/** SRD: Ability Score Improvement at 4th, 8th, 12th, 16th, 19th (every class). */
export const ASI_LEVELS = [4, 8, 12, 16, 19] as const

/** SRD: the level each class picks its subclass. */
export const SUBCLASS_LEVEL: Record<string, number> = {
  barbarian: 3, bard: 3, cleric: 1, druid: 2, fighter: 3, monk: 3, paladin: 3, ranger: 3, rogue: 3, sorcerer: 1, warlock: 1, wizard: 2,
}

export interface LevelUpSheet {
  id: string
  name: string
  class: string | null
  level: number
  xp: number
  hp_max: number
  con_score: number
  hit_dice_remaining: number | null
  sheet_hit_dice: string | null
  sheet_spellcasting: { slots?: Record<string, { max?: number; used?: number } | null> | null; [k: string]: unknown } | null
}

export interface LevelUpWrite {
  level: number
  hp_max: number
  proficiency_bonus: number
  sheet_hit_dice: string
  hit_dice_remaining: number | null
  xp_to_next: number | null
  /** Rebuilt `sheet_spellcasting`, or null when nothing should be written. */
  sheet_spellcasting: LevelUpSheet["sheet_spellcasting"] | null
}

export interface PendingChoice {
  kind: "asi" | "subclass" | "class_features" | "spells" | "cantrips"
  text: string
  source: string
}

export interface LevelUpOutcome {
  ok: boolean
  /** Columns to write on `characters`. Null on refusal. */
  write: LevelUpWrite | null
  hp: { die: number; face: number | null; con: number; gained: number; method: "roll" | "average" } | null
  /** Choices the players make at the fire; the engine does not choose. */
  pendingChoices: PendingChoice[]
  flags: string[]
  note: string
}

/**
 * Take one level. Writes what the SRD fixes (hit points, proficiency bonus, Hit
 * Dice, slots for a full caster) and returns as `pendingChoices` everything
 * the players decide. Refuses a multiclassed sheet outright; refuses when the
 * XP is not there; never jumps two levels in one call.
 *
 * `method: "roll"` draws the new Hit Die from `rng` — the route feeds the
 * physical result from the Three.js roller. `"average"` is the SRD's fixed
 * alternative (half the die, rounded up: 7 for d12, 6 for d10, 5 for d8, 4
 * for d6). Minimum 1 hit point per level is the PHB wording; the SRD omits it,
 * so it is applied and flagged for Sam's yes.
 */
export function levelUp(sheet: LevelUpSheet, opts: { method: "roll" | "average"; rng?: Rng }): LevelUpOutcome {
  const flags: string[] = []
  const refuse = (note: string): LevelUpOutcome => ({ ok: false, write: null, hp: null, pendingChoices: [], flags, note })

  if (isMulticlass(sheet)) return refuse(`${sheet.name} is multiclassed (${sheet.class ?? sheet.sheet_hit_dice}). Which class takes the level is a player choice with SRD prerequisites — not decided here.`)
  const level = Math.max(1, Math.trunc(sheet.level || 1))
  if (level >= MAX_LEVEL) return refuse(`${sheet.name} is already level ${MAX_LEVEL}.`)
  const next = level + 1
  const need = XP_TABLE[next]
  const xp = Math.max(0, Math.trunc(sheet.xp || 0))
  if (xp < need) return refuse(`${sheet.name} has ${xp} XP; level ${next} needs ${need}.`)
  const die = hitDieFor(sheet)
  if (die == null) return refuse(`${sheet.name}: no Hit Die on the sheet (class "${sheet.class ?? ""}", sheet_hit_dice "${sheet.sheet_hit_dice ?? ""}").`)
  if (opts.method === "roll" && !opts.rng) return refuse(`${sheet.name}: method "roll" needs the die result — pass the roller's rng.`)
  if (levelForXp(xp) > next) flags.push(`${sheet.name} has XP for level ${levelForXp(xp)}; taking one level at a time — call again for the next.`)

  const con = abilityMod(sheet.con_score)
  const face = opts.method === "roll" ? 1 + Math.floor((opts.rng as Rng)() * die) : null
  // SRD fixed value: half the die rounded up, plus one — 7 for d12, 6 for d10, 5 for d8, 4 for d6.
  const base = face ?? Math.ceil(die / 2) + 1
  const raw = base + con
  const gained = Math.max(1, raw)
  if (raw < 1) flags.push(`${sheet.name}: ${base}${con < 0 ? con : `+${con}`} would be ${raw} hp; minimum 1 per level applied (PHB wording, absent from SRD 5.1 — needs Sam's yes).`)

  const cls = (sheet.class ?? "").trim().toLowerCase()
  let spellcasting: LevelUpSheet["sheet_spellcasting"] | null = null
  if ((FULL_CASTERS as readonly string[]).includes(cls)) {
    const row = FULL_CASTER_SLOTS[next]
    if (!row) {
      flags.push(`${sheet.name}: full-caster slots for level ${next} are not in this module (table stops at 10); write them by hand.`)
    } else {
      const prev = sheet.sheet_spellcasting?.slots ?? {}
      const slots: Record<string, { max?: number; used?: number }> = {}
      row.forEach((max, i) => {
        const key = String(i + 1)
        slots[key] = { ...(prev[key] ?? {}), max, used: prev[key]?.used ?? 0 }
      })
      spellcasting = { ...(sheet.sheet_spellcasting ?? {}), slots }
    }
  } else if ((HALF_CASTERS as readonly string[]).includes(cls)) {
    flags.push(`${sheet.name} is a ${sheet.class}: half-caster slots are not in this module; write them by hand.`)
  } else if (cls === "warlock") {
    flags.push(`${sheet.name}: Pact Magic slots are not in this module; write them by hand.`)
  }

  const pendingChoices: PendingChoice[] = []
  if ((ASI_LEVELS as readonly number[]).includes(next)) pendingChoices.push({ kind: "asi", text: "Ability Score Improvement: +2 to one score or +1 to two (max 20).", source: "SRD 5.1, class table" })
  if (SUBCLASS_LEVEL[cls] === next) pendingChoices.push({ kind: "subclass", text: `Choose a ${sheet.class} subclass.`, source: "SRD 5.1, class table" })
  pendingChoices.push({ kind: "class_features", text: `Read the ${sheet.class ?? "class"} table for level ${next} features.`, source: "SRD 5.1, class table" })
  if ((FULL_CASTERS as readonly string[]).includes(cls) || cls === "warlock" || (HALF_CASTERS as readonly string[]).includes(cls)) {
    pendingChoices.push({ kind: "spells", text: "Spells known / prepared for the new level.", source: "SRD 5.1, class spellcasting" })
  }

  const write: LevelUpWrite = {
    level: next,
    hp_max: Math.max(1, Math.trunc(sheet.hp_max || 0)) + gained,
    proficiency_bonus: proficiencyForLevel(next),
    sheet_hit_dice: `${next}d${die}`,
    hit_dice_remaining: sheet.hit_dice_remaining == null ? null : Math.min(next, sheet.hit_dice_remaining + 1),
    xp_to_next: xpToNext(next),
    sheet_spellcasting: spellcasting,
  }
  if (sheet.hit_dice_remaining == null) flags.push(`${sheet.name}: hit_dice_remaining is null — the new Hit Die was not banked.`)

  return {
    ok: true,
    write,
    hp: { die, face, con, gained, method: opts.method },
    pendingChoices,
    flags,
    note:
      `${sheet.name} reaches level ${next}: +${gained} hp (${opts.method === "roll" ? `d${die}(${face})` : `fixed ${base}`}${con ? ` ${con > 0 ? "+" : ""}${con} CON` : ""}), ` +
      `proficiency +${write.proficiency_bonus}, Hit Dice ${write.sheet_hit_dice}` +
      (pendingChoices.length ? ` — ${pendingChoices.length} choice${pendingChoices.length === 1 ? "" : "s"} to make at the fire.` : "."),
  }
}
