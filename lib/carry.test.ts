import { describe, expect, it } from "vitest"
import { carryVerdict, packWeight } from "./carry"

describe("packWeight", () => {
  it("is weight × quantity, summed", () => {
    expect(packWeight([{ weight: 3, quantity: 10 }, { weight: "0.5", quantity: 4 }, { weight: 13, quantity: 1 }])).toBe(45)
  })
  it("a row with no weight weighs nothing; a row with no quantity is one", () => {
    expect(packWeight([{ weight: null, quantity: 5 }, { weight: 2 }, { weight: 0, quantity: 9 }])).toBe(2)
  })
})

describe("carryVerdict (SRD: carrying capacity is STR × 15)", () => {
  it("Fifi (120 lb) at 93.5 lb takes a 3 lb hand crossbow", () => {
    expect(carryVerdict("Fifi", 93.5, 120, 3, "Hand crossbow").ok).toBe(true)
  })
  it("exactly at the limit is allowed", () => {
    expect(carryVerdict("Fifi", 117, 120, 3, "Hand crossbow").ok).toBe(true)
  })
  it("past the limit is refused, with the numbers", () => {
    const v = carryVerdict("Fifi", 118, 120, 3, "Hand crossbow")
    expect(v.ok).toBe(false)
    expect(v.why).toBe("Fifi cannot carry that: 118 of 120 lb carried, and the Hand crossbow weighs 3 lb. Drop or hand something off first.")
  })
  it("a stack says how many", () => {
    expect(carryVerdict("Kenta", 170, 180, 20, "Rations", 10).why).toContain("10 × Rations weigh 20 lb")
  })
  it("no limit on the row, or a weightless thing, is never refused", () => {
    expect(carryVerdict("Ront", 999, null, 50, "Anvil").ok).toBe(true)
    expect(carryVerdict("Ront", 999, 0, 50, "Anvil").ok).toBe(true)
    expect(carryVerdict("Fifi", 500, 120, 0, "Feather").ok).toBe(true)
  })
})
