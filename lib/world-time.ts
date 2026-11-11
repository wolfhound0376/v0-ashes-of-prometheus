/**
 * THE CLOCK RUNS, AND THE WATCH FOLLOWS IT (Sam, 2026-11-10: "tie the guard to the shifts and one minute in real life
 * shouldn't be one minute in game time that would take forever").
 *
 * Two things this file owns:
 *
 *   1. TIME PASSES WHILE THE TABLE PLAYS. Before this, game time moved only when someone spoke to Malachar (5 game
 *      minutes an exchange), so an evening's play reached 01:10 on day 1 and no work shift or guard change ever came.
 *      Now, while a live map is open and no fight is on, every real minute is GAME_MINUTES_PER_REAL_MINUTE game
 *      minutes, logged on the same time_log the rest of the game uses (event "time_passes"). Exchanges, rests,
 *      marches and fights still add their own time on top. [HOUSE] the rate is Claude's number, flagged for Sam: at
 *      15, one 8-hour work shift is about 32 real minutes and a whole game day about an hour and a half.
 *
 *   2. EVERY SHIFT CHANGE IS A CHANGE OF THE WATCH. The work shifts (lib/labor SHIFT_STARTS: 06:00, 14:00, 22:00) are
 *      when the guards hand over too. Whenever the clock crosses one, for any reason, the stage counts a change of the
 *      watch — which is what brings Jorlan on with the 2nd or 3rd relief (lib/stage-roster jorlanAt). Malachar no longer
 *      has to remember to narrate it.
 *
 * Pure rules here; the database writes are in lib/time-tracking (logTimeEvent) and app/api/map-stage (the tick).
 */
import { SHIFT_STARTS } from "./labor"

/** [HOUSE] game minutes per real minute while the table plays. */
export const GAME_MINUTES_PER_REAL_MINUTE = 15
/** The tick is written at most this often (one row a real minute, whoever's screen asks). */
export const TICK_EVERY_MS = 60_000
/**
 * The most real time one tick may count. A gap longer than this means nobody had the map open (the table closed for
 * the night), and the world does not race ahead while nobody is playing.
 */
export const MAX_CATCH_UP_MS = 2 * 60_000

export interface ClockPoint { day: number; minutesOfDay: number }

const totalMinutes = (c: ClockPoint) => (Math.max(1, Math.floor(c.day)) - 1) * 1440 + Math.floor(c.minutesOfDay)

/**
 * How many shift changes (06:00, 14:00, 22:00) the clock passed going from `before` to `after`. A change exactly at
 * `after` counts; one exactly at `before` was already counted when the clock reached it. Backwards or equal: none.
 */
export function shiftChangesBetween(before: ClockPoint | null, after: ClockPoint | null): number {
  if (!before || !after) return 0
  const a = totalMinutes(before), b = totalMinutes(after)
  if (b <= a) return 0
  let n = 0
  for (let day = Math.floor(a / 1440); day <= Math.floor(b / 1440); day++) {
    for (const s of SHIFT_STARTS) {
      const t = day * 1440 + s
      if (t > a && t <= b) n++
    }
  }
  return n
}

/**
 * Is a tick due, and how many game minutes does it carry? `lastAt` is when the clock last ticked (ms), null when it
 * never has (the first screen starts the count; nothing is owed for the time before it).
 */
export function tickDue(lastAt: number | null, now: number): { due: boolean; minutes: number } {
  if (lastAt == null || !Number.isFinite(lastAt) || lastAt > now) return { due: true, minutes: 0 }
  const gap = now - lastAt
  if (gap < TICK_EVERY_MS) return { due: false, minutes: 0 }
  const counted = Math.min(gap, MAX_CATCH_UP_MS)
  return { due: true, minutes: Math.round((counted / 60_000) * GAME_MINUTES_PER_REAL_MINUTE) }
}
