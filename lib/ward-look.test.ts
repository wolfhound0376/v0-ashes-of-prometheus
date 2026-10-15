import { describe, expect, it } from "vitest"
import {
  SANCTUARY_ART, SANCTUARY_STRETCH, sanctuaryQuad, sanctuaryCentre,
  sanctuaryCastOpacity, sanctuaryHoldOpacity,
  RISE_SECONDS, CAST_HOLD_SECONDS, CAST_SECONDS, HOLD_DELAY, HOLD_OPACITY,
} from "./ward-look"

// The board's classic camera: 30 deg below horizontal, looking down -z.
const PITCH = Math.PI / 6
const UP = { x: 0, y: Math.cos(PITCH), z: -Math.sin(PITCH) }
const TOWARD = { x: 0, y: Math.sin(PITCH), z: Math.cos(PITCH) }
const FOOT = { x: 3, y: 0, z: 5 }
const MEDIUM = 0.38

/** Where a world point lands on an orthographic screen: (right, up). */
const screen = (p: { x: number; y: number; z: number }) => ({ x: p.x, y: p.x * 0 + p.y * UP.y + p.z * UP.z })

describe("sanctuaryQuad", () => {
  it("puts the crown halo over a medium figure's head", () => {
    const body = 1.7 * UP.y
    const q = sanctuaryQuad(body, MEDIUM)
    expect(SANCTUARY_ART.crown * q.h).toBeGreaterThan(body)
    // ...but only just: a halo a whole head above reads as a separate thing.
    expect(SANCTUARY_ART.crown * q.h).toBeLessThan(body * 1.25)
  })

  it("keeps the drawn proportions upright by the stretch, and no more", () => {
    const q = sanctuaryQuad(1.5, MEDIUM)
    expect(q.h / q.w).toBeCloseTo(SANCTUARY_STRETCH, 6)
  })

  it("never draws a floor ring narrower than the creature's footprint", () => {
    for (const r of [0.18, 0.3, 0.38, 0.8, 1.2]) {
      const q = sanctuaryQuad(0.5, r)       // a short body: the ring decides
      expect(SANCTUARY_ART.ring * q.w).toBeGreaterThanOrEqual(r * 2 - 1e-9)
    }
  })

  it("grows with a bigger body rather than clipping it", () => {
    expect(sanctuaryQuad(3, 0.8).h).toBeGreaterThan(sanctuaryQuad(1.5, 0.38).h)
  })
})

describe("sanctuaryCentre", () => {
  const q = sanctuaryQuad(1.7 * UP.y, MEDIUM)
  const c = sanctuaryCentre(FOOT, UP, TOWARD, q)

  it("stands the drawn floor ring on the creature's feet, on screen", () => {
    // The floor-ring row of the quad, in world space, back from the centre.
    const ringRow = {
      x: c.x - UP.x * (SANCTUARY_ART.floor - 0.5) * q.h,
      y: c.y - UP.y * (SANCTUARY_ART.floor - 0.5) * q.h,
      z: c.z - UP.z * (SANCTUARY_ART.floor - 0.5) * q.h,
    }
    expect(screen(ringRow).x).toBeCloseTo(screen(FOOT).x, 6)
    expect(screen(ringRow).y).toBeCloseTo(screen(FOOT).y, 6)
  })

  it("keeps the whole quad above the floor, so the near half of the ring is not buried", () => {
    const bottom = c.y - (q.h / 2) * UP.y
    expect(bottom).toBeGreaterThanOrEqual(0.02 - 1e-9)
  })

  it("does not move a quad that was already clear of the floor", () => {
    const high = sanctuaryCentre({ x: 0, y: 10, z: 0 }, UP, TOWARD, q)
    expect(high.z).toBeCloseTo(UP.z * (SANCTUARY_ART.floor - 0.5) * q.h, 6)
  })

  it("does not divide by a level camera", () => {
    const level = sanctuaryCentre(FOOT, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, q)
    expect(Number.isFinite(level.x + level.y + level.z)).toBe(true)
  })
})

describe("timing", () => {
  it("plays the cast at full strength through the rise and the hold", () => {
    expect(sanctuaryCastOpacity(0)).toBe(1)
    expect(sanctuaryCastOpacity(RISE_SECONDS + CAST_HOLD_SECONDS)).toBe(1)
  })

  it("lets the cast go to nothing, and stays at nothing", () => {
    expect(sanctuaryCastOpacity(CAST_SECONDS)).toBe(0)
    expect(sanctuaryCastOpacity(CAST_SECONDS + 5)).toBe(0)
    const mid = sanctuaryCastOpacity((RISE_SECONDS + CAST_HOLD_SECONDS + CAST_SECONDS) / 2)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  it("hands over: the standing ward is dark until the cast starts letting go", () => {
    expect(sanctuaryHoldOpacity(0)).toBe(0)
    expect(sanctuaryHoldOpacity(HOLD_DELAY)).toBe(0)
    expect(sanctuaryHoldOpacity(HOLD_DELAY + 0.4)).toBeGreaterThan(0)
  })

  it("settles quiet and holds there for as long as it is driven", () => {
    expect(sanctuaryHoldOpacity(HOLD_DELAY + 10)).toBe(HOLD_OPACITY)
    expect(sanctuaryHoldOpacity(600)).toBe(HOLD_OPACITY)
    expect(HOLD_OPACITY).toBeLessThan(0.5)
  })
})
