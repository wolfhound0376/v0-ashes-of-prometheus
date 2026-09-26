import { describe, expect, it } from "vitest"
import { allocate, allocated, projectileCount, pushPath, pushSquares } from "./volley"

const magicMissile = { level: 1, volley: { count: 3, perSlotAbove: 1 } }
const scorchingRay = { level: 2, volley: { count: 3, perSlotAbove: 1 } }
const eldritchBlast = { level: 0, volley: { count: 1, byCasterLevel: [[5, 2], [11, 3], [17, 4]] as [number, number][] } }

describe("projectileCount", () => {
  it("Magic Missile: three darts, one more per slot level above 1st (SRD)", () => {
    expect(projectileCount(magicMissile)).toBe(3)
    expect(projectileCount(magicMissile, { slotLevel: 1 })).toBe(3)
    expect(projectileCount(magicMissile, { slotLevel: 2 })).toBe(4)
    expect(projectileCount(magicMissile, { slotLevel: 5 })).toBe(7)
  })
  it("Scorching Ray: three rays, one more per slot level above 2nd (SRD)", () => {
    expect(projectileCount(scorchingRay, { slotLevel: 2 })).toBe(3)
    expect(projectileCount(scorchingRay, { slotLevel: 4 })).toBe(5)
    // A slot below the spell's level is not a thing; nothing is subtracted.
    expect(projectileCount(scorchingRay, { slotLevel: 1 })).toBe(3)
  })
  it("Eldritch Blast: one beam, two at 5th, three at 11th, four at 17th (SRD)", () => {
    expect(projectileCount(eldritchBlast, { casterLevel: 1 })).toBe(1)
    expect(projectileCount(eldritchBlast, { casterLevel: 4 })).toBe(1)
    expect(projectileCount(eldritchBlast, { casterLevel: 5 })).toBe(2)
    expect(projectileCount(eldritchBlast, { casterLevel: 11 })).toBe(3)
    expect(projectileCount(eldritchBlast, { casterLevel: 20 })).toBe(4)
  })
  it("a spell with no volley fires one", () => {
    expect(projectileCount({ level: 0 }, { casterLevel: 17, slotLevel: 9 })).toBe(1)
  })
})

describe("allocate", () => {
  it("adds one pip per click and refuses past the total", () => {
    let a = allocate([], "drow", 3)
    a = allocate(a, "drow", 3)
    a = allocate(a, "spider", 3)
    expect(a).toEqual([{ token: "drow", count: 2 }, { token: "spider", count: 1 }])
    expect(allocated(a)).toBe(3)
    expect(allocate(a, "spider", 3)).toBe(a)   // full: unchanged, same reference
  })
  it("takes one back, and drops a target at zero", () => {
    const a = allocate(allocate([], "drow", 3), "drow", 3)
    expect(allocate(a, "drow", 3, -1)).toEqual([{ token: "drow", count: 1 }])
    expect(allocate(allocate(a, "drow", 3, -1), "drow", 3, -1)).toEqual([])
    expect(allocate(a, "nobody", 3, -1)).toEqual(a)
  })
})

describe("pushPath", () => {
  const open = () => true
  it("moves straight away from the caster, two squares for ten feet", () => {
    expect(pushSquares(10)).toBe(2)
    const r = pushPath({ from: { x: 5, y: 5 }, victim: { x: 6, y: 5 }, squares: 2, free: open })
    expect(r.to).toEqual({ x: 8, y: 5 })
    expect(r.moved).toBe(2)
    expect(r.blocked).toBe(false)
    expect(r.path).toEqual([{ x: 7, y: 5 }, { x: 8, y: 5 }])
  })
  it("pushes diagonally when the victim is off a corner", () => {
    const r = pushPath({ from: { x: 5, y: 5 }, victim: { x: 4, y: 6 }, squares: 2, free: open })
    expect(r.to).toEqual({ x: 2, y: 8 })
  })
  it("stops at the first square that is not free and says it hit something", () => {
    const wall = (c: { x: number; y: number }) => c.x !== 8
    const r = pushPath({ from: { x: 5, y: 5 }, victim: { x: 6, y: 5 }, squares: 2, free: wall })
    expect(r.to).toEqual({ x: 7, y: 5 })
    expect(r.moved).toBe(1)
    expect(r.blocked).toBe(true)
  })
  it("a creature already against the wall does not move and is blocked", () => {
    const r = pushPath({ from: { x: 5, y: 5 }, victim: { x: 6, y: 5 }, squares: 2, free: () => false })
    expect(r.to).toEqual({ x: 6, y: 5 })
    expect(r.moved).toBe(0)
    expect(r.blocked).toBe(true)
  })
  it("a creature on the caster's own square has no direction to go", () => {
    const r = pushPath({ from: { x: 5, y: 5 }, victim: { x: 5, y: 5 }, squares: 2, free: open })
    expect(r.moved).toBe(0)
    expect(r.blocked).toBe(false)
  })
})
