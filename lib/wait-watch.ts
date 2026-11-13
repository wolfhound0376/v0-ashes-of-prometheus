/**
 * Waiting out the watch (Sam, 2026-11-12: "Wait for the next watch button option is good").
 *
 * The pen's players may skip the lull: the clock jumps to the next change of the watch, and that change is counted
 * like any other (lib/time-tracking logTimeEvent counts every change the clock crosses, which is what brings Jorlan
 * on and what the caravan clock counts down).
 *
 * This file does not know WHEN the watch changes. It asks the one function that does (lib/world-time
 * shiftChangesBetween), minute by minute, so it stays right whatever that schedule is: three changes a day today,
 * six once the faster clock lands. Pure; the write is app/api/walk-wait.
 */
export interface WaitClock { day: number; minutesOfDay: number }

const DAY = 1440

/** The clock `m` minutes on. */
export function clockAfter(c: WaitClock, m: number): WaitClock {
  const total = (Math.max(1, Math.floor(c.day)) - 1) * DAY + Math.floor(c.minutesOfDay) + Math.max(0, Math.floor(m))
  return { day: Math.floor(total / DAY) + 1, minutesOfDay: total % DAY }
}

/**
 * Game minutes from `clock` to the next change of the watch: the smallest wait that crosses exactly one. Null when
 * no change comes within two days (a schedule with no changes at all), so the caller refuses instead of looping.
 */
export function minutesToNextWatch(
  clock: WaitClock,
  changesBetween: (before: WaitClock, after: WaitClock) => number,
): number | null {
  for (let m = 1; m <= 2 * DAY; m++) {
    if (changesBetween(clock, clockAfter(clock, m)) >= 1) return m
  }
  return null
}
