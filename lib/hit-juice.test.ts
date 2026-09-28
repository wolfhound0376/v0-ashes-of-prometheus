import { describe, expect, it } from "vitest"
import { createHitJuice, weightForHit, type HitWeight } from "./hit-juice"

const F = 1 / 60
/** Run n frames, return the last result. */
function run(j: ReturnType<typeof createHitJuice>, n: number, dt = F) {
  let last = j.step(0)
  for (let i = 0; i < n; i++) last = j.step(dt)
  return last
}

describe("hitstop", () => {
  it("holds the game clock at zero and releases it", () => {
    const j = createHitJuice()
    j.hit("heavy", 1)
    // 14 frames of freeze: the game must not advance during them.
    for (let i = 0; i < 13; i++) {
      const r = j.step(F)
      expect(r.dt).toBe(0)
      expect(r.juice.frozen).toBe(true)
    }
    // and it must come back.
    const after = run(j, 4)
    expect(after.dt).toBeGreaterThan(0)
    expect(after.juice.frozen).toBe(false)
  })

  it("keeps the PRESENTATION moving while the game is frozen — the whole trick", () => {
    const j = createHitJuice()
    j.hit("heavy", 7)
    const a = j.step(F)
    const b = j.step(F)
    expect(a.dt).toBe(0)
    expect(b.dt).toBe(0)
    // frozen, yet the camera is doing something different on the two frames.
    expect(a.juice.shakeX === b.juice.shakeX && a.juice.shakeY === b.juice.shakeY).toBe(false)
    expect(b.juice.flash).toBeLessThan(a.juice.flash)
  })

  it("a flurry extends the freeze but can never hang the board", () => {
    const j = createHitJuice()
    for (let i = 0; i < 12; i++) j.hit("medium", i)
    let frozenFrames = 0
    for (let i = 0; i < 120; i++) if (j.step(F).dt === 0) frozenFrames++
    // MAX_FREEZE is 0.34s ~ 21 frames. Summing 12 medium hits would be 120.
    expect(frozenFrames).toBeLessThanOrEqual(22)
    expect(frozenFrames).toBeGreaterThan(5)
  })

  it("a heavier hit freezes longer than a lighter one", () => {
    const frames = (w: HitWeight) => {
      const j = createHitJuice()
      j.hit(w, 3)
      let n = 0
      for (let i = 0; i < 60; i++) if (j.step(F).dt === 0) n++
      return n
    }
    expect(frames("light")).toBeLessThan(frames("medium"))
    expect(frames("medium")).toBeLessThan(frames("heavy"))
    expect(frames("heavy")).toBeLessThan(frames("crit"))
  })
})

describe("slow motion", () => {
  it("only a KO slows time, and it recovers to full speed", () => {
    const j = createHitJuice()
    j.hit("crit", 2)
    run(j, 40)
    expect(j.step(F).dt).toBeCloseTo(F, 5)

    const k = createHitJuice()
    k.hit("ko", 2)
    // past the freeze, into the slow tail
    let r = k.step(F)
    while (r.juice.frozen) r = k.step(F)
    expect(r.dt).toBeGreaterThan(0)
    expect(r.dt).toBeLessThan(F)
    // and back to normal after the tail
    const later = run(k, 90)
    expect(later.dt).toBeCloseTo(F, 5)
  })
})

describe("shake, flash, zoom", () => {
  it("everything decays back to a hard zero and the rig stops being touched", () => {
    const j = createHitJuice()
    j.hit("crit", 5)
    const end = run(j, 300)
    expect(end.juice.shakeX).toBe(0)
    expect(end.juice.shakeY).toBe(0)
    expect(end.juice.flash).toBe(0)
    expect(end.juice.zoom).toBe(0)
    expect(j.idle()).toBe(true)
  })

  it("shakes mostly vertically, the way Street Fighter does", () => {
    // Across many seeds the vertical excursion should dominate.
    let vert = 0, horiz = 0
    for (let seed = 0; seed < 60; seed++) {
      const j = createHitJuice()
      j.hit("heavy", seed)
      for (let i = 0; i < 10; i++) {
        const r = j.step(F)
        vert += Math.abs(r.juice.shakeY)
        horiz += Math.abs(r.juice.shakeX)
      }
    }
    expect(vert).toBeGreaterThan(horiz * 1.5)
  })

  it("is deterministic — two seats watching one fight see one camera", () => {
    const a = createHitJuice(); const b = createHitJuice()
    a.hit("heavy", 4242); b.hit("heavy", 4242)
    for (let i = 0; i < 30; i++) {
      const ra = a.step(F); const rb = b.step(F)
      expect(ra.juice.shakeX).toBe(rb.juice.shakeX)
      expect(ra.juice.shakeY).toBe(rb.juice.shakeY)
      expect(ra.dt).toBe(rb.dt)
    }
  })

  it("different seeds rattle in different directions", () => {
    const a = createHitJuice(); const b = createHitJuice()
    a.hit("heavy", 1); b.hit("heavy", 999)
    a.step(F); b.step(F)
    const ra = a.step(F); const rb = b.step(F)
    expect(ra.juice.shakeX).not.toBe(rb.juice.shakeX)
  })

  it("a second hit re-kicks the camera instead of dying inside the first fade", () => {
    const j = createHitJuice()
    j.hit("medium", 1)
    run(j, 20)
    const faded = j.step(F).juice.flash
    j.hit("medium", 2)
    const rekicked = j.step(F).juice.flash
    expect(rekicked).toBeGreaterThan(faded)
  })

  it("zoom punches in and eases back out", () => {
    const j = createHitJuice()
    j.hit("crit", 6)
    let peak = 0
    for (let i = 0; i < 12; i++) peak = Math.max(peak, j.step(F).juice.zoom)
    expect(peak).toBeGreaterThan(0.01)
    expect(run(j, 200).juice.zoom).toBe(0)
  })

  it("only a real hit moves anything", () => {
    const j = createHitJuice()
    const r = run(j, 30)
    expect(r.juice).toEqual({ shakeX: 0, shakeY: 0, flash: 0, zoom: 0, frozen: false })
    expect(r.dt).toBeCloseTo(F, 5)
    expect(j.idle()).toBe(true)
  })

  it("survives a tab that was backgrounded — a huge dt does not explode it", () => {
    const j = createHitJuice()
    j.hit("ko", 1)
    const r = j.step(30)
    expect(Number.isFinite(r.dt)).toBe(true)
    expect(r.dt).toBeGreaterThanOrEqual(0)
    expect(run(j, 5).juice.flash).toBeLessThanOrEqual(1)
  })

  it("reset puts it back to cold", () => {
    const j = createHitJuice()
    j.hit("ko", 1)
    j.reset()
    const r = j.step(F)
    expect(r.dt).toBeCloseTo(F, 5)
    expect(j.idle()).toBe(true)
  })
})

