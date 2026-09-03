// Exhaustion, as SRD 5.1 Appendix A writes it, and nothing it does not write.
//
// Pure. A level in, consequences out. The same arrangement as lib/death-saves
// and lib/long-rest: the rule lives in one readable place and is tested without
// a database, and the routes own the rows.
//
// WHY THIS FILE HAD TO EXIST BEFORE FOOD COULD BE REAL
//
// Starvation's ONLY consequence in the SRD is exhaustion. The codebase had the
// word "Exhaustion" in lib/conditions as one of a list of condition strings —
// a binary. A binary cannot say whether you are mildly tired or about to die,
// which is the entire mechanic. `characters.exhaustion` (0-6) is the fix, and
// this is the rule that reads it.
//
// THE SIX LEVELS ARE CUMULATIVE. A character at 3 has the effects of 1, 2 AND
// 3 — the table is not a switch, it is a ladder. Getting that wrong is the
// classic implementation bug: a level-4 character whose speed is fine because
// only the level-4 row was applied.

/** The SRD's own wording, level by level. Level 0 is not exhausted. */
export const EXHAUSTION_EFFECTS: Record<number, string> = {
  1: "Disadvantage on ability checks",
  2: "Speed halved",
  3: "Disadvantage on attack rolls and saving throws",
  4: "Hit point maximum halved",
  5: "Speed reduced to 0",
  6: "Death",
}

export const MAX_EXHAUSTION = 6

/** Clamp anything into the legal range. */
export function normaliseExhaustion(raw: unknown): number {
  const n = Math.trunc(Number(raw) || 0)
  return Math.max(0, Math.min(MAX_EXHAUSTION, n))
}

/**
 * Every effect in force at this level, cumulatively — level 3 carries 1 and 2
 * with it. Ordered as the table is, so a card can print them in the SRD's own
 * order.
 */
export function effectsAt(level: number): string[] {
  const n = normaliseExhaustion(level)
  const out: string[] = []
  for (let i = 1; i <= n; i++) out.push(EXHAUSTION_EFFECTS[i])
  return out
}

/** Level 1+: every ability check is at disadvantage. */
export function checksAtDisadvantage(level: number): boolean {
  return normaliseExhaustion(level) >= 1
}

/** Level 3+: attack rolls and saving throws are at disadvantage. */
export function attacksAndSavesAtDisadvantage(level: number): boolean {
  return normaliseExhaustion(level) >= 3
}

/** Level 6: the character is dead. */
export function isDeadOfExhaustion(level: number): boolean {
  return normaliseExhaustion(level) >= MAX_EXHAUSTION
}

/**
 * Walking speed after exhaustion.
 *
 * Cumulative, and the order matters: 5 sets it to 0 outright, which subsumes
 * the halving at 2. Halving first and then zeroing gives the same answer, but
 * checking 5 first is the reading that cannot drift.
 */
export function speedAfterExhaustion(speedFt: number, level: number): number {
  const n = normaliseExhaustion(level)
  const base = Math.max(0, speedFt || 0)
  if (n >= 5) return 0
  if (n >= 2) return Math.floor(base / 2)
  return base
}

/**
 * Hit point maximum after exhaustion. Level 4+ halves it.
 *
 * Rounding DOWN, and never below 1: a maximum of 0 is a character who cannot
 * exist rather than one who is badly off, and the SRD does not say the
 * halving kills you — level 6 is what kills you.
 */
export function hpMaxAfterExhaustion(hpMax: number, level: number): number {
  const n = normaliseExhaustion(level)
  const base = Math.max(0, hpMax || 0)
  if (n < 4) return base
  return Math.max(1, Math.floor(base / 2))
}

/** Short label for a card or a rail: "Exhaustion 3". Empty at level 0. */
export function exhaustionLabel(level: number): string {
  const n = normaliseExhaustion(level)
  return n > 0 ? `Exhaustion ${n}` : ""
}

