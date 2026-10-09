import { describe, expect, it } from "vitest"
import {
  damageTypeOf, hasMagicWeapons, isMagicRarity, listCovers, mitigate, mitigationNote, vulnerabilitiesFromTraits,
} from "./damage-modifiers"

const mundane = (type: string) => ({ type, magical: false })
const magic = (type: string) => ({ type, magical: true })

// Lines exactly as the live bestiary holds them.
const SHADOWY = "acid, cold, fire, lightning, thunder; bludgeoning, piercing, and slashing from nonmagical attacks"
const SILVER = "cold, fire; bludgeoning, piercing, and slashing from nonmagical attacks not made with silvered weapons"
const SKELETON_TRAITS = [{ name: "Damage Vulnerabilities", desc: "bludgeoning (no vulnerabilities column on bestiary — stored here so the rules engine sees it)." }]

describe("listCovers", () => {
  it("reads a plain list", () => {
    expect(listCovers("necrotic", mundane("necrotic"))).toBe(true)
    expect(listCovers("bludgeoning, piercing, slashing", magic("slashing"))).toBe(true)
    expect(listCovers("acid, cold, fire", mundane("lightning"))).toBe(false)
  })
  it("applies 'from nonmagical attacks' only to a nonmagical source", () => {
    expect(listCovers(SHADOWY, mundane("piercing"))).toBe(true)
    expect(listCovers(SHADOWY, magic("piercing"))).toBe(false)
    expect(listCovers(SHADOWY, magic("fire"))).toBe(true) // the plain half still counts
  })
  it("treats the silvered tail as nonmagical, since nothing is silvered", () => {
    expect(listCovers(SILVER, mundane("slashing"))).toBe(true)
    expect(listCovers(SILVER, magic("slashing"))).toBe(false)
  })
  it("ignores circumstances the engine cannot see, and words inside words", () => {
    expect(listCovers("fire except while submerged", mundane("fire"))).toBe(false)
    expect(listCovers("poisonous", mundane("poison"))).toBe(false)
    expect(listCovers(null, mundane("fire"))).toBe(false)
    expect(listCovers("fire", { type: null, magical: false })).toBe(false)
  })
})

describe("mitigate", () => {
  it("halves on resistance, rounding down", () => {
    expect(mitigate(7, mundane("necrotic"), { resistances: "necrotic" })).toEqual({ amount: 3, why: "resists necrotic" })
  })
  it("doubles on vulnerability", () => {
    expect(mitigate(5, mundane("bludgeoning"), { vulnerabilities: "bludgeoning" })).toEqual({ amount: 10, why: "vulnerable to bludgeoning" })
  })
  it("applies resistance THEN vulnerability", () => {
    expect(mitigate(7, mundane("fire"), { resistances: "fire", vulnerabilities: "fire" }))
      .toEqual({ amount: 6, why: "resists and is vulnerable to fire" })
  })
  it("immunity is none of it, whatever else is listed", () => {
    expect(mitigate(9, mundane("poison"), { immunities: "poison", vulnerabilities: "poison" }))
      .toEqual({ amount: 0, why: "immune to poison" })
  })
  it("leaves untyped or zero damage alone", () => {
    expect(mitigate(9, { type: null, magical: false }, { resistances: "fire" })).toEqual({ amount: 9, why: null })
    expect(mitigate(0, mundane("fire"), { resistances: "fire" })).toEqual({ amount: 0, why: null })
  })
  it("a magic sword cuts what a mundane one cannot", () => {
    expect(mitigate(10, mundane("slashing"), { resistances: SHADOWY }).amount).toBe(5)
    expect(mitigate(10, magic("slashing"), { resistances: SHADOWY }).amount).toBe(10)
  })
})

describe("where the words come from", () => {
  it("reads the Skeleton's vulnerability out of its trait", () => {
    expect(vulnerabilitiesFromTraits(SKELETON_TRAITS)).toBe("bludgeoning")
    expect(vulnerabilitiesFromTraits([{ name: "Undead Fortitude", desc: "…" }])).toBe("")
    expect(vulnerabilitiesFromTraits(null)).toBe("")
  })
  it("knows the Magic Weapons trait", () => {
    expect(hasMagicWeapons([{ name: "Magic Weapons", desc: "The demon's weapon attacks are magical." }])).toBe(true)
    expect(hasMagicWeapons([{ name: "Magic Resistance" }])).toBe(false)
  })
  it("calls anything above common a magic item", () => {
    expect(["common", null, "", "mundane"].map(isMagicRarity)).toEqual([false, false, false, false])
    expect(["uncommon", "rare", "very_rare", "legendary", "artifact"].map(isMagicRarity)).toEqual([true, true, true, true, true])
  })
  it("reads the damage word out of a weapon line", () => {
    expect(damageTypeOf("1d6+1 Piercing")).toBe("piercing")
    expect(damageTypeOf("1 Bludgeoning")).toBe("bludgeoning")
    expect(damageTypeOf("2d6")).toBeNull()
  })
  it("writes the change for the log", () => {
    expect(mitigationNote(12, { amount: 6, why: "resists fire" })).toBe(" (resists fire: 12 → 6)")
    expect(mitigationNote(12, { amount: 12, why: null })).toBe("")
  })
})
