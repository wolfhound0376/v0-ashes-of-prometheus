// Prayer — the one thing you ask for that nobody owes you.
//
// Decision of record: docs/claude_Prayer_Module.md. Read it first; this file is
// the rules in that document and nothing the document does not say.
//
// Pure, like lib/camp and lib/game-context. Rows and rolls in, numbers and
// words out. The route owns the database; this file owns the rule, so the rule
// can be read in one place and tested without Supabase. Every function that
// rolls takes an `Rng` so the route can feed it the physical result from the
// Three.js dice roller (never lose the roller) and a test can script the faces.
//
// WHAT THIS MODULE IS NOT ALLOWED TO DO — the three rails. Breaking any one of
// them turns prayer into a resource bar, which is the failure mode the whole
// design exists to avoid:
//
//   1. Prayer NEVER produces a spell effect, healing, damage, or a bonus to AC,
//      attack or saves. That is Divine Intervention's job, it arrives at cleric
//      level 10, and it is the payoff of ten levels. `resolvePrayer` therefore
//      CANNOT return tier 4 — see TIER_ANSWER and its test. The cap (below)
//      makes prayer mathematically unable to out-roll the class feature too.
//   2. Prayer is never a pool. No points, no bar, nothing to spend down. The
//      only lever is conduct and cost already paid.
//   3. Silence is the common outcome and silence is CONTENT. Tier 0 is a thing
//      to write, not a null to swallow.
//
// SOURCES, so nothing here can be mistaken for an improvisation:
//   EDITION (Sam, 2026-10-01): SRD 5.2.1 (2025) is canon for this campaign.
//               That is what `class_spellcasting_progression` and every live
//               character sheet cite. BUT the only SRD text ingested into
//               `campaign_chunks` is SRD 5.1 — 5.2.1 is NOT in the database,
//               so no 5.2.1 rule can be quoted or verified from a session.
//               Ingesting it is open work and is the fix for this whole note.
//
//   THE CAP, restated so it does not rest on a citation we cannot check.
//               Divine Intervention is a 10th-level cleric feature in both
//               editions, but its mechanics differ between them, and the 5.1
//               version (percentile <= cleric level) is the one this module
//               was originally written against. The cap is therefore justified
//               on its own terms rather than by that rule: prayer's ceiling is
//               the character's CLERIC LEVEL, a number that is at or below
//               what the class feature offers under either edition, and which
//               prayer in practice almost never reaches. Nothing below depends
//               on which edition wins; if 5.2.1 is ingested later and its text
//               suggests a different ceiling, this is the constant to revisit.
//   SRD 5.1     Classes: Cleric — Channel Divinity: Turn Undead ("speak a
//               prayer"). Already a prayer in the rules; this module does not
//               touch it. (Cited from 5.1, the only SRD text ingested.)
//   SRD 5.1     Characterization: Backgrounds — Acolyte, Shelter of the
//               Faithful. Samson's only faith mechanic at level 1, and it is
//               social rather than supernatural. That is the register here.
//   SRD 5.1     Classes: Cleric Domains — Life Domain names Lathander among
//               the sun gods appropriate to it.
//   OotA-Exp    p.114, the Dawn Shroud spell: "created by clerics of the church
//               of Lathander". The church exists in this campaign's canon and
//               its signature is carried dawn — light made where there is none.
//   OotA-Exp    p.359, Lathander listed among non-evil sun deities whose
//               followers stand against Lolth's forces. This is why Samson sits
//               on the WIDE wrong-listener band inside a drow outpost.
//   Velkynvelve The slave pen is warded against casting and the prisoners have
//               no components. Prayer needs neither, which is the whole reason
//               this module is worth having at level 1.
//
//   EVERYTHING ELSE IS HOMEBREW. Every band, every threshold, every constant
//   below is invented and is Sam's to overrule. The ones he has explicitly
//   approved are marked "Sam, <date>"; any that he has NOT ruled on are marked
//   NEEDS SAM and surfaced in `flags` at runtime, so an unruled number can
//   never pass as a ruled one. As of 2026-10-01 there are none outstanding:
//   the response-number bands and the Reach rule are both approved.

import type { Rng } from "./game-context"

// ============================================================================
// DICE
// ============================================================================

/** d100, read as 1..100. Divine Intervention is "roll percentile", so this. */
export const d100 = (rng: Rng) => 1 + Math.floor(rng() * 100)

