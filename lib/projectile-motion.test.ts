import { describe, expect, it } from "vitest"
import { MOTION, alongAt, flightFrame, poseAt, positionAt, screenRoll, stretchAt } from "./projectile-motion"

const from = { x: 0, y: 1, z: 0 }
const to = { x: 6, y: 1, z: 0 }

describe("alongAt", () => {
  it("starts at the hand and ends on the target for every profile", () => {
    for (const p of Object.values(MOTION)) {
      expect(alongAt(p, 0)).toBe(0)
      expect(alongAt(p, 1)).toBe(1)
      expect(alongAt(p, 2)).toBe(1)   // clamped: nothing overshoots
    }
  })

  it("arrives faster than it leaves", () => {
    for (const p of Object.values(MOTION)) {
      const early = alongAt(p, 0.2) - alongAt(p, 0.1)
      const late = alongAt(p, 1.0) - alongAt(p, 0.9)
      expect(late).toBeGreaterThanOrEqual(early)
    }
  })
})

describe("poseAt", () => {
  it("lobs rise in the middle and land on the line", () => {
    const mid = poseAt(MOTION.lob, 0.5, 6)
    expect(mid.up).toBeGreaterThan(0.3)
    expect(poseAt(MOTION.lob, 0, 6).up).toBeCloseTo(0, 6)
    expect(poseAt(MOTION.lob, 1, 6).up).toBeCloseTo(0, 6)
  })

  it("lifts more over a longer throw, up to the cap", () => {
    expect(poseAt(MOTION.lob, 0.5, 2).up).toBeLessThan(poseAt(MOTION.lob, 0.5, 4).up)
    expect(poseAt(MOTION.lob, 0.5, 40).up).toBeCloseTo(MOTION.lob.liftMax, 6)
  })

  it("a missile weaves on the way and arrives dead centre", () => {
    const swings = [0.15, 0.3, 0.45].map((p) => Math.abs(poseAt(MOTION.weave, p, 6).side))
    expect(Math.max(...swings)).toBeGreaterThan(0.08)
    expect(Math.abs(poseAt(MOTION.weave, 1, 6).side)).toBeLessThan(1e-6)
  })

  it("two missiles with different seeds do not swing in step", () => {
    const a = poseAt(MOTION.weave, 0.25, 6, 1).side
    const b = poseAt(MOTION.weave, 0.25, 6, 4).side
    expect(a).not.toBeCloseTo(b, 3)
  })

  it("a drift corkscrews and closes on the target", () => {
    const quarter = poseAt(MOTION.drift, 0.25, 6)
    expect(Math.hypot(quarter.side, quarter.up)).toBeGreaterThan(0.05)
    const end = poseAt(MOTION.drift, 1, 6)
    expect(Math.hypot(end.side, end.up)).toBeLessThan(1e-6)
  })

  it("a dart flies dead straight", () => {
    for (const p of [0.2, 0.5, 0.8]) {
      const pose = poseAt(MOTION.dart, p, 6)
      expect(pose.side).toBe(0)
      expect(pose.up).toBe(0)
    }
  })
})

describe("flightFrame / positionAt", () => {
  it("right is horizontal and perpendicular to the flight", () => {
    const f = flightFrame({ x: 0, y: 0, z: 0 }, { x: 3, y: 2, z: 4 })
    expect(f.right.y).toBe(0)
    expect(f.right.x * f.forward.x + f.right.z * f.forward.z).toBeCloseTo(0, 9)
    expect(Math.hypot(f.right.x, f.right.z)).toBeCloseTo(1, 9)
  })

  it("puts the projectile in the hand at 0 and on the target at 1", () => {
    for (const profile of Object.values(MOTION)) {
      const a = positionAt(profile, 0, from, to)
      const b = positionAt(profile, 1, from, to)
      expect([a.x, a.y, a.z].map((v) => +v.toFixed(6))).toEqual([0, 1, 0])
      expect([b.x, b.y, b.z].map((v) => +v.toFixed(6))).toEqual([6, 1, 0])
    }
  })

  it("survives a target on the caster's own square", () => {
    const p = positionAt(MOTION.lob, 0.5, from, from)
    expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true)
  })
})

describe("screenRoll", () => {
  const right = { x: 1, y: 0, z: 0 }
  const up = { x: 0, y: 1, z: 0 }
  it("is zero for travel along the screen's x axis, and a right angle for straight up", () => {
    expect(screenRoll({ x: 1, y: 0, z: 0 }, right, up)).toBeCloseTo(0, 9)
    expect(screenRoll({ x: 0, y: 1, z: 0 }, right, up)).toBeCloseTo(Math.PI / 2, 9)
    expect(screenRoll({ x: -1, y: 0, z: 0 }, right, up)).toBeCloseTo(Math.PI, 9)
  })
  it("has no opinion about travel straight into the screen", () => {
    expect(screenRoll({ x: 0, y: 0, z: -1 }, right, up)).toBe(0)
  })
})

describe("stretchAt", () => {
  it("does not stretch a profile that has none, and stretches a dart most at arrival", () => {
    expect(stretchAt(MOTION.lob, 0.9)).toBe(1)
    expect(stretchAt(MOTION.dart, 0.05)).toBeLessThan(stretchAt(MOTION.dart, 0.95))
    expect(stretchAt(MOTION.dart, 1)).toBeLessThanOrEqual(MOTION.dart.stretch)
  })
})
