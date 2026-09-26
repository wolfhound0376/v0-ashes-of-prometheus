import { describe, expect, it } from "vitest"
import { canEquip, defaultSlotFor, normalizeSlot, slotAccepts, type EquippedRow } from "./equipped"

// Rows shaped like equipment_items as the doll reads them.
const worn = (slot: string, name: string, equipped = true): EquippedRow => ({ slot, name, item_key: null, equipped })

describe("slotAccepts", () => {
  it("matches a slot to itself and nothing else", () => {
    expect(slotAccepts("hands", "hands")).toBe(true)
    expect(slotAccepts("back", "back")).toBe(true)
    expect(slotAccepts("feet", "hands")).toBe(false)
    expect(slotAccepts("main_hand", "off_hand")).toBe(false)
  })

  it("fits a ring on either finger", () => {
    expect(slotAccepts("ring", "ring1")).toBe(true)
    expect(slotAccepts("ring", "ring2")).toBe(true)
    // A row once written for one finger still fits the other.
    expect(slotAccepts("ring1", "ring2")).toBe(true)
    expect(slotAccepts("ring2", "ring1")).toBe(true)
  })

  it("does not let a ring go anywhere but a finger", () => {
    expect(slotAccepts("ring", "hands")).toBe(false)
    expect(slotAccepts("ring", "neck")).toBe(false)
    expect(slotAccepts("hands", "ring1")).toBe(false)
  })

  it("is forgiving about case, whitespace and known aliases", () => {
    expect(slotAccepts(" Ring ", "RING2")).toBe(true)
    expect(slotAccepts("cloak", "back")).toBe(true)
    expect(slotAccepts("gloves", "hands")).toBe(true)
    expect(slotAccepts("ring_1", "ring1")).toBe(true)
    expect(normalizeSlot("Cloak")).toBe("back")
  })

  it("refuses an item with no slot", () => {
    expect(slotAccepts(null, "hands")).toBe(false)
    expect(slotAccepts("", "hands")).toBe(false)
    expect(slotAccepts("hands", null)).toBe(false)
  })
})

describe("defaultSlotFor", () => {
  it("sends a non-ring item to its one home", () => {
    expect(defaultSlotFor("hands", [])).toBe("hands")
    expect(defaultSlotFor("cloak", [])).toBe("back")
    expect(defaultSlotFor(null, [])).toBeNull()
  })

  it("puts a ring on the first empty finger", () => {
    expect(defaultSlotFor("ring", [])).toBe("ring1")
    expect(defaultSlotFor("ring", [worn("ring1", "Ring of Protection")])).toBe("ring2")
    expect(defaultSlotFor("ring", [worn("ring2", "Ring of Spell Storing")])).toBe("ring1")
  })

  it("ignores rows that are taken off, and falls back to the first finger when both are worn", () => {
    expect(defaultSlotFor("ring", [worn("ring1", "Old Ring", false)])).toBe("ring1")
    expect(defaultSlotFor("ring", [worn("ring1", "A"), worn("ring2", "B")])).toBe("ring1")
  })
})

describe("canEquip with the new slots", () => {
  it("lets gloves into the hands and a cloak onto the back", () => {
    expect(canEquip({ item: { name: "Leather Gloves", equippable_slot: "hands" }, slot: "hands", doll: [] })).toEqual({ ok: true, slot: "hands", replacing: null })
    expect(canEquip({ item: { name: "Piwafwi", equippable_slot: "back" }, slot: "back", doll: [] })).toEqual({ ok: true, slot: "back", replacing: null })
  })

  it("lets a ring onto either finger and names what it displaces", () => {
    const doll = [worn("ring1", "Ring of Protection")]
    expect(canEquip({ item: { name: "Ring of Spell Storing", equippable_slot: "ring" }, slot: "ring2", doll })).toEqual({ ok: true, slot: "ring2", replacing: null })
    expect(canEquip({ item: { name: "Ring of Spell Storing", equippable_slot: "ring" }, slot: "ring1", doll })).toEqual({ ok: true, slot: "ring1", replacing: "Ring of Protection" })
  })

  it("still refuses the wrong slot, with a sentence", () => {
    const verdict = canEquip({ item: { name: "Leather Gloves", equippable_slot: "hands" }, slot: "back", doll: [] })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe("Leather Gloves does not go in the back.")
  })

  it("reads the catalogue's slot when the pack row has none", () => {
    expect(canEquip({ item: { name: "Signet Ring", items: { equippable_slot: "ring" } }, slot: "ring2", doll: [] }).ok).toBe(true)
  })
})