/** d20, for the wrong listener. Local copy so this file imports only `Rng`. */
export const d20 = (rng: Rng) => 1 + Math.floor(rng() * 20)

// ============================================================================
// SHAPES
// ============================================================================

export type Posture = "aloud" | "murmured" | "silent"

/**
 * Who can see that a prayer happened at all (Sam, 2026-10-01: "private unless
 * spoken aloud"). This is the same shape as the journal ruling — the act is
 * the petitioner's own until they make it audible. `silent` and `murmured`
 * are private to the petitioner and the DM; only `aloud` is party-visible.
 *
 * NOTE this is about the PRAYER, not the ANSWER. A Hand that turns a blade in
 * front of four witnesses is visible because its EFFECT is; what stays private
 * is that Samson asked, and what he asked for.
 */
export function prayerVisibility(posture: Posture): "private" | "party" {
  return posture === "aloud" ? "party" : "private"
}

export type OfferingKind = "none" | "costly" | "irreplaceable"

/**
 * What the petitioner gives. `verified` is the point: the route checks the
 * offering against the live sheet before it gets here. A promised cost is
 * worth nothing — an unverified offering scores zero and raises a flag.
 */
export interface Offering {
  kind: OfferingKind
  verified: boolean
  /** Free text for the log, e.g. "the carnelian". Never read by the maths. */
  note?: string
}

export type VowState = "open" | "kept" | "broken"

export interface Vow {
  text: string
  state: VowState
}

/** The hidden ledger. One per character per deity. Never shown as numbers. */
export interface Standing {
  attention: number
  accord: number
  debt: number
  vows?: Vow[]
}

export type ReachRuleKey = "dawn_hour"

export interface ReachRule {
  /** Applied when the petitioner is underground / cannot see the sky. */
  sunlessPenalty: number
  /** Replaces the penalty outright inside the window. Does not stack with it. */
  windowBonus: number
  /** Minutes past midnight, inclusive of both ends. */
  window: { startMinute: number; endMinute: number }
}

export interface Deity {
  slug: string
  name: string
  /** Omitted means this god's reach does not care where or when you are. */
  reach?: ReachRuleKey
  /** Slugs this god is canonically set against. Drives the wrong listener. */
  enemies?: string[]
  /**
   * What this god is a god OF, as lowercase terms. Used by lib/devotion.ts to
   * weight which spells get granted, so a Lathanderite's list reads as light
   * and dawn rather than as a random draw from the cleric list.
   */
  portfolio?: string[]
}

export interface PrayerContext {
  /**
   * The faith that holds this place, if any. Velkynvelve is Lolth's. A null
   * means nobody hostile is listening and the wrong listener never rolls.
   */
  locationFaith?: Deity | null
  /** True where there is no sky — the whole Underdark. */
  sunless?: boolean
  /** From `game_clock.minutes_of_day`. Undefined means the hour is unknown. */
  minutesOfDay?: number
  /** The gravity score of the moment. The SRD's "when your need is great". */
  gravity?: number
  /** A pen, a cell, a crawlway — somewhere a murmur still carries. */
  confined?: boolean
}

export interface Petitioner {
  /** Total character level. Only the cleric level below drives the cap. */
  clericLevel: number
  /** True only when this character is a cleric OF THE GOD BEING ADDRESSED. */
  isClericOfDeity: boolean
}

export interface PrayerInput {
  petitioner: Petitioner
  /** Null means "to whoever is listening" — a worse table on both axes. */
  deity: Deity | null
  standing: Standing
  offering: Offering
  posture: Posture
  context: PrayerContext
}

export type Tier = 0 | 1 | 2 | 3 | 4

export const TIER_SILENCE: Tier = 0
export const TIER_SIGN: Tier = 1
export const TIER_WITNESS: Tier = 2
export const TIER_HAND: Tier = 3

/**
 * What a Hand is allowed to be (Sam, 2026-10-01). A re-roll of one die already
 * rolled, one ally's death save, or one specific thing warded off — and Sam
 * ruled explicitly that a Hand MAY save a character from death. It is still
 * never a spell, never healing, and never a bonus to AC, attack or saves: the
 * god steadies a hand or turns a blade, it does not cast cure wounds.
 */
