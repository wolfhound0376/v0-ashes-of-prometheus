import { describe, it, expect } from "vitest"
import {
  taste, isGrid, tastedEffect, columnOf, unknownColumns,
  TASTE_SAVE_DC, TASTE_EFFECT_TIER, type Grid,
} from "@/lib/eat-it-and-see"

// The real grid rows, straight off the seeded catalogue.
const BLUECAP: Grid = ["sicken", "long-march", "purge-disease", "steady-nerve"]
const RIPPLEBARK: Grid = ["restore-health", "rot", "long-march", "purge-disease"]

describe("isGrid", () => {
  it("accepts exactly four distinct non-empty strings", () => {
    expect(isGrid(BLUECAP)).toBe(true)
  })
  it("rejects the wrong length", () => {
    expect(isGrid(["a", "b", "c"])).toBe(false)
    expect(isGrid(["a", "b", "c", "d", "e"])).toBe(false)
  })
  it("rejects duplicates, because a repeated effect wastes a column", () => {
    expect(isGrid(["a", "b", "b", "d"])).toBe(false)
  })
  it("rejects empty and whitespace-only slugs", () => {
    expect(isGrid(["a", "", "c", "d"])).toBe(false)
    expect(isGrid(["a", "   ", "c", "d"])).toBe(false)
  })
  it("rejects non-arrays and nulls", () => {
    expect(isGrid(null)).toBe(false)
    expect(isGrid({ 0: "a" })).toBe(false)
    expect(isGrid("sicken")).toBe(false)
  })
  it("rejects non-string members", () => {
    expect(isGrid(["a", 2, "c", "d"])).toBe(false)
  })
})

describe("tastedEffect", () => {
  it("is always column 1", () => {
    expect(tastedEffect(BLUECAP)).toBe("sicken")
    expect(tastedEffect(RIPPLEBARK)).toBe("restore-health")
  })
  it("is null for a non-ingredient", () => {
    expect(tastedEffect(null)).toBeNull()
  })
})

describe("columnOf", () => {
  it("is 1-based, matching character_known_effects.column_index", () => {
    expect(columnOf(BLUECAP, "sicken")).toBe(1)
    expect(columnOf(BLUECAP, "steady-nerve")).toBe(4)
  })
  it("is null when the effect is not on that ingredient", () => {
    expect(columnOf(BLUECAP, "restore-health")).toBeNull()
  })
})

describe("unknownColumns", () => {
  it("lists what is still hidden", () => {
    expect(unknownColumns([1])).toEqual([2, 3, 4])
    expect(unknownColumns([1, 2, 3, 4])).toEqual([])
    expect(unknownColumns([])).toEqual([1, 2, 3, 4])
  })
})

describe("taste", () => {
  it("refuses an item with no grid rather than inventing one", () => {
    const r = taste({ grid: null, known: [], save: 15, harmful: false })
    expect(r).toEqual({ ok: false, reason: "not_an_ingredient" })
  })

  it("refuses a malformed grid instead of reading column 1 off it", () => {
    const r = taste({ grid: ["a", "b"], known: [], save: 15, harmful: false })
    expect(r).toEqual({ ok: false, reason: "bad_grid" })
  })

  it("refuses a non-numeric save", () => {
    const r = taste({ grid: BLUECAP, known: [], save: Number.NaN, harmful: true })
    expect(r).toEqual({ ok: false, reason: "bad_save" })
  })

  // The load-bearing rule. Failing the save must not also cost you the lesson.
  it("reveals column 1 even when the save FAILS", () => {
    const r = taste({ grid: BLUECAP, known: [], save: 3, harmful: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.revealed).toBe(true)
    expect(r.effect).toBe("sicken")
    expect(r.resisted).toBe(false)
    expect(r.applied).toEqual({ effect: "sicken", tier: TASTE_EFFECT_TIER })
  })

  it("reveals column 1 when the save passes, and applies nothing", () => {
    const r = taste({ grid: BLUECAP, known: [], save: 17, harmful: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.revealed).toBe(true)
    expect(r.resisted).toBe(true)
    expect(r.applied).toBeNull()
  })

  it("treats exactly the DC as a success, per SRD save rules", () => {
    const r = taste({ grid: BLUECAP, known: [], save: TASTE_SAVE_DC, harmful: true })
    expect(r.ok && r.resisted).toBe(true)
    const under = taste({ grid: BLUECAP, known: [], save: TASTE_SAVE_DC - 1, harmful: true })
    expect(under.ok && under.resisted).toBe(false)
  })

  it("teaches nothing the second time, but the effect still lands", () => {
    const r = taste({ grid: BLUECAP, known: [1], save: 2, harmful: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.firstTime).toBe(false)
    expect(r.revealed).toBe(false)
    expect(r.applied).toEqual({ effect: "sicken", tier: TASTE_EFFECT_TIER })
  })

  it("knowing columns 2-4 does not count as having tasted it", () => {
    const r = taste({ grid: BLUECAP, known: [2, 3, 4], save: 18, harmful: true })
    expect(r.ok && r.revealed).toBe(true)
  })

  // Column 1 is whatever the grid says, pleasant or not.
  it("does not reorder a grid to put a pleasant effect first", () => {
    const bad = taste({ grid: BLUECAP, known: [], save: 20, harmful: true })
    const good = taste({ grid: RIPPLEBARK, known: [], save: 20, harmful: false })
    expect(bad.ok && bad.effect).toBe("sicken")
    expect(good.ok && good.effect).toBe("restore-health")
  })

  it("applies at tier I only — a taste is never a strong dose", () => {
    const r = taste({ grid: RIPPLEBARK, known: [], save: 1, harmful: false })
    expect(r.ok && r.applied?.tier).toBe(1)
  })

  it("summary names the effect, the roll and the DC for the DM log", () => {
    const r = taste({ grid: BLUECAP, known: [], save: 4, harmful: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.summary).toContain("sicken")
    expect(r.summary).toContain("4")
    expect(r.summary).toContain(String(TASTE_SAVE_DC))
  })
})
