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

// Step 5: the one line a player sees on an item's card.
import { provenanceLine } from "./item-history"

describe("provenanceLine", () => {
  const at = (n: number) => `2026-11-11T0${n}:00:00Z`

  it("says nothing for a thing with no history", () => {
    expect(provenanceLine([])).toBeNull()
    expect(provenanceLine([{ kind: "repair", detail: {} }])).toBeNull()
  })

  it("names the body or container loot was taken from", () => {
    expect(provenanceLine([{ kind: "acquire", detail: { from: "a body" }, occurred_at: at(1) }])).toBe("Taken from a body.")
    expect(provenanceLine([{ kind: "acquire", detail: { from: "the crossbow rack" } }])).toBe("Taken from the crossbow rack.")
  })

  it("tells recovered kit apart from loot, and whose it was", () => {
    expect(provenanceLine([{ kind: "acquire", detail: { from: "Shoor's chest", from_stash: true, confiscated_from: "Fifi of Waterdeep" } }]))
      .toBe("Recovered from Shoor's chest, where the drow kept what they took from Fifi of Waterdeep.")
    expect(provenanceLine([{ kind: "acquire", detail: { from: "Ilvara's chest", from_stash: true } }])).toBe("Recovered from Ilvara's chest.")
  })

  it("adds who handed it over when that was the last move", () => {
    expect(provenanceLine([
      { kind: "give", detail: { from: "Kenta of Neverwinter" }, occurred_at: at(3) },
      { kind: "acquire", detail: { from: "a body" }, occurred_at: at(1) },
    ])).toBe("Taken from a body, then given by Kenta of Neverwinter.")
  })

  it("keeps the origin through a drop and a pick-up of the same item", () => {
    expect(provenanceLine([
      { kind: "acquire", detail: { from: "a body" }, occurred_at: at(1) },
      { kind: "drop", detail: { to: "the floor" }, occurred_at: at(2) },
      { kind: "pickup", detail: { from: "the floor", same_item: true }, occurred_at: at(3) },
    ])).toBe("Taken from a body.")
    expect(provenanceLine([{ kind: "pickup", detail: { from: "the floor", same_item: true } }])).toBe("Picked up off the floor.")
    expect(provenanceLine([{ kind: "pickup", detail: { from: "the floor" } }])).toBe("Picked up off the floor.")
  })

  it("does not pretend to know one source for a stack gathered from several", () => {
    expect(provenanceLine([
      { kind: "acquire", detail: { from: "a body" }, occurred_at: at(1) },
      { kind: "acquire", detail: { from: "the cases of bolts" }, occurred_at: at(2) },
    ])).toBe("Gathered from more than one place.")
  })

  it("handles a gift with nothing earlier on record", () => {
    expect(provenanceLine([{ kind: "give", detail: { from: "Jimjar" } }])).toBe("Given by Jimjar.")
  })
})
