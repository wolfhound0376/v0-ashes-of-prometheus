import { describe, it, expect } from "vitest"
import { shiftChangesBetween, tickDue, GAME_MINUTES_PER_REAL_MINUTE, TICK_EVERY_MS, MAX_CATCH_UP_MS } from "./world-time"

const at = (day: number, hh: number, mm = 0) => ({ day, minutesOfDay: hh * 60 + mm })

describe("shiftChangesBetween (Sam, 2026-11-13: 'every shift occurs 4 game hours')", () => {
  it("counts nothing inside one watch", () => {
    expect(shiftChangesBetween(at(1, 2, 10), at(1, 5, 59))).toBe(0)
  })
  it("counts the first change of a run, 00:00 → 02:00", () => {
    expect(shiftChangesBetween(at(1, 0, 0), at(1, 2, 0))).toBe(1)
  })
  it("counts the 06:00 change when the clock reaches it", () => {
    expect(shiftChangesBetween(at(1, 5, 55), at(1, 6, 0))).toBe(1)
  })
  it("does not count a change the clock was already standing on", () => {
    expect(shiftChangesBetween(at(1, 6, 0), at(1, 7, 0))).toBe(0)
  })
  it("counts every change a long jump crosses (a long rest from 01:10 → 09:10 crosses 02:00 and 06:00)", () => {
    expect(shiftChangesBetween(at(1, 1, 10), at(1, 9, 10))).toBe(2)
    expect(shiftChangesBetween(at(1, 1, 10), at(2, 1, 10))).toBe(6)
  })
  it("crosses midnight", () => {
    expect(shiftChangesBetween(at(1, 21, 0), at(2, 7, 0))).toBe(3)   // 22:00, 02:00 and 06:00
  })
  it("never counts backwards or missing clocks", () => {
    expect(shiftChangesBetween(at(2, 1, 0), at(1, 23, 0))).toBe(0)
    expect(shiftChangesBetween(null, at(1, 7, 0))).toBe(0)
  })
  it("a 4-hour watch is 5 real minutes (Sam: 'shift changes occur every five minutes')", () => {
    expect((4 * 60) / GAME_MINUTES_PER_REAL_MINUTE).toBe(5)
  })
})

describe("tickDue (Sam: 'one minute in real life shouldn't be one minute in game time')", () => {
  const t0 = 1_800_000_000_000
  it("the first tick only starts the count", () => {
    expect(tickDue(null, t0)).toEqual({ due: true, minutes: 0 })
  })
  it("waits a real minute between ticks", () => {
    expect(tickDue(t0, t0 + TICK_EVERY_MS - 1).due).toBe(false)
  })
  it("a real minute is GAME_MINUTES_PER_REAL_MINUTE game minutes", () => {
    expect(tickDue(t0, t0 + 60_000)).toEqual({ due: true, minutes: GAME_MINUTES_PER_REAL_MINUTE })
  })
  it("does not race ahead after the table was closed", () => {
    const capped = Math.round((MAX_CATCH_UP_MS / 60_000) * GAME_MINUTES_PER_REAL_MINUTE)
    expect(tickDue(t0, t0 + 10 * 60 * 60_000).minutes).toBe(capped)
  })
  it("a clock tick from the future restarts the count", () => {
    expect(tickDue(t0 + 5000, t0)).toEqual({ due: true, minutes: 0 })
  })
})
