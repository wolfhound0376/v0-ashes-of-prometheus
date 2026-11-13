import { describe, expect, it } from "vitest"
import { clockAfter, minutesToNextWatch } from "./wait-watch"
import { shiftChangesBetween } from "./world-time"

describe("waiting out the watch", () => {
  it("moves a clock on, across midnight", () => {
    expect(clockAfter({ day: 1, minutesOfDay: 0 }, 90)).toEqual({ day: 1, minutesOfDay: 90 })
    expect(clockAfter({ day: 1, minutesOfDay: 1430 }, 20)).toEqual({ day: 2, minutesOfDay: 10 })
    expect(clockAfter({ day: 3, minutesOfDay: 100 }, 0)).toEqual({ day: 3, minutesOfDay: 100 })
  })

  it("lands exactly on the next change, by the game's own schedule", () => {
    for (const start of [0, 1, 359, 360, 361, 700, 839, 1000, 1319, 1320, 1439]) {
      const clock = { day: 1, minutesOfDay: start }
      const m = minutesToNextWatch(clock, shiftChangesBetween)
      expect(m).not.toBeNull()
      // exactly one change is crossed by waiting that long, and none by waiting a minute less
      expect(shiftChangesBetween(clock, clockAfter(clock, m as number))).toBe(1)
      expect(shiftChangesBetween(clock, clockAfter(clock, (m as number) - 1))).toBe(0)
    }
  })

  it("standing ON a change waits for the one after it, not zero minutes", () => {
    const at = { day: 1, minutesOfDay: 0 }
    const first = minutesToNextWatch(at, shiftChangesBetween) as number
    const there = clockAfter(at, first)
    const second = minutesToNextWatch(there, shiftChangesBetween) as number
    expect(second).toBeGreaterThan(0)
    expect(shiftChangesBetween(at, clockAfter(there, second))).toBe(2)
  })

  it("works for any schedule it is handed", () => {
    const everyFour = (b: { day: number; minutesOfDay: number }, a: { day: number; minutesOfDay: number }) => {
      const t = (c: { day: number; minutesOfDay: number }) => (c.day - 1) * 1440 + c.minutesOfDay
      let n = 0
      for (let x = t(b) + 1; x <= t(a); x++) if (x % 240 === 120) n++
      return n
    }
    expect(minutesToNextWatch({ day: 1, minutesOfDay: 0 }, everyFour)).toBe(120)
    expect(minutesToNextWatch({ day: 1, minutesOfDay: 120 }, everyFour)).toBe(240)
    expect(minutesToNextWatch({ day: 1, minutesOfDay: 1400 }, everyFour)).toBe(160)
  })

  it("refuses a schedule in which the watch never changes", () => {
    expect(minutesToNextWatch({ day: 1, minutesOfDay: 0 }, () => 0)).toBeNull()
  })
})