// ============================================================================
// FOOD
// ============================================================================
//
// SRD 5.1, "Food and Water":
//
//   "A character needs one pound of food per day... A character can go without
//    food for a number of days equal to 3 + his or her Constitution modifier
//    (minimum 1). At the end of each day beyond that limit, a character
//    automatically suffers one level of exhaustion."
//
//   "A normal day of eating resets the count of days without food to zero."
//
// And on recovery:
//
//   "Exhaustion caused by lack of food or water can't be removed until the
//    character eats and drinks the full required amount."
//
// That last clause is the one that makes hunger frightening rather than
// annoying: a starving party cannot rest it off. It is why `fed` has to be
// decided BEFORE the long rest reduces anybody's exhaustion.

/** Ability modifier from a raw score, the usual floor((score - 10) / 2). */
export function abilityMod(score: number | null | undefined): number {
  const s = Number(score)
  if (!Number.isFinite(s)) return 0
  return Math.floor((s - 10) / 2)
}

/**
 * How many days this character can go hungry before it starts costing
 * exhaustion: 3 + CON modifier, minimum 1.
 *
 * The minimum matters for a frail character: at CON 6 the formula gives 1,
 * not 0, so nobody starts starving the instant they miss one meal.
 */
export function daysWithoutFood(conScore: number | null | undefined): number {
  return Math.max(1, 3 + abilityMod(conScore))
}

export interface HungerBefore {
  name: string
  conScore: number | null
  /** `characters.unfed_rest_streak` — days running without a proper meal. */
  unfedStreak: number | null
  exhaustion: number | null
}

export interface HungerOutcome {
  unfedStreak: number
  exhaustion: number
  /** True when this day pushed them past their limit and cost a level. */
  starved: boolean
  note: string | null
}

/**
 * Resolve one character's day of eating, or not eating.
 *
 * `fed` is decided at the party level — there were enough supplies, or there
 * were not — because that is how `party_supplies` and `rest_events` were built.
 */
export function resolveHunger(c: HungerBefore, fed: boolean): HungerOutcome {
  const exhaustion = normaliseExhaustion(c.exhaustion)
  const streak = Math.max(0, Math.trunc(Number(c.unfedStreak) || 0))

  // "A normal day of eating resets the count of days without food to zero."
  if (fed) {
    return {
      unfedStreak: 0,
      exhaustion,
      starved: false,
      note: streak > 0 ? `${c.name} eats properly for the first time in ${streak} day${streak === 1 ? "" : "s"}.` : null,
    }
  }

  const next = streak + 1
  const limit = daysWithoutFood(c.conScore)
  if (next <= limit) {
    return {
      unfedStreak: next,
      exhaustion,
      starved: false,
      note: `${c.name} goes hungry (${next} of ${limit} days before it starts to tell).`,
    }
  }

  const worse = Math.min(MAX_EXHAUSTION, exhaustion + 1)
  return {
    unfedStreak: next,
    exhaustion: worse,
    starved: true,
    note:
      `${c.name} has gone ${next} days without food, past a limit of ${limit}, and takes a level of ` +
      `exhaustion (now ${worse}${worse >= MAX_EXHAUSTION ? " — dead" : `: ${EXHAUSTION_EFFECTS[worse]}`}).`,
  }
}

/**
 * Can a long rest take a level of exhaustion off this character?
 *
 * SRD: a long rest reduces exhaustion by 1 — but "exhaustion caused by lack of
 * food or water can't be removed until the character eats". So a starving
 * character resting on an empty stomach keeps every level they have.
 *
 * `fed` is this rest's meal; `unfedStreakBefore` is whether they were already
 * running a debt when they lay down.
 */
export function longRestRelievesExhaustion(fed: boolean): boolean {
  return fed
}

/** How many supplies a rest costs: one per mouth. */
export function suppliesForParty(partySize: number): number {
  return Math.max(0, Math.trunc(partySize || 0))
}
