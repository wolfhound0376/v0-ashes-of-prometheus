// Devotion — what the god expects back, and what it gives for it.
//
// Decision of record: docs/claude_Prayer_Module.md §13. Companion to
// lib/prayer.ts, and deliberately a SEPARATE CLOCK from it.
//
// Sam's ruling, 2026-10-01: "prayers are required regularly for Cleric god's
// to bestow up level spells. Getting them at level 2 and on isn't automatic
// and isn't chosen by the player. Their God may also give missions to unlock
// the next level spells or a certain domain. Regarding warlocks, praying
// allows them to commune with their patron to determine if they will receive
// a boon or debuff/curse. They are required to check in regularly. They're
// spell progression is similar to clerics and not chosen."
//
// WHY THIS IS NOT lib/prayer.ts. The answer roll in that file is rare by
// design — a level 1 cleric sees silence four times in five, and that is the
// point of it. If spell progression rode on THAT roll, a cleric could level up
// three times, roll badly each time, and arrive at level 4 with level 1 spells
// through no decision of his own. That is not a demanding god, it is a slot
// machine deciding whether he has a character sheet.
//
// So the two are split:
//
//   lib/prayer.ts   — the ANSWER. Rare. Luck and conduct. Signs and hands.
//   lib/devotion.ts — the GRANT. Not rare. Cadence and obedience. Spells.
//
// The grant rides on KEEPING THE OBSERVANCE, which is entirely in the player's
// control, and the four rails below keep it from ever bricking a character.
//
// THE RAILS (break one and this becomes a punishment rather than a demand):
//
//   1. SLOTS ALWAYS ADVANCE BY THE BOOK. Spell slots are class maths and are
//      never withheld. A lapsed cleric can still upcast what he already has.
//      He is never made non-functional.
//   2. NOTHING IS EVER REVOKED. A lapse stops you GAINING; it never takes away
//      a spell already granted. `grantDecision` can only ever add.
//   3. THE GOD CHOOSES, NOT THE PLAYER — Sam's ruling. But the choice is
//      weighted by the deity's own portfolio, so it reads as character rather
//      than as randomness.
//   4. MISSIONS GATE THE EXCEPTIONAL, NOT THE ORDINARY. A mission can hold back
//      a new DOMAIN or an early spell level. It must never be the only route to
//      the progression a character is already owed by their level.
//
// SOURCES:
//   SRD 5.1 / 5.2.1  Slot progression is the class table and is NOT touched
//                    here. NOTE: the ingested rulebook is SRD 5.1 but
//                    `class_spellcasting_progression` and the live character
//                    sheets cite SRD 5.2.1 (2025). That split is real and is
//                    flagged for Sam; nothing in this file depends on which
//                    one wins, because this file never computes a slot.
//   Live schema      `characters.sheet_spellcasting` already carries a `pool`
//                    field, currently "class_list". Sam's ruling turns it to
//                    "deity_granted" for clerics and warlocks. No migration is
//                    needed for that part — the field exists.
//
//   EVERYTHING ELSE IS HOMEBREW (Sam, 2026-10-01). 5e has no devotion cadence,
//   no god-granted spell selection and no patron commune. Cadence numbers are
//   invented and marked below.

import type { Rng } from "./game-context"
import type { Deity, Standing, StandingWord } from "./prayer"
import { standingWord } from "./prayer"

// ============================================================================
// OBSERVANCE — the cadence
// ============================================================================

export type ObservanceState = "current" | "due" | "lapsed"

/** Homebrew (Sam, 2026-10-01). Days of game time between required prayers. */
export const OBSERVANCE_CADENCE_DAYS = 7
/** Grace before a missed observance actually counts as lapsed. */
export const OBSERVANCE_GRACE_DAYS = 3

export interface ObservanceInput {
  /** `game_clock.game_day` of the last prayer to this deity. Null = never. */
  lastPrayerDay: number | null
  /** Today's `game_clock.game_day`. */
  today: number
  cadenceDays?: number
  graceDays?: number
}

/**
 * A character who has NEVER prayed is "due", not "lapsed" — you cannot fall
 * behind on an observance you were never told about. The first prayer is the
 * one that starts the clock.
 */
export function observanceState(input: ObservanceInput): ObservanceState {
  const cadence = input.cadenceDays ?? OBSERVANCE_CADENCE_DAYS
  const grace = input.graceDays ?? OBSERVANCE_GRACE_DAYS
  if (input.lastPrayerDay == null) return "due"
  const elapsed = Math.max(0, Math.trunc(input.today - input.lastPrayerDay))
  if (elapsed < cadence) return "current"
  if (elapsed <= cadence + grace) return "due"
  return "lapsed"
}

/** Days until the observance lapses. Negative once it has. For the sheet nudge. */
export function daysUntilLapse(input: ObservanceInput): number {
  const cadence = input.cadenceDays ?? OBSERVANCE_CADENCE_DAYS
  const grace = input.graceDays ?? OBSERVANCE_GRACE_DAYS
  const last = input.lastPrayerDay ?? input.today
  return last + cadence + grace - input.today
}

