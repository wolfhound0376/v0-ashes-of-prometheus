import { describe, expect, it } from "vitest"
import { carryVerdict, isEncumbered, liftLimit, packWeight } from "./carry"

describe("packWeight", () => {
  it("is weight × quantity, summed", () => {
    expect(packWeight([{ weight: 3, quantity: 10 }, { weight: "0.5", quantity: 4 }, { weight: 13, quantity: 1 }])).toBe(45)
  })
  it("a row with no weight weighs nothing; a row with no quantity is one", () => {
    expect(packWeight([{ weight: null, quantity: 5 }, { weight: 2 }, { weight: 0, quantity: 9 }])).toBe(2)
  })
})

describe("carryVerdict (capacity STR × 15; past it encumbered; past twice it, refused)", () => {
  it("Fifi (120 lb) at 93.5 lb takes a 3 lb hand crossbow and is not encumbered", () => {
    const v = carryVerdict("Fifi", 93.5, 120, 3, "Hand crossbow")
    expect(v.ok).toBe(true); expect(v.encumbered).toBe(false)
  })
  it("exactly at capacity is not encumbered", () => {
    expect(carryVerdict("Fifi", 117, 120, 3, "Hand crossbow").encumbered).toBe(false)
    expect(isEncumbered(120, 120)).toBe(false)
  })
  it("past capacity is ALLOWED and encumbered (Sam, 2026-11-10)", () => {
    const v = carryVerdict("Fifi", 118, 120, 3, "Hand crossbow")
    expect(v.ok).toBe(true); expect(v.encumbered).toBe(true); expect(v.why).toBeNull()
  })
  it("twice the capacity is the most anyone can lift", () => {
    expect(liftLimit(120)).toBe(240)
    expect(carryVerdict("Fifi", 237, 120, 3, "Hand crossbow").ok).toBe(true)
    const v = carryVerdict("Fifi", 238, 120, 3, "Hand crossbow")
    expect(v.ok).toBe(false)
    expect(v.why).toBe("Fifi cannot lift that: 238 lb carried, the Hand crossbow weighs 3 lb, and 240 lb is the most they can lift at all. Drop or hand something off first.")
  })
  it("a stack says how many", () => {
    expect(carryVerdict("Kenta", 350, 180, 20, "Rations", 10).why).toContain("10 × Rations weigh 20 lb")
  })
  it("no capacity on the row is never encumbered", () => {
    expect(isEncumbered(999, null)).toBe(false)
  })
  it("no limit on the row, or a weightless thing, is never refused", () => {
    expect(carryVerdict("Ront", 999, null, 50, "Anvil").ok).toBe(true)
    expect(carryVerdict("Ront", 999, 0, 50, "Anvil").ok).toBe(true)
    expect(carryVerdict("Fifi", 500, 120, 0, "Feather").ok).toBe(true)
  })
})
