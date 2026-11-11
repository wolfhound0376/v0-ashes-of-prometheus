import { describe, it, expect } from "vitest"
import { returnsToStash, STASH_MARK } from "./confiscation"

// Sam, 2026-11-10: New Game returns the confiscated gear a hero took to the stash. These pin which rows go back.
describe("returnsToStash", () => {
  const live = new Set(["fifi", "kenta"])
  const take = (row: string, owner?: string, at = "2026-11-11T00:00:00Z") => ({
    inventory_item_id: row,
    detail: { [STASH_MARK]: true, ...(owner ? { owner_id: owner } : {}) },
    occurred_at: at,
  })

  it("sends a stash take back, as its owner's confiscated property again", () => {
    expect([...returnsToStash([take("dagger-1", "fifi")], live)]).toEqual([["dagger-1", "fifi"]])
  })

  it("leaves loot from bodies and chests alone", () => {
    const loot = { inventory_item_id: "crossbow-1", detail: { from: "a body", same_item: true }, occurred_at: "x" }
    expect(returnsToStash([loot], live).size).toBe(0)
  })

  it("returns ownerless stash gear with no owner", () => {
    expect(returnsToStash([take("robe-1")], live).get("robe-1")).toBeNull()
  })

  it("does not name an owner who no longer exists", () => {
    expect(returnsToStash([take("spear-1", "deleted-hero")], live).get("spear-1")).toBeNull()
  })

  it("counts a row once however many times it was taken, newest line winning", () => {
    const out = returnsToStash([take("axe-1", "kenta", "2026-11-11T02:00:00Z"), take("axe-1", "fifi", "2026-11-11T01:00:00Z")], live)
    expect([...out]).toEqual([["axe-1", "kenta"]])
  })

  it("ignores lines with no row or a mark that is not exactly true", () => {
    const bad = [
      { inventory_item_id: null, detail: { [STASH_MARK]: true } },
      { inventory_item_id: "a", detail: { [STASH_MARK]: "true" } },
      { inventory_item_id: "b", detail: null },
    ]
    expect(returnsToStash(bad, live).size).toBe(0)
  })
})
