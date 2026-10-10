import { describe, expect, it } from "vitest"
import {
  FRESH_DAY,
  GUIDES,
  MARCH_HOURS_PER_DAY,
  NAVIGATION_DC,
  PACES,
  bestNavigator,
  dayMilesAt,
  depart,
  guideByKey,
  hoursLeft,
  legMinutes,
  marchPassivePerception,
  navigate,
  navigatorFromGuide,
  navigatorFromSheet,
  newDay,
  normaliseDay,
  paceSummary,
  routeDays,
  walkLeg,
  type Navigator,
} from "./march"
import type { SheetSlice } from "../game-context"

const fixed = (...seq: number[]) => {
  let i = 0
  return () => seq[i++ % seq.length]
}
/** rng that makes d20 land on `face` (and d6 on `six`). */
const d20 = (face: number) => (face - 0.5) / 20
const d6 = (face: number) => (face - 0.5) / 6

const fifi: SheetSlice = {
  id: "fifi", name: "Fifi", level: 1, str_score: 8, dex_score: 16, con_score: 12, int_score: 12, wis_score: 14, cha_score: 13,
  proficiency_bonus: 2, sheet_skill_proficiencies: { survival: "proficient" },
}
const sarith: Navigator = navigatorFromGuide(guideByKey("sarith")!)

describe("Travel pace (OotA-Enc ch.2 p.24)", () => {
  it("transcribes the pace table", () => {
    expect(PACES.fast).toMatchObject({ bookMilesPerDay: 8, perceptionPenalty: -5, canForage: false, navigationMod: -5 })
    expect(PACES.normal).toMatchObject({ bookMilesPerDay: 6, perceptionPenalty: 0, canForage: true, navigationMod: 0 })
    expect(PACES.slow).toMatchObject({ bookMilesPerDay: 4, canForage: true, improvedForageOrStealth: true, navigationMod: 5 })
  })

  it("Velkynvelve to Sloobludop is 8 days at normal pace, a third less fast, a third more slow", () => {
    expect(routeDays(56, "normal", 7)).toBeCloseTo(8)
    expect(routeDays(56, "fast", 7)).toBeCloseTo(8 * (2 / 3))
    expect(routeDays(56, "slow", 7)).toBeCloseTo(8 * (4 / 3))
  })

  it("scales the route's own day_miles rather than substituting the generic 8/6/4", () => {
    expect(dayMilesAt("normal", 7)).toBe(7)
    expect(dayMilesAt("fast", 7)).toBeCloseTo(10.5)
    expect(dayMilesAt("slow", 7)).toBeCloseTo(5.25)
    // No route figure: fall back to the 7 the encounter accumulator already uses.
    expect(dayMilesAt("normal", 0)).toBe(7)
  })

  it("a day's miles costs eight hours whatever the pace", () => {
    for (const p of ["fast", "normal", "slow"] as const) expect(legMinutes(dayMilesAt(p, 7), p, 7)).toBe(MARCH_HOURS_PER_DAY * 60)
    // One of the 51 hops on the painted road: 56/51 miles ≈ 1.1 miles ≈ 75 min at normal pace.
    expect(legMinutes(56 / 51, "normal", 7)).toBe(75)
  })

  it("the fast pace takes 5 off passive Perception", () => {
    expect(marchPassivePerception({ ...fifi, passive_perception: 14 }, "fast")).toBe(9)
    expect(marchPassivePerception({ ...fifi, passive_perception: 14 }, "slow")).toBe(14)
    // Derived when the sheet stores none: 10 + WIS(+2), no perception proficiency.
    expect(marchPassivePerception(fifi, "normal")).toBe(12)
  })

  it("writes the departure sheet's three lines", () => {
    const s = paceSummary(56, 7)
    expect(s.map((x) => x.pace)).toEqual(["fast", "normal", "slow"])
    expect(s[1].label).toContain("8 days")
    expect(s[0].label).toContain("5.3 days")
  })
})