describe("weightForHit", () => {
  it("reads the fraction of the bar taken off, not the raw number", () => {
    // 12 damage is a scratch on a dragon and a hammer blow on a goblin.
    expect(weightForHit(12, 200)).toBe("light")
    expect(weightForHit(12, 40)).toBe("heavy")
  })

  it("puts crit and the killing blow above everything", () => {
    expect(weightForHit(1, 200, { crit: true })).toBe("crit")
    expect(weightForHit(1, 200, { killing: true })).toBe("ko")
    // the kill wins over the crit: a critical killing blow is a KO.
    expect(weightForHit(99, 100, { crit: true, killing: true })).toBe("ko")
  })

  it("does not divide by zero on a target with no max hp on record", () => {
    expect(weightForHit(10, 0)).toBe("light")
  })
})

// ───────────────────────────────────────────────────────────────────────────
// REGRESSION: every test above passed against a version with three real bugs
// in it, all of which were found by printing the actual curve rather than by
// asserting on it. These four are the assertions that would have caught them.
// ───────────────────────────────────────────────────────────────────────────
describe("the envelopes actually reach what the table specifies", () => {
  /** Largest vertical excursion over the first n frames, for one seed. */
  const peakShake = (w: HitWeight, seed: number, n = 40) => {
    const j = createHitJuice()
    j.hit(w, seed)
    let p = 0
    for (let i = 0; i < n; i++) p = Math.max(p, Math.abs(j.step(F).juice.shakeY))
    return p
  }

  it("a heavy hit shakes near its specified 0.080, not a tenth of it", () => {
    // Caught the Nyquist bug: at 34Hz sampled at 60fps the sine was aliased
    // so hard that the peak came out at 0.010.
    for (const seed of [0, 1, 7, 42, 999, 12345]) {
      expect(peakShake("heavy", seed)).toBeGreaterThan(0.06)
    }
  })

  it("the peak does not depend on which seed drew the direction", () => {
    // Caught the direction-magnitude bug: |dir| swung from 0.05 to 1.15, so
    // the same weight kicked an order of magnitude harder on some attack ids.
    const peaks = [0, 3, 11, 64, 500, 7777, 88888].map((s) => peakShake("heavy", s))
    const lo = Math.min(...peaks)
    const hi = Math.max(...peaks)
    expect(hi / lo).toBeLessThan(1.25)
  })

  it("a crit's zoom reaches its specified 0.035", () => {
    // Caught the value-proportional decay: zoom relaxed while it was still
    // approaching, so a heavy peaked at 0.008 of a specified 0.020.
    const j = createHitJuice()
    j.hit("crit", 4)
    let p = 0
    for (let i = 0; i < 30; i++) p = Math.max(p, j.step(F).juice.zoom)
    expect(p).toBeGreaterThan(0.030)
    expect(p).toBeLessThanOrEqual(0.0351)
  })

  it("the camera is STILL settling when the game unfreezes — no dead air", () => {
    // Caught the worst one: on a KO every envelope finished a third of the
    // way into a 20-frame freeze, leaving the board stopped with nothing at
    // all moving, which reads as the tab hanging rather than as a finisher.
    for (const w of ["heavy", "crit", "ko"] as const) {
      const j = createHitJuice()
      j.hit(w, 5)
      let r = j.step(F)
      let guard = 0
      while (r.juice.frozen && guard++ < 200) r = j.step(F)
      // the frame the game resumes on, something is still moving
      const moving = Math.abs(r.juice.shakeY) + r.juice.zoom
      expect(moving, `${w} had nothing moving when the freeze ended`).toBeGreaterThan(0.001)
    }
  })
})
