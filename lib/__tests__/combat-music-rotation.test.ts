// Fights must not sound the same two nights running.
// Run: npx vitest run lib/__tests__/combat-music-rotation.test.ts
import { describe, it, expect } from "vitest"
import {
  nextCombatTrackId,
  COMBAT_ROTATION,
  COMBAT_BAG_KEY,
  COMBAT_LAST_KEY,
  type BagStore,
} from "../combat-music-rotation"

/** A localStorage stand-in, so the bag's persistence is what's under test. */
function fakeStore(initial: Record<string, string> = {}): BagStore & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v
    },
  }
}

/** Deal `n` fights through one persistent store, as a real table would. */
function deal(n: number, pool: readonly string[] = COMBAT_ROTATION, store = fakeStore()): string[] {
  return Array.from({ length: n }, () => nextCombatTrackId(pool, store))
}

describe("nextCombatTrackId", () => {
  it("always returns a track from the rotation", () => {
    for (const id of deal(200)) {
      expect(COMBAT_ROTATION).toContain(id)
    }
  })

  it("never plays the same theme twice in a row — the bug the coin flip had", () => {
    // 2,000 fights is far more than the campaign will ever run, and a single
    // adjacent repeat anywhere fails it. A coin flip fails this in ~2 draws.
    const played = deal(2000)
    const repeats = played.filter((id, i) => i > 0 && id === played[i - 1])
    expect(repeats).toEqual([])
  })

  it("never starves a theme — none sits out for long", () => {
    // Not "every theme once per N draws": the refill drops whatever just
    // played (that is what prevents an adjacent repeat across the bag seam),
    // so one track is held back from every bag after the first and the bags
    // deliberately do not align to fixed windows of N. Forcing the stricter
    // property on a three-track pool would make the order nearly predictable,
    // which is its own kind of fatigue. What must hold is that nothing is
    // left out for long.
    const n = COMBAT_ROTATION.length
    const played = deal(3000)
    const lastSeen = new Map<string, number>()
    let worstGap = 0
    played.forEach((id, i) => {
      const prev = lastSeen.get(id)
      if (prev !== undefined) worstGap = Math.max(worstGap, i - prev)
      lastSeen.set(id, i)
    })
    expect(worstGap).toBeGreaterThan(1) // no adjacent repeat, restated as a gap
    expect(worstGap).toBeLessThanOrEqual(2 * n)
  })

  it("carries the bag across remounts — the same store keeps dealing down", () => {
    // DynamicMusic remounts on every route change (dashboard -> /battle -> back).
    // Per-mount state would re-randomise; a shared store must not.
    const store = fakeStore()
    const first = nextCombatTrackId(COMBAT_ROTATION, store)
    const remaining = JSON.parse(store.data[COMBAT_BAG_KEY])
    expect(remaining).not.toContain(first)
    expect(remaining).toHaveLength(COMBAT_ROTATION.length - 1)
    expect(store.data[COMBAT_LAST_KEY]).toBe(first)
  })

  it("drops tracks removed from the rotation instead of waiting for the bag to drain", () => {
    const store = fakeStore({
      [COMBAT_BAG_KEY]: JSON.stringify(["a-retired-track", "another-retired-one"]),
    })
    expect(COMBAT_ROTATION).toContain(nextCombatTrackId(COMBAT_ROTATION, store))
  })

  it("survives a corrupt or hand-edited bag rather than throwing into a fight", () => {
    for (const junk of ["not json", "null", '{"not":"an array"}', "[1,2,3]"]) {
      const store = fakeStore({ [COMBAT_BAG_KEY]: junk })
      expect(COMBAT_ROTATION).toContain(nextCombatTrackId(COMBAT_ROTATION, store))
    }
  })

  it("still returns a track with no storage at all (SSR, blocked storage)", () => {
    expect(COMBAT_ROTATION).toContain(nextCombatTrackId(COMBAT_ROTATION, null))
  })

  it("throws away nothing when the rotation is a single track", () => {
    expect(nextCombatTrackId(["only-one"], fakeStore())).toBe("only-one")
  })

  it("spreads roughly evenly across the rotation", () => {
    const played = deal(3000)
    const counts = COMBAT_ROTATION.map((id) => played.filter((p) => p === id).length)
    const expected = played.length / COMBAT_ROTATION.length
    // A shuffle bag is near-exact; allow 10% drift for the refill's last-track rule.
    for (const c of counts) expect(Math.abs(c - expected) / expected).toBeLessThan(0.1)
  })
})
