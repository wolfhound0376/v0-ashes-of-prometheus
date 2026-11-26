import { describe, expect, it } from "vitest"
import { fightStartHp, woundsToWrite } from "./walk-hp"

const FIFI = "d00aa5b8-ced1-477d-9ec8-0861cca55498"

describe("fightStartHp (Sam, 2026-11-25: wounds are kept until a rest, a heal or a level)", () => {
  it("starts a hero from the sheet, not from their maximum", () => {
    expect(fightStartHp(8, 1)).toBe(1) // helped up at 1 hit point: the next fight starts at 1
    expect(fightStartHp(13, 6)).toBe(6)
  })
  it("never starts above the maximum", () => expect(fightStartHp(8, 20)).toBe(8))
  it("is full when the sheet carries no current number", () => {
    expect(fightStartHp(8, null)).toBe(8)
    expect(fightStartHp(8, undefined)).toBe(8)
  })
  it("gives a hero on their feet at least 1, and leaves a hero on the floor at 0", () => {
    expect(fightStartHp(8, 0)).toBe(1)
    expect(fightStartHp(8, 0, true)).toBe(0)
  })
})

describe("woundsToWrite", () => {
  it("keeps real ids and whole numbers from 0 up", () => {
    expect(woundsToWrite([{ characterId: FIFI, hp: 1 }])).toEqual([{ id: FIFI, hp: 1 }])
    expect(woundsToWrite([{ characterId: FIFI, hp: -4 }])).toEqual([{ id: FIFI, hp: 0 }])
    expect(woundsToWrite([{ characterId: FIFI, hp: 3.9 }])).toEqual([{ id: FIFI, hp: 3 }])
  })
  it("drops what is not a hero's line", () => {
    expect(woundsToWrite([{ characterId: "freia", hp: 1 }, { characterId: FIFI, hp: "x" }, null])).toEqual([])
    expect(woundsToWrite("nope")).toEqual([])
  })
  it("takes the last line for a hero", () => {
    expect(woundsToWrite([{ characterId: FIFI, hp: 5 }, { characterId: FIFI, hp: 1 }])).toEqual([{ id: FIFI, hp: 1 }])
  })
})