export const HAND_EFFECTS = ["reroll_one_die", "ally_death_save", "ward_one_thing"] as const
export type HandEffect = (typeof HAND_EFFECTS)[number]

/** Sam, 2026-10-01: yes, a Hand can pull someone back from dying. */
export const HAND_CAN_SAVE_FROM_DEATH = true
/**
 * Tier 4, "An Answer", IS Divine Intervention (SRD 5.1). This module never
 * returns it and must never learn how: at cleric 10 the character already owns
 * the feature, and prayer's job is to supply the ritual framing around it, not
 * a second copy of it. `resolvePrayer` raises `divineInterventionAvailable`
 * instead, and a test asserts tier 4 is unreachable.
 */
export const TIER_ANSWER: Tier = 4

export const TIER_NAMES: Record<Tier, string> = {
  0: "silence",
  1: "a sign",
  2: "a witness",
  3: "a hand",
  4: "an answer",
}

// ============================================================================
// THE REACH RULES (Sam, 2026-10-01 — approved as written)
// ============================================================================
//
// Lathander is a god of the dawn and there is no dawn in the Underdark. The
// rule: underground his reach is short, EXCEPT at the true dawn hour, which
// nobody down there can see. The only way Samson knows it is dawn is by having
// kept count of the days — which makes keeping the calendar a devotional act
// and makes the one hour his god reaches him something he has to earn by
// paying attention.
//
// Approved by Sam on 2026-10-01 as written. Delete this constant and
// `reachTerm` returns 0 for every god; nothing else in the module depends on
// it, so retuning later costs one edit here and nothing elsewhere.

export const REACH_RULES: Record<ReachRuleKey, ReachRule> = {
  dawn_hour: {
    sunlessPenalty: -1,
    windowBonus: 2,
    // 05:30–07:30. Wide enough that a character counting days by watches can
    // hit it; narrow enough that it is a thing you aim at, not a thing you sit in.
    window: { startMinute: 330, endMinute: 450 },
  },
}

// ============================================================================
// THE TERMS — RN = A + C + O + E + V + R − D, clamped to [0, CAP]
// ============================================================================

/** A — does it know your name yet. */
export function attentionTerm(attention: number): number {
  const a = clampInt(attention, 0, 100)
  if (a >= 80) return 3
  if (a >= 50) return 2
  if (a >= 20) return 1
  return 0
}

/** C — conduct against this god's tenets. The moral ledger. */
export function accordTerm(accord: number): number {
  const c = clampInt(accord, -100, 100)
  if (c >= 60) return 4
  if (c >= 25) return 2
  if (c >= 0) return 0
  if (c >= -49) return -1
  return -3
}

/**
 * O — cost already paid. An unverified offering is a promise, and promises are
 * worth nothing here, so it scores 0 and the caller is told why.
 */
export function offeringTerm(offering: Offering): number {
  if (!offering.verified) return 0
  if (offering.kind === "irreplaceable") return 3
  if (offering.kind === "costly") return 1
  return 0
}

/**
 * E — the SRD's "when your need is great", generalised to the gravity score.
 * Prayer in comfort is nearly never answered.
 */
export function extremityTerm(gravity: number | undefined): number {
  if (gravity == null) return 0
  const g = clampInt(gravity, 0, 100)
  if (g >= 70) return 3
  if (g >= 40) return 1
  return 0
}

/**
 * V — a vow in this god's name. One broken vow outweighs everything else and
 * also caps the tier (see `resolvePrayer`): no answer above a sign until it is
 * atoned for.
 */
export function vowTerm(vows: Vow[] | undefined): number {
  if (!vows || vows.length === 0) return 0
  if (vows.some((v) => v.state === "broken")) return -5
  if (vows.some((v) => v.state === "open")) return 2
  return 0
}

/** R — how far this god reaches into where you are standing. */
export function reachTerm(deity: Deity | null, ctx: PrayerContext): number {
  if (!deity?.reach) return 0
  const rule = REACH_RULES[deity.reach]
  if (!rule) return 0
  const inWindow =
    ctx.minutesOfDay != null &&
    ctx.minutesOfDay >= rule.window.startMinute &&
    ctx.minutesOfDay <= rule.window.endMinute
  if (inWindow) return rule.windowBonus
  return ctx.sunless ? rule.sunlessPenalty : 0
}