// ============================================================================
// MISSIONS — what the god wants done
// ============================================================================

export type MissionState = "offered" | "accepted" | "complete" | "failed"

export interface Mission {
  id: string
  deitySlug: string
  text: string
  state: MissionState
  /** What completing it opens. A mission with no unlock is pure story. */
  unlocks?: { spellLevel?: number; domain?: string }
}

/**
 * Rail 4: a mission may gate a spell level ONLY when that level is ahead of
 * what the character's own class table already owes them. A mission can make
 * you reach, never make you wait for what you earned by levelling.
 */
export function missionGate(
  spellLevel: number,
  owedByClassTable: number,
  missions: Mission[],
): { blocked: boolean; mission?: Mission; reason?: string } {
  if (spellLevel <= owedByClassTable) return { blocked: false }
  // Find the mission that OFFERS this level regardless of its state, then
  // judge the state. Filtering out completed missions in the find() made a
  // finished quest indistinguishable from a quest that never existed, so
  // completing it left the gate shut — caught by test, fixed here.
  const offer = missions.find((m) => m.unlocks?.spellLevel === spellLevel)
  if (!offer) {
    return { blocked: true, reason: `spell level ${spellLevel} is ahead of the class table and no mission offers it` }
  }
  if (offer.state === "complete") return { blocked: false, mission: offer }
  return { blocked: true, mission: offer, reason: `"${offer.text}" is not complete` }
}

export function domainGate(
  domain: string,
  missions: Mission[],
): { blocked: boolean; mission?: Mission } {
  const m = missions.find((x) => x.unlocks?.domain === domain)
  if (!m) return { blocked: true }
  return m.state === "complete" ? { blocked: false } : { blocked: true, mission: m }
}

// ============================================================================
// WHAT THE CLASS TABLE OWES
// ============================================================================

/**
 * `class_spellcasting_progression.slots` comes in two real shapes, both
 * verified live against the table on 2026-10-01 (source: SRD 5.2.1 (2025),
 * cleric p.36, warlock p.71):
 *
 *   Cleric  — a map of spell level to slot count:  {"1": 4, "2": 3, "3": 2}
 *   Warlock — pact magic, one level for all slots: {"pact": true, "count": 2, "level": 3}
 *
 * A warlock's pact slots are all at the same level, so reading `max(keys)` on
 * that object would return NaN or nonsense. Handle both or the warlock grant
 * silently computes the wrong level.
 */
export function owedSpellLevelFromSlots(slots: unknown): number {
  if (!slots || typeof slots !== "object") return 0
  const o = slots as Record<string, unknown>
  if (o.pact === true) {
    const lvl = Number(o.level)
    return Number.isFinite(lvl) ? Math.max(0, Math.trunc(lvl)) : 0
  }
  let best = 0
  for (const key of Object.keys(o)) {
    const lvl = Number(key)
    const count = Number(o[key])
    if (Number.isFinite(lvl) && lvl > best && Number.isFinite(count) && count > 0) best = Math.trunc(lvl)
  }
  return best
}

// ============================================================================
// THE GRANT
// ============================================================================

export type DevoutClass = "cleric" | "warlock"

export interface GrantInput {
  characterClass: DevoutClass
  /** Highest spell level the class table already owes at this character level. */
  owedSpellLevel: number
  /** Highest spell level the god has actually granted so far. */
  grantedSpellLevel: number
  standing: Standing
  observance: ObservanceState
  missions?: Mission[]
}

export interface GrantDecision {
  /** The spell level to grant now, or null for none. Never lowers anything. */
  grantSpellLevel: number | null
  /** Rail 1: always true. Slots are class maths and are never withheld. */
  slotsAdvance: true
  /** Rail 2: always false. Nothing is ever taken away. */
  revokes: false
  blockedBy?: "observance" | "standing" | "mission" | "nothing_owed"
  mission?: Mission
  reasons: string[]
}

export function grantDecision(input: GrantInput): GrantDecision {
  const reasons: string[] = []
  const missions = input.missions ?? []
  const word = standingWord(input.standing)

  const base: Pick<GrantDecision, "slotsAdvance" | "revokes"> = { slotsAdvance: true, revokes: false }

  // Level 1 is never gated — you arrive already ordained (Sam: "level 2 and on").
  const next = input.grantedSpellLevel + 1
  if (input.grantedSpellLevel >= input.owedSpellLevel) {
    return { ...base, grantSpellLevel: null, blockedBy: "nothing_owed", reasons: ["nothing owed yet"] }
  }
  if (next <= 1) {
    return { ...base, grantSpellLevel: 1, reasons: ["first spell level is never gated"] }
  }

  if (word === "forsworn") {
    reasons.push("a vow in this god's name is broken — nothing new is granted until it is atoned")
    return { ...base, grantSpellLevel: null, blockedBy: "standing", reasons }
  }
  if (input.observance === "lapsed") {
    reasons.push("the observance has lapsed — pray and the grant resumes; nothing already granted is lost")
    return { ...base, grantSpellLevel: null, blockedBy: "observance", reasons }
  }

  const gate = missionGate(next, input.owedSpellLevel, missions)
  if (gate.blocked) {
    reasons.push(gate.reason ?? "a mission stands in the way")
    return { ...base, grantSpellLevel: null, blockedBy: "mission", mission: gate.mission, reasons }
  }

  if (input.observance === "due") reasons.push("observance is due soon — granted, but the clock is running")
  reasons.push(`granted by ${word === "unknown" ? "a god who barely knows your name" : `a god who finds you ${word}`}`)
  return { ...base, grantSpellLevel: next, reasons }
}

