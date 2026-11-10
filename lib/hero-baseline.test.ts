import { describe, it, expect } from "vitest"
import { BASELINE_COLUMNS, baselinePatch, baselinePlan } from "./hero-baseline"

const fifiL1 = { id: "f", name: "Fifi", level: 1, xp: 0, xp_to_next: 300, hp_max: 8, hp_current: 3, sheet_hit_dice: "1d8", sheet_features: [{ name: "Sneak Attack", source: "Rogue 1" }], sheet_currency: { gp: 0 }, voice_id: "v", conditions: ["poisoned"] }

describe("baselinePatch", () => {
  it("copies only the baseline columns, zeroes XP and wakes the hero at full hit points", () => {
    const p = baselinePatch({ ...fifiL1, xp: 40 })!
    expect(p.level).toBe(1)
    expect(p.xp).toBe(0)
    expect(p.hp_max).toBe(8)
    expect(p.hp_current).toBe(8)
    expect(p.sheet_features).toEqual(fifiL1.sheet_features)
    expect("voice_id" in p).toBe(false)      // identity is not the baseline's business
    expect("conditions" in p).toBe(false)    // the restart's own step clears those
    expect("id" in p).toBe(false)
  })
  it("refuses a thing that is not a hero's row", () => {
    expect(baselinePatch(null)).toBeNull()
    expect(baselinePatch({ foo: 1 })).toBeNull()
  })
  it("never writes a column outside the list", () => {
    const p = baselinePatch(fifiL1)!
    for (const k of Object.keys(p)) expect([...BASELINE_COLUMNS, "hp_current"]).toContain(k)
  })
})

describe("baselinePlan", () => {
  it("restores heroes with a baseline, captures level-1 heroes without, and reports the rest", () => {
    const plan = baselinePlan(
      [{ id: "a", level: 3 }, { id: "b", level: 1 }, { id: "c", level: 2 }, { id: "d", level: null }],
      new Set(["a"]),
    )
    expect(plan.restore.map((h) => h.id)).toEqual(["a"])
    expect(plan.capture.map((h) => h.id)).toEqual(["b", "d"])
    expect(plan.missing.map((h) => h.id)).toEqual(["c"])
  })
})