describe("Becoming lost (p.25)", () => {
  it("DC 10 Survival; slow +5, fast −5", () => {
    expect(NAVIGATION_DC).toBe(10)
    // Sarith rolls at +0. A 9 fails at normal pace, passes at slow pace, and a 14 fails at fast pace.
    expect(navigate(sarith, "normal", fixed(d20(9), d6(3))).lost).toBe(true)
    expect(navigate(sarith, "slow", fixed(d20(9))).lost).toBe(false)
    expect(navigate(sarith, "fast", fixed(d20(14), d6(2))).lost).toBe(true)
    expect(navigate(sarith, "normal", fixed(d20(10))).lost).toBe(false)
  })

  it("a failed check loses 1d6 hours, and says so with the working", () => {
    const r = navigate(sarith, "normal", fixed(d20(3), d6(5)))
    expect(r).toMatchObject({ mode: "check", roll: 3, total: 3, lost: true, lostHours: 5, lostDie: 5 })
    expect(r.note).toContain("d20(3) + Survival(+0) = 3 vs DC 10")
    expect(r.note).toContain("wanders 5 hours")
  })

  it("a party with no one who knows the region is automatically lost, 4 hours at a time, no die rolled", () => {
    const pc = navigatorFromSheet(fifi)
    expect(pc).toMatchObject({ name: "Fifi", survivalBonus: 4, familiar: false })
    let calls = 0
    const r = navigate(pc, "slow", () => (calls++, 0.99))
    expect(r).toMatchObject({ mode: "unfamiliar", lost: true, lostHours: 4, roll: null })
    expect(calls).toBe(0)
    expect(navigate(null, "normal", () => 0.5)).toMatchObject({ mode: "unfamiliar", lost: true, navigator: "No one" })
  })

  it("a map of an explored route means no chance of getting lost", () => {
    const r = navigate(navigatorFromSheet(fifi, { hasMap: true }), "fast", () => 0)
    expect(r).toMatchObject({ mode: "map", lost: false, lostHours: 0 })
  })

  it("the DM can declare a player character familiar with the region", () => {
    const r = navigate(navigatorFromSheet(fifi, { familiar: true }), "normal", fixed(d20(6)))
    expect(r).toMatchObject({ mode: "check", total: 10, lost: false })
  })

  it("picks the best Survival among candidates, first named on ties", () => {
    const a: Navigator = { name: "A", survivalBonus: 2, familiar: true }
    const b: Navigator = { name: "B", survivalBonus: 5, familiar: true }
    const c: Navigator = { name: "C", survivalBonus: 5, familiar: true }
    expect(bestNavigator([a, b, c])?.name).toBe("B")
    expect(bestNavigator([])).toBeNull()
  })
})

describe("The guides (p.22)", () => {
  it("rates the prisoners as the book does", () => {
    expect(navigatorFromGuide(guideByKey("sarith")!)).toMatchObject({ familiar: true, survivalBonus: 0 })
    expect(navigatorFromGuide(guideByKey("eldeth")!)).toMatchObject({ familiar: false, survivalBonus: 5 })
    expect(navigatorFromGuide(guideByKey("ront")!)).toMatchObject({ familiar: false })
    expect(navigatorFromGuide(guideByKey("jimjar")!).familiar).toBe(true)
    expect(guideByKey("nope")).toBeNull()
    expect(GUIDES.map((g) => g.key)).toContain("shuushar")
  })
})

describe("The day (PHB ch.8: eight hours of travel)", () => {
  it("departing sets the pace and owes a navigation check; walking rolls it once", () => {
    const day = depart(FRESH_DAY, "slow")
    expect(day).toMatchObject({ pace: "slow", hours_today: 0, navigation_due: true })
    const leg = walkLeg(day, 1, 7, sarith, fixed(d20(15)))
    expect(leg.navigation?.lost).toBe(false)
    expect(leg.day.navigation_due).toBe(false)
    const leg2 = walkLeg(leg.day, 1, 7, sarith, fixed(d20(1), d6(6)))
    expect(leg2.navigation).toBeNull() // not owed again until tomorrow
    expect(leg2.lostMinutes).toBe(0)
  })

  it("charges the hours, lost time included, and calls nightfall at eight", () => {
    // Lost 2 hours at the start, then 7 miles at normal pace (8 h) = 10 h: the day ends on this leg.
    const leg = walkLeg(depart(FRESH_DAY, "normal"), 7, 7, sarith, fixed(d20(2), d6(2)))
    expect(leg.lostMinutes).toBe(120)
    expect(leg.walkMinutes).toBe(480)
    expect(leg.minutes).toBe(600)
    expect(leg.nightfall).toBe(true)
    expect(leg.day).toMatchObject({ days_marched: 1, navigation_due: true, lost_hours_total: 2 })
    expect(leg.note).toContain("Make camp")
  })

  it("eight short hops at normal pace make a day; the eighth ends it, not the seventh", () => {
    let day = depart(FRESH_DAY, "normal")
    const hop = 7 / 8 // one eighth of the day's miles
    for (let i = 1; i <= 8; i++) {
      const leg = walkLeg(day, hop, 7, sarith, fixed(d20(20)))
      day = leg.day
      expect(leg.nightfall).toBe(i === 8)
    }
    expect(hoursLeft(day)).toBe(0)
    const tomorrow = newDay(day)
    expect(tomorrow).toMatchObject({ hours_today: 0, navigation_due: true, days_marched: 1 })
  })

  it("the fast pace buys more miles before camp, the slow pace fewer", () => {
    const fast = walkLeg(depart(FRESH_DAY, "fast"), 10.5, 7, sarith, fixed(d20(20)))
    const slow = walkLeg(depart(FRESH_DAY, "slow"), 5.25, 7, sarith, fixed(d20(20)))
    expect(fast.nightfall).toBe(true)
    expect(slow.nightfall).toBe(true)
    expect(walkLeg(depart(FRESH_DAY, "slow"), 7, 7, sarith, fixed(d20(20))).day.hours_today).toBeCloseTo(10.67, 1)
  })

  it("reads a half-written database row without inventing a pace", () => {
    expect(normaliseDay(null)).toEqual(FRESH_DAY)
    expect(normaliseDay({ pace: "brisk", hours_today: "3.5", navigation_due: false })).toMatchObject({ pace: "normal", hours_today: 3.5, navigation_due: false })
  })
})
