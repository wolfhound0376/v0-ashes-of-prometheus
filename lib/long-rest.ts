// A long rest, as SRD 5.1 writes it ("Resting"), and nothing it does not write.
//
// Pure. Numbers and words in, numbers and words out — the same arrangement as
// lib/death-saves. The chat route owns the rows; this file owns the rule, so
// the rule can be read in one place and tested without a database or a session.
//
// WHAT THE SRD ACTUALLY SAYS, because two of these clauses are routinely
// house-ruled away by accident and both of them matter at this table:
//
//   "A long rest is a period of extended downtime, at least 8 hours long..."
//
//   "A character must have at least 1 hit point at the start of the rest to
//    gain its benefits."          <- the party cannot sleep off being downed
//
//   "At the end of a long rest, a character regains all lost hit points. The
//    character also regains spent Hit Dice, up to a number of dice equal to
//    half of the character's total number of them (minimum of one die)."
//
//   "A character can't benefit from more than one long rest in a 24-hour
//    period."
//
// Spell slots come back because every spellcasting class in the SRD says so in
// its own entry, uniformly, at the end of a long rest.
//
// WHAT THIS DELIBERATELY DOES NOT DO
//
//   EXHAUSTION. The SRD reduces it by one on a long rest. There is no
//   exhaustion column on `characters`, and inventing a mechanic is how this
//   campaign has been bitten before (see lib/blood-marks on the Bleeding
//   condition that does not exist). Flagged, not faked.
//
//   FOOD. `characters.unfed_rest_streak` exists in the schema and is read by
//   no code anywhere in the repo. Starvation is a real SRD rule and this is
//   a prison campaign where it would bite — but wiring a dead column into a
//   rest on my own initiative is exactly the invented mechanic above. It stays
//   untouched and reported.
//
//   KILLING THE DYING. A character on death saves cannot be left to "rest"
//   for eight hours; in the fiction they resolve one way or the other in about
//   a minute. Deciding which is the DM's call, so this refuses to rest them
//   and says so, rather than quietly rolling out thousands of death saves.

/** Minutes in a day, for turning a (day, minute-of-day) pair into an instant. */
export const DAY_MINUTES = 1440

/** The SRD's bar: one long rest per 24 hours. */
export const REST_COOLDOWN_MINUTES = DAY_MINUTES

/**
 * A single point on the world clock. `game_day_after` / `minutes_of_day_after`
 * are stamped on every time_log row by the apply_time_log trigger, so the
 * previous rest's instant is recoverable exactly rather than estimated.
 */
export function absoluteMinutes(day: number, minutesOfDay: number): number {
  return (Math.max(1, Math.trunc(day)) - 1) * DAY_MINUTES + Math.max(0, Math.trunc(minutesOfDay))
}

/**
 * Hit Dice handed back: half the total, minimum one.
 *
 * Note the level-1 case, which is the whole party today: floor(1/2) is 0, and
 * the minimum is what makes it 1. Without that clause a level-1 character
 * never recovers a Hit Die at all.
 */
export function hitDiceRegained(level: number): number {
  return Math.max(1, Math.floor(Math.max(1, Math.trunc(level || 1)) / 2))
}

/** The slot map as `characters.sheet_spellcasting` stores it. */
export type SheetSpellcasting = {
  slots?: Record<string, { max?: number; used?: number } | null> | null
  [key: string]: unknown
}

/** Every slot back, `used` zeroed rather than rebuilt from `max`. */
export function refillSlots(sc: SheetSpellcasting | null): {
  slots: Record<string, { max?: number; used?: number }>
  restored: number
} {
  const src = sc?.slots ?? {}
  const slots: Record<string, { max?: number; used?: number }> = {}
  let restored = 0
  for (const [level, entry] of Object.entries(src)) {
    if (!entry) continue
    restored += entry.used ?? 0
    slots[level] = { ...entry, used: 0 }
  }
  return { slots, restored }
}

/** Where a character stands going into the night. */
export type RestVitality = "up" | "dying" | "stable" | "dead"

export interface Rester {
  name: string
  level: number | null
  hp: number | null
  hpMax: number | null
  /** `characters.hit_dice_remaining`. Null means the sheet does not track them. */
  hitDiceRemaining: number | null
  spellcasting: SheetSpellcasting | null
  vitality: RestVitality
}

