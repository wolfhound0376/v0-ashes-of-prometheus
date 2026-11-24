import { describe, expect, it } from "vitest"
import { hasKnackTable, knackDescription, knackWords, rollKnack } from "./item-knack"

// The Traveler's Cloak's catalogue row as it stood on 2026-11-24.
const cloak = { color: "red", benefit_roll: { "1": { dex: 1 }, "2": { stealth: 1 }, die: "1d2" } }
const cloakText = "A red hooded travelling cloak. Each one carries a small knack, set by a passive 1d2 when the cloak is found: 1 = +1 Dexterity, 2 = +1 Stealth, while worn."

describe("rollKnack", () => {
  it("a 1 is Dexterity and a 2 is Stealth", () => {
    expect(rollKnack(cloak, () => 0)).toEqual({ die: "1d2", face: 1, bonus: { dex: 1 } })
    expect(rollKnack(cloak, () => 0.49)).toEqual({ die: "1d2", face: 1, bonus: { dex: 1 } })
    expect(rollKnack(cloak, () => 0.5)).toEqual({ die: "1d2", face: 2, bonus: { stealth: 1 } })
    expect(rollKnack(cloak, () => 0.999999)).toEqual({ die: "1d2", face: 2, bonus: { stealth: 1 } })
  })
  it("is an even coin over many cloaks", () => {
    let dex = 0
    for (let i = 0; i < 4000; i++) if (rollKnack(cloak, () => (i + 0.5) / 4000)!.face === 1) dex++
    expect(dex).toBe(2000)
  })
  it("an item with no table has no knack", () => {
    expect(rollKnack({ color: "red" })).toBeNull()
    expect(rollKnack(null)).toBeNull()
    expect(hasKnackTable(cloak)).toBe(true)
    expect(hasKnackTable({})).toBe(false)
  })
  it("never invents one from a table it cannot read exactly", () => {
    expect(rollKnack({ benefit_roll: { die: "2d6", "1": { dex: 1 } } })).toBeNull() // not 1dN
    expect(rollKnack({ benefit_roll: { die: "1d2", "1": { dex: 1 } } }, () => 0.9)).toBeNull() // face 2 has no entry
    expect(rollKnack({ benefit_roll: { die: "1d2", "1": { dex: "lots" }, "2": {} } }, () => 0)).toBeNull()
    expect(rollKnack({ benefit_roll: "1d2" })).toBeNull()
  })
})

describe("the words on the item", () => {
  it("names abilities in full and skills in title case", () => {
    expect(knackWords({ dex: 1 })).toBe("+1 Dexterity")
    expect(knackWords({ stealth: 1 })).toBe("+1 Stealth")
    expect(knackWords({ sleight_of_hand: 2 })).toBe("+2 Sleight of Hand")
  })
  it("reads like the line already on Fifi's cloak", () => {
    expect(knackDescription(cloakText, { die: "1d2", face: 1, bonus: { dex: 1 } }))
      .toBe("A red hooded travelling cloak. +1 Dexterity while worn (passive 1d2 rolled 1).")
  })
})
