import { describe, expect, it } from "vitest"
import { POCKETS, PRISONERS, pocketEntries, scavengedRoll } from "./walk-loot"

describe("what is in the pockets (OotA ch.1)", () => {
  it("gives the named characters what the book says they carry", () => {
    // the rank-and-file guards are rolled per guard (rollPockets, walk-loot.pockets.test.ts), not a fixed list
    expect(pocketEntries("drow-guard-male")).toEqual([])
    expect(pocketEntries("ilvara").map((e) => e.slug)).toEqual(["ilvara-chest-key"])
    expect(pocketEntries("shoor").map((e) => e.slug)).toEqual(["wand-of-viscid-globs"])
    expect(pocketEntries("asha")).toEqual([])
  })

  it("rolls each prisoner once on Scavenged Possessions, the same way every time", () => {
    for (const p of PRISONERS) {
      const a = scavengedRoll(p), b = scavengedRoll(p)
      expect(a).toEqual(b)
      expect(a.days).toBeGreaterThanOrEqual(1); expect(a.days).toBeLessThanOrEqual(10)
      expect(a.d20).toBeGreaterThanOrEqual(1); expect(a.d20).toBeLessThanOrEqual(20)
      expect(a.total).toBe(a.days + a.d20)
      if (a.total <= 9) expect(a.entry).toBeNull()
      else expect(a.entry?.qty).toBe(1)
    }
  })

  it("only ever hands out the book's eight results, from the catalogue", () => {
    const allowed = new Set(["gold-coin", "small-spider", "silk-rope", "carnelian-gem", "rusted-iron-bar", "flint-shard", "hand-crossbow-bolt-drow-poison"])
    for (let i = 0; i < 500; i++) {
      const e = scavengedRoll(`test-prisoner-${i}`).entry
      if (e) expect(allowed.has(e.slug)).toBe(true)
    }
  })

  it("maps totals to the book's bands", () => {
    // spot-check across many seeds: every band reachable, and 28+ is the single poisoned bolt
    const seen = new Map<string, number>()
    for (let i = 0; i < 4000; i++) {
      const r = scavengedRoll(`band-${i}`), k = r.entry?.slug ?? "nothing"
      seen.set(k, Math.max(seen.get(k) ?? 0, r.total))
      if (r.total >= 28) expect(r.entry?.slug).toBe("hand-crossbow-bolt-drow-poison")
      if (r.total >= 10 && r.total <= 12) expect(r.entry?.slug).toBe("gold-coin")
    }
    expect(seen.size).toBe(8)
  })

  it("keeps the named characters' pockets in POCKETS", () => {
    expect(Object.keys(POCKETS)).toEqual(expect.arrayContaining(["ilvara", "shoor"]))
  })
})
