import { describe, expect, it } from "vitest"
import { canBless, canMakeHolyWater, canPurify, isCleric, purified, spendSlot } from "./alchemy-cleric"
import type { RiteSheet } from "./camp-rites"

const samson = (over: Partial<NonNullable<RiteSheet["sheet_spellcasting"]>> = {}): RiteSheet => ({
  id: "s", name: "Samson", class: "Cleric",
  sheet_spellcasting: { slots: { "1": { max: 2, used: 0 } }, prepared: ["Healing Word"], always_prepared: [], cantrips: [], ...over },
})
const fifi: RiteSheet = { id: "f", name: "Fifi", class: "Rogue" }

describe("clerical help", () => {
  it("knows a cleric by class", () => {
    expect(isCleric({ class: "Cleric" })).toBe(true)
    expect(isCleric({ class: "Rogue" })).toBe(false)
  })

  it("blesses water for a cleric with a vial, and nobody else", () => {
    expect(canBless(samson(), { vials: 1, silver: 0 }).ok).toBe(true)
    expect(canBless(samson(), { vials: 0, silver: 0 }).ok).toBe(false)
    expect(canBless(fifi, { vials: 3, silver: 0 }).ok).toBe(false)
  })

  it("makes holy water only with silver, a vial and a free 1st-level slot (PHB)", () => {
    expect(canMakeHolyWater(samson(), { vials: 1, silver: 1 })).toEqual({ ok: true, slot: 1 })
    expect(canMakeHolyWater(samson(), { vials: 1, silver: 0 }).ok).toBe(false)
    expect(canMakeHolyWater(samson({ slots: { "1": { max: 2, used: 2 } } }), { vials: 1, silver: 1 }).ok).toBe(false)
  })

  it("purifies only with Purify Food and Drink prepared — a ritual, but it must be prepared", () => {
    expect(canPurify(samson()).ok).toBe(false)
    expect(canPurify(samson({ prepared: ["Purify Food and Drink"] })).ok).toBe(true)
    expect(canPurify(samson({ always_prepared: ["Purify Food and Drink"] })).ok).toBe(true)
  })

  it("purification is clean but weaker: impurity 0, potency down a tier, floor I", () => {
    expect(purified({ potency: 3, impurity: 3 })).toEqual({ potency: 2, impurity: 0 })
    expect(purified({ potency: 1, impurity: 2 })).toEqual({ potency: 1, impurity: 0 })
  })

  it("spends exactly one slot of the level asked, without touching the others", () => {
    const sc = { slots: { "1": { max: 2, used: 0 }, "2": { max: 1, used: 0 } } }
    expect(spendSlot(sc, 1).slots).toEqual({ "1": { max: 2, used: 1 }, "2": { max: 1, used: 0 } })
    expect(sc.slots["1"].used).toBe(0)
  })
})
