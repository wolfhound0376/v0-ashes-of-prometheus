import { describe, expect, it } from "vitest"
import { currentLevel, levelCondition, quaff, withLevel } from "./inebriation"

const beer = { class: "beer", save_dc: 10, steps_per_drink: 1 }
const smallBeer = { class: "beer", save_dc: 10, steps_per_drink: 1, max_level: 1 }
const liquor = { class: "liquor", save_dc: 14, steps_per_drink: 2 }

describe("the ladder (Sam's rulings)", () => {
  it("level 1 is Warm and costs Dexterity", () => {
    expect(levelCondition(1)).toBe("Warm (inebriated 1)")
  })

  it("a failed save climbs one step on beer, two on liquor", () => {
    expect(quaff(0, 5, beer).after).toBe(1)
    expect(quaff(0, 5, liquor).after).toBe(2)
  })

  it("a made save holds the level", () => {
    expect(quaff(1, 10, beer)).toMatchObject({ after: 1, resisted: true })
    expect(quaff(0, 14, liquor)).toMatchObject({ after: 0, resisted: true })
  })

  it("never passes Ruined (4)", () => {
    expect(quaff(3, 1, liquor).after).toBe(4)
  })

  it("small beer can never take you past Warm", () => {
    expect(quaff(0, 1, smallBeer).after).toBe(1)
    expect(quaff(1, 1, smallBeer).after).toBe(1)
  })

  it("small beer never LOWERS a level you already have", () => {
    expect(quaff(3, 1, smallBeer).after).toBe(3)
  })
})

describe("on the sheet", () => {
  it("reads the level back off the conditions", () => {
    expect(currentLevel(["Prone", "Drunk (inebriated 2)"])).toBe(2)
    expect(currentLevel(["Prone"])).toBe(0)
  })

  it("swaps the old level for the new one, keeping everything else", () => {
    expect(withLevel(["Prone", "Warm (inebriated 1)"], 2)).toEqual(["Prone", "Drunk (inebriated 2)"])
  })

  it("Soused adds Poisoned; Ruined adds Unconscious too", () => {
    expect(withLevel([], 3)).toEqual(["Soused (inebriated 3)", "Poisoned"])
    expect(withLevel([], 4)).toEqual(["Ruined (inebriated 4)", "Unconscious", "Poisoned"])
  })

  it("does not strip a Poisoned that came from somewhere else", () => {
    expect(withLevel(["Poisoned"], 1)).toEqual(["Poisoned", "Warm (inebriated 1)"])
  })
})

import { conditionsFor, sober, HUNGOVER, type InebriationRecord } from "./inebriation"

describe("time sobers you up (Sam, 2026-10-01; LMoP's one-hour poisoning as the anchor)", () => {
  const t0 = "2026-10-01T20:00:00.000Z"
  const at = (mins: number) => new Date(new Date(t0).getTime() + mins * 60000)
  const drunk: InebriationRecord = { level: 2, since: t0 }

  it("holds for the first hour", () => {
    expect(sober(drunk, at(59), null).level).toBe(2)
  })

  it("drops one level an hour", () => {
    expect(sober(drunk, at(60), null).level).toBe(1)
    expect(sober(drunk, at(125), null).level).toBe(0)
  })

  it("keeps the remainder, so 90 minutes then 30 more is two levels", () => {
    const once = sober(drunk, at(90), null)
    expect(once.level).toBe(1)
    expect(sober(once, at(120), null).level).toBe(0)
  })

  it("uses the game clock when both ends have it", () => {
    const g: InebriationRecord = { level: 3, since: t0, since_game: 1000 }
    // Real time says nothing has passed; the game clock says two hours have.
    expect(sober(g, at(0), 1120).level).toBe(1)
  })

  it("coming round from Ruined leaves Hungover for 8 hours", () => {
    const ruined: InebriationRecord = { level: 4, since: t0 }
    const woke = sober(ruined, at(61), null)
    expect(woke.level).toBe(3)
    expect(conditionsFor([], woke)).toContain(HUNGOVER)
    const later = sober(woke, at(60 + 8 * 60 + 1), null)
    expect(later.hangover_until ?? null).toBeNull()
    expect(conditionsFor([], later)).not.toContain(HUNGOVER)
  })
})
