import { describe, expect, it } from "vitest"
import { itemEventRow, isMovementKind } from "./item-history"
import { bankedSuccesses } from "./repair"

describe("itemEventRow", () => {
  it("hangs the event on the inventory row and drops empty detail", () => {
    expect(itemEventRow({ inventoryItemId: "row-1", characterId: "fifi", kind: "acquire", detail: { from: "a body", slug: "hand-crossbow", qty: 1, note: "", by: null } }))
      .toEqual({ inventory_item_id: "row-1", character_id: "fifi", kind: "acquire", detail: { from: "a body", slug: "hand-crossbow", qty: 1 } })
  })
  it("writes nothing without a row to hang it on", () => {
    expect(itemEventRow({ inventoryItemId: null, characterId: "fifi", kind: "give" })).toBeNull()
  })
  it("knows a movement from a condition change", () => {
    expect(isMovementKind("give")).toBe(true)
    expect(isMovementKind("repair")).toBe(false)
  })
})

describe("a half-finished repair survives the item changing hands", () => {
  // newest first, as the camp repair route reads them
  const repair = (success: boolean) => ({ kind: "repair", detail: { success } })
  it("counted two successes before movement events existed", () => {
    expect(bankedSuccesses([repair(true), repair(false), repair(true)])).toEqual({ successes: 2, attempts: 3 })
  })
  it("still counts them when the sword was handed over and picked up in between", () => {
    expect(bankedSuccesses([{ kind: "give", detail: {} }, repair(true), { kind: "pickup", detail: {} }, repair(false), repair(true)])).toEqual({ successes: 2, attempts: 3 })
  })
  it("a condition change still ends the count", () => {
    expect(bankedSuccesses([repair(true), { kind: "degrade", detail: {} }, repair(true)])).toEqual({ successes: 1, attempts: 1 })
  })
})
