import { describe, expect, it } from "vitest"
import { BOOK_CONTAINERS, rollCount, settleRolls } from "./walk-loot"

// a seeded rng so the rolls are repeatable
// (warmed up: this generator's first draw from a small seed is always tiny, which would make every 1d4 a 1)
const seeded = (seed: number) => { const r = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }; r(); r(); return r }

describe("rolled counts in a chest (Sam, 2026-11-23: 1d4 healing potions in the chest outside the pen)", () => {
  it("rollCount stays inside the dice, and a malformed table entry is 0, never an invented count", () => {
    for (let i = 1; i < 400; i++){ const n = rollCount("1d4", seeded(i)); expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(4) }
    const seen = new Set(Array.from({ length: 400 }, (_, i) => rollCount("1d4", seeded(i + 1))))
    expect([...seen].sort()).toEqual([1, 2, 3, 4])
    expect(rollCount("d4")).toBe(0); expect(rollCount("1d")).toBe(0); expect(rollCount("four")).toBe(0)
  })

  it("the landing chest keeps Sam's 2026-11-13 contents and adds 1d4 potions of healing", () => {
    const e = BOOK_CONTAINERS["pen-landing-chest"].entries
    expect(e.find((x) => x.slug === "dagger")?.qty).toBe(1)
    expect(e.find((x) => x.slug === "thieves-tools")?.qty).toBe(2)
    expect(e.find((x) => x.slug === "drow-poison")?.qty).toBe(1)
    expect(e.find((x) => x.slug === "potion-of-healing")).toMatchObject({ roll: "1d4", qty: 4 })
  })

  it("is rolled once, then the same count every time anyone looks (kept in the run's record)", () => {
    const entries = BOOK_CONTAINERS["pen-landing-chest"].entries, rolls: Record<string, number> = {}
    const first = settleRolls(entries, rolls, seeded(7))
    expect(first.rolled).toBe(true)
    const n = first.entries.find((x) => x.slug === "potion-of-healing")!.qty
    expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(4)
    expect(rolls["potion-of-healing"]).toBe(n)
    for (let i = 1; i < 50; i++){
      const again = settleRolls(entries, rolls, seeded(i * 31))
      expect(again.rolled).toBe(false)
      expect(again.entries.find((x) => x.slug === "potion-of-healing")!.qty).toBe(n)
    }
    // the fixed entries are untouched, and the table itself is never rewritten
    expect(first.entries.find((x) => x.slug === "dagger")?.qty).toBe(1)
    expect(entries.find((x) => x.slug === "potion-of-healing")?.qty).toBe(4)
  })

  it("a container with no rolled entry comes back as it is and asks for no save", () => {
    const r = settleRolls(BOOK_CONTAINERS["ilvara-chest"].entries, {})
    expect(r.rolled).toBe(false)
    expect(r.entries).toEqual(BOOK_CONTAINERS["ilvara-chest"].entries)
  })
})

describe("a dead guard's pockets (Sam, 2026-11-23)", () => {
  it("guardPocketFor: a guard's own pocket, the escort's escort pocket, nobody else's", async () => {
    const { guardPocketFor } = await import("./walk-loot")
    expect(guardPocketFor("drow-guard-male", "pocket:drow-guard-male:pen-1-2")).toBe("pocket:drow-guard-male:pen-1-2")
    expect(guardPocketFor("drow-guard-female", "pocket:drow-guard-male:pen-1-2")).toBeNull()
    expect(guardPocketFor("escort-drow", "pocket:drow-guard-male:escort")).toBe("pocket:drow-guard-male:escort")
    expect(guardPocketFor("shoor", "pocket:drow-guard-male:pen-1-2")).toBeNull()
    expect(guardPocketFor("drow-guard-male", "pocket:ilvara")).toBeNull()
    expect(guardPocketFor("drow-guard-male", "ilvara-chest")).toBeNull()
    expect(guardPocketFor("drow-guard-male", null)).toBeNull()
  })
  it("wearPocket: what was taken stays counted; only what is left can break", async () => {
    const { wearPocket } = await import("./walk-loot")
    const pocket = [{ slug: "potion-of-healing", qty: 1 }, { slug: "drow-poison", qty: 1 }, { slug: "slave-pen-key", qty: 1 }]
    const allBreak = wearPocket(pocket, { "drow-poison": 1 }, () => 0, "fire")
    expect(allBreak.pocket).toEqual([{ slug: "drow-poison", qty: 1 }, { slug: "slave-pen-key", qty: 1 }])
    expect(allBreak.ruined.map((r) => r.slug)).toEqual(["potion-of-healing"])
    const noneBreak = wearPocket(pocket, {}, () => 0.999, "fire")
    expect(noneBreak.pocket).toEqual(pocket); expect(noneBreak.ruined).toEqual([])
  })
})

describe("one find out of several (pick)", () => {
  it("the laboratory's shelves hold exactly one of the four necromancy scrolls, the same one every look", () => {
    const entries = BOOK_CONTAINERS["necro-lab-shelves"].entries
    expect(entries.filter((e) => e.pick === "scroll")).toHaveLength(4)
    for (let face = 0; face < 4; face++) {
      const rolls: Record<string, number> = {}
      const first = settleRolls(entries, rolls, () => (face + 0.5) / 4)
      expect(first.rolled).toBe(true)
      expect(first.entries).toHaveLength(1)
      expect(first.entries[0].slug).toBe(entries[face].slug)
      const again = settleRolls(entries, rolls, () => 0.99)
      expect(again.rolled).toBe(false)
      expect(again.entries[0].slug).toBe(entries[face].slug)
    }
  })
})