/**
 * D — debt. Subtracted, so a positive debt lowers the number. Truncated rather
 * than floored so that a god who owes YOU (negative debt) is worth exactly as
 * much as a debt of the same size costs.
 */
export function debtTerm(debt: number): number {
  return Math.trunc(clampInt(debt, -100, 100) / 25)
}

/**
 * CAP — the rail. Pinned to the cleric level so prayer can never out-roll
 * Divine Intervention (d100 <= cleric level) at any level, and sits far below
 * it in practice. A non-cleric, or a cleric of some other god, tops out at 5.
 * Addressing a god you have no standing with at all tops out at 2.
 */
export function capFor(petitioner: Petitioner, deity: Deity | null, standing: Standing): number {
  if (!deity) return CAP_STRANGER
  if (petitioner.isClericOfDeity) return Math.max(1, Math.trunc(petitioner.clericLevel || 0))
  const known = standing.attention > 0 || standing.accord !== 0 || standing.debt !== 0
  return known ? CAP_LAITY : CAP_STRANGER
}

export const CAP_LAITY = 5
export const CAP_STRANGER = 2

export interface ResponseTerms {
  attention: number
  accord: number
  offering: number
  extremity: number
  vow: number
  reach: number
  debt: number
  raw: number
  cap: number
}

export interface ResponseNumber {
  rn: number
  terms: ResponseTerms
  flags: string[]
}

export function responseNumber(input: PrayerInput): ResponseNumber {
  const { petitioner, deity, standing, offering, context } = input
  const flags: string[] = []

  const attention = attentionTerm(standing.attention)
  const accord = accordTerm(standing.accord)
  const off = offeringTerm(offering)
  const extremity = extremityTerm(context.gravity)
  const vow = vowTerm(standing.vows)
  const reach = reachTerm(deity, context)
  const debt = debtTerm(standing.debt)
  const cap = capFor(petitioner, deity, standing)

  if (offering.kind !== "none" && !offering.verified) {
    flags.push("offering not verified against the sheet — counted as nothing")
  }
  if (context.gravity == null) {
    flags.push("no gravity score for the moment — extremity counted as nothing")
  }
  if (reach !== 0) {
    flags.push(`reach rule "${deity?.reach}" applied (${reach > 0 ? "+" : ""}${reach}) — homebrew, approved Sam 2026-10-01`)
  }
  if (!deity) {
    flags.push("addressed to no god in particular — capped at 2 and a wider wrong listener")
  }

  const raw = attention + accord + off + extremity + vow + reach - debt
  const rn = clampInt(raw, 0, cap)

  return {
    rn,
    terms: { attention, accord, offering: off, extremity, vow, reach, debt, raw, cap },
    flags,
  }
}

// ============================================================================
// TIER BY MARGIN — one roll, no second roll
// ============================================================================

/**
 * The deeper under RN, the better the answer. A hand additionally requires a
 * paid offering, and a broken vow holds the whole thing down to a sign.
 */
export function tierFor(
  roll: number,
  rn: number,
  offeringScore: number,
  opts: { vowBroken?: boolean } = {},
): Tier {
  if (rn <= 0 || roll > rn) return TIER_SILENCE
  if (opts.vowBroken) return TIER_SIGN
  if (offeringScore >= 1 && roll <= Math.floor(rn / 3)) return TIER_HAND
  if (roll <= Math.floor((rn * 2) / 3)) return TIER_WITNESS
  return TIER_SIGN
}

/** What an answer costs you. A sign costs the god nothing, so it costs you nothing. */
export function debtForTier(tier: Tier): number {
  if (tier === TIER_HAND) return 25
  if (tier === TIER_WITNESS) return 10
  return 0
}

/**
 * Unpaid debt rots. At or above DEBT_ROT_FLOOR the ledger bleeds accord for
 * every in-game week it goes unanswered. This is the anti-vending-machine
 * mechanism: every answer makes the next one costlier.
 */
export const DEBT_ROT_FLOOR = 50
export const DEBT_ROT_PER_WEEK = -1

export function debtDecay(debt: number, weeks: number): number {
  if (debt < DEBT_ROT_FLOOR) return 0
  const w = Math.max(0, Math.trunc(weeks || 0))
  // Guarded because 0 * -1 is -0, and -0 survives JSON.stringify as "-0" and
  // fails an Object.is check downstream. A zero delta must be a plain zero.
  if (w === 0) return 0
  return w * DEBT_ROT_PER_WEEK
}

