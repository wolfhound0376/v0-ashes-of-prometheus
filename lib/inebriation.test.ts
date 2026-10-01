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