// ============================================================================
// WHICH SPELLS — the god chooses, not the player (Sam, 2026-10-01)
// ============================================================================

export interface SpellLike {
  name: string
  level: number
  school?: string
  /** Free tags the caller supplies — damage type, "healing", whatever it has. */
  tags?: string[]
}

/**
 * Weighted by the deity's own portfolio so the pick reads as character rather
 * than as randomness: Lathander's clerics get light, dawn, healing and
 * radiant before they get anything else his list happens to contain.
 *
 * Pure and deterministic given `rng`. The caller supplies the candidate list
 * (from lib/data/spells.json, filtered to class and level) so this file never
 * needs to load the 377 KB dataset to be tested.
 */
export function affinityScore(spell: SpellLike, deity: Deity | null): number {
  const portfolio = (deity?.portfolio ?? []).map((p) => p.toLowerCase())
  if (portfolio.length === 0) return 0
  const hay = [spell.name, spell.school ?? "", ...(spell.tags ?? [])].join(" ").toLowerCase()
  return portfolio.reduce((n, term) => (term && hay.includes(term) ? n + 1 : n), 0)
}

export function selectGrantedSpells(
  candidates: SpellLike[],
  deity: Deity | null,
  count: number,
  rng: Rng,
): SpellLike[] {
  const n = Math.max(0, Math.trunc(count))
  if (n === 0 || candidates.length === 0) return []

  // Score first, then break ties with the rng, then take the top n. Sorting by
  // a pre-drawn jitter keeps this deterministic for a given rng sequence.
  const scored = candidates.map((spell) => ({
    spell,
    score: affinityScore(spell, deity),
    jitter: rng(),
  }))
  scored.sort((a, b) => (b.score - a.score) || (a.jitter - b.jitter))
  return scored.slice(0, n).map((s) => s.spell)
}

// ============================================================================
// THE WARLOCK COMMUNE
// ============================================================================
//
// The inversion that makes this worth having: a cleric's bad outcome is
// SILENCE. A warlock's bad outcome is ATTENTION. The patron always answers —
// that is what a pact is — so skipping your check-in does not get you ignored,
// it gets you noticed.

export type CommuneOutcome = "boon" | "indifference" | "displeasure" | "curse"

export const COMMUNE_OUTCOMES: readonly CommuneOutcome[] = [
  "boon",
  "indifference",
  "displeasure",
  "curse",
] as const

export interface CommuneInput {
  /** d100, 1..100. */
  roll: number
  /** The response number from lib/prayer.ts — conduct and cost still matter. */
  responseNumber: number
  observance: ObservanceState
  standing: Standing
}

export interface CommuneResult {
  outcome: CommuneOutcome
  /** How many steps worse than the roll alone would have given. */
  worsenedBy: number
  reasons: string[]
}

/** Homebrew (Sam, 2026-10-01). A patron is indifferent more often than not. */
export const COMMUNE_INDIFFERENCE_CEILING = 60

export function communeOutcome(input: CommuneInput): CommuneResult {
  const reasons: string[] = []
  const word = standingWord(input.standing)

  let index: number
  if (input.roll <= Math.max(1, input.responseNumber)) index = 0
  else if (input.roll <= COMMUNE_INDIFFERENCE_CEILING) index = 1
  else index = 2

  let worsenedBy = 0
  if (input.observance === "lapsed") {
    worsenedBy += 1
    reasons.push("the check-in was missed — the patron noticed, which is worse than being ignored")
  }
  if (word === "forsworn") {
    worsenedBy += 1
    reasons.push("a broken vow: the pact is a contract and it is in breach")
  }

  const final = Math.min(COMMUNE_OUTCOMES.length - 1, index + worsenedBy)
  if (final === 0) reasons.push("the patron is pleased, for now")

  return { outcome: COMMUNE_OUTCOMES[final], worsenedBy, reasons }
}

/**
 * A warlock is NEVER met with silence. Stated as a function so the contract is
 * testable rather than merely commented.
 */
export function patronAlwaysAnswers(): true {
  return true
}

export type { StandingWord }
