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
 *      marches and fights still add their own time on top.
 *
 *      The rate is Sam's (2026-11-13): "lets have shift changes occur every five minutes" and "we can say every
 *      shift occurs 4 game hours". 4 game hours in 5 real minutes is 48 game minutes a real minute. It was 15, and
 *      at 15 a run that lasted 25 real minutes only reached 02:47 on day 1 (fights swallow ticks) and never saw a
 *      single change of the watch, so Jorlan never came on. At 48 a whole game day is 30 real minutes.
 *
 *   2. THE WATCH CHANGES EVERY 4 GAME HOURS (WATCH_STARTS: 02:00, 06:00, 10:00, 14:00, 18:00, 22:00). Whenever the
 *      clock crosses one, for any reason, the stage counts a change of the watch — which is what brings Jorlan on
 *      with the 2nd or 3rd relief (lib/stage-roster jorlanAt). Malachar no longer has to remember to narrate it.
 *      A run starts at 00:00, so with nothing but the clock running the first change comes about 2.5 real minutes
 *      in, then one every 5; Jorlan at about 7.5 or 12.5.
 *
 *      The guards' watches are NOT the prisoners' work shifts any more. Labor keeps its three 8-hour shifts
 *      (lib/labor SHIFT_STARTS: 06:00, 14:00, 22:00); those three are also watch changes, the other three are the
 *      guards' alone.
 *
 * Pure rules here; the database writes are in lib/time-tracking (logTimeEvent) and app/api/map-stage (the tick).
 */

/** Game minutes per real minute while the table plays (Sam, 2026-11-13: a 4-hour watch every 5 real minutes). */
export const GAME_MINUTES_PER_REAL_MINUTE = 48
/** When the guard changes, in minutes of the day: every 4 game hours (Sam: "every shift occurs 4 game hours"). */
export const WATCH_STARTS = [2 * 60, 6 * 60, 10 * 60, 14 * 60, 18 * 60, 22 * 60] as const
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
 * How many changes of the watch (WATCH_STARTS, every 4 game hours) the clock passed going from `before` to `after`. A change exactly at
 * `after` counts; one exactly at `before` was already counted when the clock reached it. Backwards or equal: none.
 */
export function shiftChangesBetween(before: ClockPoint | null, after: ClockPoint | null): number {
  if (!before || !after) return 0
  const a = totalMinutes(before), b = totalMinutes(after)
  if (b <= a) return 0
  let n = 0
  for (let day = Math.floor(a / 1440); day <= Math.floor(b / 1440); day++) {
    for (const s of WATCH_STARTS) {
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
