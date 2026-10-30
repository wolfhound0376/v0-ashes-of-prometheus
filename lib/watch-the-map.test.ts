import { describe, it, expect } from "vitest"
import { makePull, shouldFollowPull, PULL_FRESH_MS } from "./watch-the-map.mjs"

const now = 1_700_000_000_000

describe("pulling a screen to the map (Sam, 2026-10-30)", () => {
  it("a party-wide cue pulls every screen", () => {
    const p = makePull("the guards are shooting", { at: now })
    expect(shouldFollowPull(p, { now, hero: "Gandalf" })).toBe(true)
    expect(shouldFollowPull(p, { now, hero: "Lynkes" })).toBe(true)
    expect(shouldFollowPull(p, { now, dm: true, hero: null })).toBe(true)
  })

  it("a cue for one hero pulls that hero's screen and the DM's, nobody else's", () => {
    const p = makePull("Ront wants a word", { who: "gandalf", whoName: "Gandalf", at: now })
    expect(shouldFollowPull(p, { now, hero: "Gandalf" })).toBe(true)
    expect(shouldFollowPull(p, { now, hero: "gandalf  " })).toBe(true)   // same hero, carelessly typed
    expect(shouldFollowPull(p, { now, hero: "Lynkes" })).toBe(false)
    expect(shouldFollowPull(p, { now, dm: true, hero: null })).toBe(true)
  })

  it("a screen follows a cue once and is never pulled by it again", () => {
    const p = makePull("a fight has broken out", { at: now })
    expect(shouldFollowPull(p, { now, hero: "Fifi" })).toBe(true)
    expect(shouldFollowPull(p, { now, hero: "Fifi", seen: p.seq })).toBe(false)
    // the next cue is a different scene and does pull again
    const q = makePull("a fight has broken out", { at: now + 1000 })
    expect(shouldFollowPull(q, { now: now + 1000, hero: "Fifi", seen: p.seq })).toBe(true)
  })

  it("a stale cue is left alone: a browser opened later is not thrown at an old fight", () => {
    const p = makePull("the guards are shooting", { at: now })
    expect(shouldFollowPull(p, { now: now + PULL_FRESH_MS - 1, hero: "Fifi" })).toBe(true)
    expect(shouldFollowPull(p, { now: now + PULL_FRESH_MS + 1, hero: "Fifi" })).toBe(false)
  })

  it("a cue from a clock running ahead of ours is ignored, not followed forever", () => {
    const p = makePull("the guards are shooting", { at: now + 60000 })
    expect(shouldFollowPull(p, { now, hero: "Fifi" })).toBe(false)
  })

  it("nothing to follow is not a pull", () => {
    expect(shouldFollowPull(null, { now })).toBe(false)
    expect(shouldFollowPull(undefined, { now })).toBe(false)
    expect(shouldFollowPull({ seq: "", at: now, why: "x" }, { now })).toBe(false)
  })

  it("each cue is its own, and the reason is kept short enough to read", () => {
    const a = makePull("x", { at: now }), b = makePull("x", { at: now })
    expect(a.seq).not.toBe(b.seq)
    expect(makePull("y".repeat(200), { at: now }).why.length).toBe(80)
    expect(makePull("", { at: now }).why).toBe("something is happening")
  })
})
