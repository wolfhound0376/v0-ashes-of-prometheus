import { describe, expect, it } from "vitest"
import { swimFactor, underwaterAttack, weaponOnList, UW_MELEE_OK, huntParty, huntDueRound, HUNT_ROUNDS } from "./water.mjs"

describe("swimming (SRD 5.1)", () => {
  it("costs double without a swimming speed, normal with one", () => {
    expect(swimFactor(0)).toBe(2)
    expect(swimFactor(undefined)).toBe(2)
    expect(swimFactor(30)).toBe(1)
  })
})

describe("underwater melee", () => {
  it("is at disadvantage unless the weapon is a dagger, javelin, shortsword, spear or trident", () => {
    expect(underwaterAttack({ melee: true, weapon: "Longsword" }).edge).toBe(-1)
    expect(underwaterAttack({ melee: true, weapon: "Greataxe" }).edge).toBe(-1)
    expect(underwaterAttack({ melee: true, weapon: "Unarmed Strike" }).edge).toBe(-1)
    for (const w of ["Dagger", "Shortsword", "Spear", "Trident", "Javelin", "Shortsword (Lolth's Tooth)"]) expect(underwaterAttack({ melee: true, weapon: w }).edge).toBe(0)
  })
  it("is never at disadvantage for a swimmer", () => {
    expect(underwaterAttack({ melee: true, weapon: "Greataxe", swimSpeed: 30 }).edge).toBe(0)
  })
  it("does not mistake a longsword for a shortsword", () => {
    expect(weaponOnList("Longsword", UW_MELEE_OK)).toBe(false)
  })
})

describe("underwater ranged", () => {
  it("automatically misses beyond normal range", () => {
    expect(underwaterAttack({ melee: false, weapon: "Light Crossbow", beyondNormal: true }).autoMiss).toBe(true)
  })
  it("shoots straight with a crossbow, at disadvantage with a bow or sling", () => {
    expect(underwaterAttack({ melee: false, weapon: "Light Crossbow" }).edge).toBe(0)
    expect(underwaterAttack({ melee: false, weapon: "Hand Crossbow" }).edge).toBe(0)
    expect(underwaterAttack({ melee: false, weapon: "Shortbow" }).edge).toBe(-1)
    expect(underwaterAttack({ melee: false, weapon: "Sling" }).edge).toBe(-1)
  })
  it("throws a javelin, spear or dart straight, but a thrown dagger at disadvantage", () => {
    expect(underwaterAttack({ melee: false, weapon: "Javelin", thrown: true }).edge).toBe(0)
    expect(underwaterAttack({ melee: false, weapon: "Dart", thrown: true }).edge).toBe(0)
    expect(underwaterAttack({ melee: false, weapon: "Dagger", thrown: true }).edge).toBe(-1)
  })
})

describe("the hunt clock", () => {
  it("walks in at the start of the fifth round", () => {
    expect(HUNT_ROUNDS).toBe(4)
    expect(huntDueRound(1)).toBe(5)
  })
  it("brings Jorlan unless he stands aside", () => {
    expect(huntParty()).toEqual(["jorlan", "drow-guard-male", "drow-guard-female"])
    expect(huntParty({ jorlanStandsAside: true })).not.toContain("jorlan")
  })
})