// ============================================================================
// THE WRONG LISTENER
// ============================================================================
//
// Rolled separately and rolled WHETHER OR NOT the prayer was answered. A
// successful prayer can still get you flogged. This is what makes prayer a
// decision instead of a free action.

export const WRONG_LISTENER_BAND = 2
export const WRONG_LISTENER_BAND_HATED = 4
export const WRONG_LISTENER_BAND_UNADDRESSED = 3

/**
 * The d20 result at or below which something notices. 0 means nothing is
 * listening and no roll should be made at all.
 */
export function wrongListenerRisk(posture: Posture, deity: Deity | null, ctx: PrayerContext): number {
  const hostile = ctx.locationFaith
  if (!hostile) return 0
  if (posture === "silent") return 0
  if (posture === "murmured" && !ctx.confined) return 0

  if (!deity) return WRONG_LISTENER_BAND_UNADDRESSED
  if (hostile.enemies?.includes(deity.slug)) return WRONG_LISTENER_BAND_HATED
  return WRONG_LISTENER_BAND
}

// ============================================================================
// THE PLAYER-FACING WORD
// ============================================================================
//
// The sheet shows a word, never a number. Order matters and is deliberate: a
// broken vow outranks everything, and debt outranks favour because being owed
// is the more pressing fact about the relationship.

export type StandingWord = "unknown" | "noticed" | "favoured" | "indebted" | "lapsed" | "forsworn"

export function standingWord(standing: Standing): StandingWord {
  if (standing.vows?.some((v) => v.state === "broken")) return "forsworn"
  if (standing.accord <= -50) return "lapsed"
  if (standing.debt >= DEBT_ROT_FLOOR) return "indebted"
  if (standing.accord >= 25 && standing.attention >= 20) return "favoured"
  if (standing.attention >= 20) return "noticed"
  return "unknown"
}

// ============================================================================
// RESOLUTION
// ============================================================================

export interface PrayerResult {
  responseNumber: number
  roll: number
  tier: Tier
  tierName: string
  terms: ResponseTerms
  /** Debt this answer adds to the ledger. Never negative. */
  debtDelta: number
  /** "party" only when spoken aloud (Sam, 2026-10-01). Otherwise private. */
  visibility: "private" | "party"
  /** 0 when nothing hostile was listening and no d20 was rolled. */
  wrongListenerBand: number
  wrongListenerRoll: number | null
  overheard: boolean
  /**
   * True when the petitioner is a cleric of this god at level 10 or above.
   * The route frames the prayer as the ritual around Divine Intervention and
   * hands off to the CLASS FEATURE. This module never resolves it.
   */
  divineInterventionAvailable: boolean
  flags: string[]
}

export function resolvePrayer(input: PrayerInput, rng: Rng): PrayerResult {
  const { rn, terms, flags } = responseNumber(input)
  const roll = d100(rng)
  const vowBroken = input.standing.vows?.some((v) => v.state === "broken") ?? false
  const tier = tierFor(roll, rn, terms.offering, { vowBroken })

  const band = wrongListenerRisk(input.posture, input.deity, input.context)
  const wrongListenerRoll = band > 0 ? d20(rng) : null
  const overheard = wrongListenerRoll != null && wrongListenerRoll <= band

  const divineInterventionAvailable =
    input.petitioner.isClericOfDeity && input.petitioner.clericLevel >= 10

  const out = [...flags]
  if (vowBroken) out.push("a vow in this god's name is broken — held to a sign until atoned")
  if (divineInterventionAvailable) {
    out.push("cleric 10+: Divine Intervention is the character's own feature — this prayer does not spend or duplicate it")
  }

  return {
    responseNumber: rn,
    roll,
    tier,
    tierName: TIER_NAMES[tier],
    terms,
    debtDelta: debtForTier(tier),
    visibility: prayerVisibility(input.posture),
    wrongListenerBand: band,
    wrongListenerRoll,
    overheard,
    divineInterventionAvailable,
    flags: out,
  }
}

// ============================================================================

function clampInt(n: number, lo: number, hi: number): number {
  const v = Math.trunc(Number.isFinite(n) ? n : 0)
  return Math.min(hi, Math.max(lo, v))
}
