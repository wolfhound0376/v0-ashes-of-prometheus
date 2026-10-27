import { describe, expect, it } from "vitest"
import { rollPockets, parseContainer, POCKET_TABLE, PEN_KEY_SLUG } from "./walk-loot"

// a seeded rng so the rolls are repeatable
const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

describe("guard pockets (Sam, 2026-10-27: a 1d6 set of items)", () => {
  it("rolls between 1 and 6 draws, every thing from the table", () => {
    const slugs = new Set(POCKET_TABLE.map((r) => r.slug))
    for (let i = 1; i < 300; i++){
      const p = rollPockets("p2-100-200", seeded(i))
      expect(p.length).toBeGreaterThanOrEqual(1); expect(p.length).toBeLessThanOrEqual(6)
      for (const e of p){ expect(slugs.has(e.slug)).toBe(true); expect(e.qty).toBeGreaterThan(0) }
      expect(p.find((e) => e.slug === PEN_KEY_SLUG)?.qty ?? 0).toBeLessThanOrEqual(1)
      expect(p.find((e) => e.slug === "dagger")?.qty ?? 0).toBeLessThanOrEqual(1)
    }
  })
  it("the pen-gate guards and the escort always carry the key", () => {
    for (let i = 1; i < 50; i++){
      expect(rollPockets("pen-545-702", seeded(i)).some((e) => e.slug === PEN_KEY_SLUG)).toBe(true)
      expect(rollPockets("escort", seeded(i)).some((e) => e.slug === PEN_KEY_SLUG)).toBe(true)
    }
  })
  it("each guard is their own pocket; an old page's bare id is the shared default", () => {
    expect(parseContainer("pocket:drow-guard-male:pen-1-2")).toMatchObject({ kind: "pocket", key: "pocket:drow-guard-male:pen-1-2", which: "pen-1-2" })
    expect(parseContainer("pocket:drow-guard-male")).toMatchObject({ key: "pocket:drow-guard-male", which: "default" })
    expect(parseContainer("pocket:ilvara")).toMatchObject({ key: "pocket:ilvara" })   // a named NPC stays one pocket (#970)
  })
})