export interface RestOutcome {
  /** Did the character get the benefits of a long rest? */
  benefited: boolean
  /** Hit points they wake with. */
  hp: number
  /** Hit Dice they wake with, or null where the sheet tracks none. */
  hitDiceRemaining: number | null
  /** Rebuilt slot map, or null when nothing should be written. */
  slots: Record<string, { max?: number; used?: number }> | null
  /** How many slots were handed back. */
  slotsRestored: number
  /** How many Hit Dice were handed back. */
  hitDiceBack: number
  /** Clear temp HP and death saves? Only for someone who actually rested. */
  clearTemp: boolean
  /** One line for the log, always present. */
  note: string
}

/**
 * Resolve one character's long rest.
 *
 * `minutesSinceLastRest` is game-time minutes since the party's previous long
 * rest, or null when there has never been one. Null is permissive on purpose:
 * a party that has never rested is not on cooldown.
 */
export function longRest(c: Rester, minutesSinceLastRest: number | null): RestOutcome {
  const max = c.hpMax ?? 0
  const hp = c.hp ?? 0
  const dice = c.hitDiceRemaining
  const nothing = (note: string, hpOut = hp): RestOutcome => ({
    benefited: false, hp: hpOut, hitDiceRemaining: dice, slots: null,
    slotsRestored: 0, hitDiceBack: 0, clearTemp: false, note,
  })

  // The dead do not rest, and a long rest is not a resurrection.
  if (c.vitality === "dead") return nothing(`${c.name} is dead. A long rest is not a resurrection.`)

  // On death saves. Not rested and NOT resolved — see the header.
  if (c.vitality === "dying") {
    return nothing(
      `${c.name} is dying and cannot rest. Stabilise or heal them before the party sleeps — ` +
      `eight hours of death saves is a ruling, not a calculation.`,
    )
  }

  // "A character can't benefit from more than one long rest in a 24-hour period."
  if (minutesSinceLastRest != null && minutesSinceLastRest < REST_COOLDOWN_MINUTES) {
    const hours = Math.floor(minutesSinceLastRest / 60)
    return nothing(
      `${c.name} rested ${hours}h ago — no benefit twice in 24 hours.`,
    )
  }

  // "A character must have at least 1 hit point at the start of the rest to
  // gain its benefits."
  //
  // A STABLE character at 0 still wakes at 1, and that is a different rule
  // doing the work: "A stable creature that isn't healed regains 1 hit point
  // after 1d4 hours." A long rest is eight, so the 1d4 has always elapsed.
  // They come round — but they had 0 when the rest began, so no slots and no
  // Hit Dice. That is the SRD being pointed rather than harsh: heal your
  // friends before you make camp.
  if (hp <= 0) {
    if (c.vitality === "stable") {
      return nothing(
        `${c.name} was stable at 0 and comes round with 1 hit point — but had none when the ` +
        `rest began, so gains nothing else from it.`,
        1,
      )
    }
    return nothing(`${c.name} was at 0 hit points when the rest began and gains nothing from it.`)
  }

  const { slots, restored } = refillSlots(c.spellcasting)
  const total = Math.max(1, Math.trunc(c.level || 1))
  const back = hitDiceRegained(total)
  // Never hand back more dice than the character owns; total Hit Dice equals
  // level for a single-classed character, which is everyone here.
  const diceOut = dice == null ? null : Math.min(total, dice + back)
  const diceActuallyBack = dice == null ? 0 : (diceOut as number) - dice

  const parts: string[] = []
  if (max > hp) parts.push(`${max - hp} hit points`)
  if (restored > 0) parts.push(`${restored} spell slot${restored === 1 ? "" : "s"}`)
  if (diceActuallyBack > 0) parts.push(`${diceActuallyBack} Hit Di${diceActuallyBack === 1 ? "e" : "ce"}`)

  return {
    benefited: true,
    hp: max,
    hitDiceRemaining: diceOut,
    slots,
    slotsRestored: restored,
    hitDiceBack: diceActuallyBack,
    clearTemp: true,
    note: parts.length
      ? `${c.name} finishes a long rest and regains ${parts.join(", ")}.`
      : `${c.name} finishes a long rest, already at full strength.`,
  }
}
