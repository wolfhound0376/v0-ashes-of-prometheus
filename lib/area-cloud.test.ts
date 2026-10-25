import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  CENTRE_OPACITY, CLOUD_ASPECT, SATELLITE_OPACITY, SPREAD_FROM,
  cloudFrame, growSeconds, layoutPuffs, spreadAt,
} from "./area-cloud.mjs"

// The sheet as baked by scripts/vfx/bake_skull_cloud.py and recorded in the manifest.
const manifest = JSON.parse(readFileSync("public/vfx/manifest.json", "utf8"))
const SHEET = manifest.aoePoisonSkulls as { frames: number; fps: number; grow: number; cols: number; rows: number; loop?: boolean }

describe("the baked sheet", () => {
  it("is in the manifest as a grow-then-hold sheet, not a loop", () => {
    expect(SHEET).toBeTruthy()
    expect(SHEET.frames).toBe(100)          // Sam's GIF: 100 frames, every one kept
    expect(SHEET.fps).toBe(20)              // 50 ms a frame, as drawn
    expect(SHEET.loop).toBeFalsy()          // the source is a one-shot; looping it pops
    expect(SHEET.grow).toBeGreaterThan(0)
    expect(SHEET.grow).toBeLessThan(SHEET.frames)
    expect(SHEET.cols * SHEET.rows).toBeGreaterThanOrEqual(SHEET.frames)
  })
})

describe("cloudFrame", () => {
  const S = { frames: 100, fps: 20, grow: 50 }

  it("plays the grow once, frame by frame, from 0", () => {
    expect(cloudFrame(S, 0)).toBe(0)
    expect(cloudFrame(S, 0.5)).toBe(10)
    expect(cloudFrame(S, 2.45)).toBe(49)
  })

  it("runs straight on from the grow into the hold, with no jump", () => {
    expect(cloudFrame(S, 2.5)).toBe(50)
    expect(cloudFrame(S, 2.55)).toBe(51)
  })

  it("ping-pongs the hold so it never wraps back to a frame it is not next to", () => {
    let prev = cloudFrame(S, 2.5)
    for (let i = 1; i < 1000; i++) {
      const f = cloudFrame(S, 2.5 + i / 20)
      expect(Math.abs(f - prev)).toBeLessThanOrEqual(1)
      expect(f).toBeGreaterThanOrEqual(50)
      expect(f).toBeLessThanOrEqual(99)
      prev = f
    }
  })

  it("reaches both ends of the hold", () => {
    const seen = new Set<number>()
    for (let i = 0; i < 400; i++) seen.add(cloudFrame(S, 2.5 + i / 20))
    expect(seen.has(50)).toBe(true)
    expect(seen.has(99)).toBe(true)
  })

  it("applies a hold offset to the hold only — every puff still opens on the skulls", () => {
    expect(cloudFrame(S, 0, 17)).toBe(0)
    expect(cloudFrame(S, 1, 17)).toBe(20)
    expect(cloudFrame(S, 2.5, 17)).toBe(67)
  })

  it("holds frame 0 before it has started", () => {
    expect(cloudFrame(S, -1)).toBe(0)
  })
})

describe("the spread", () => {
  it("lasts exactly as long as the grow frames", () => {
    expect(growSeconds({ frames: 100, fps: 20, grow: 50 })).toBe(2.5)
  })

  it("eases out from 0 to 1 and stays there", () => {
    expect(spreadAt(0, 2.5)).toBe(0)
    expect(spreadAt(2.5, 2.5)).toBe(1)
    expect(spreadAt(10, 2.5)).toBe(1)
    // fast at first, slowing at the edge
    expect(spreadAt(0.625, 2.5)).toBeGreaterThan(0.5)
  })

  it("waits for a delayed puff", () => {
    expect(spreadAt(0.1, 2.5, 0.3)).toBe(0)
    expect(spreadAt(0.3, 2.5, 0.3)).toBe(0)
  })

  it("never starts from nothing — it erupts", () => {
    expect(SPREAD_FROM).toBeGreaterThan(0)
    expect(SPREAD_FROM).toBeLessThan(1)
  })
})

describe("layoutPuffs", () => {
  it("fills a 20-ft-radius area (8 squares) with a centre and a ring", () => {
    const p = layoutPuffs(8, 3)
    expect(p[0]).toMatchObject({ x: 0, z: 0, width: 8, delay: 0, holdOffset: 0 })
    expect(p.length).toBe(7)
    for (const q of p.slice(1)) {
      const d = Math.hypot(q.x, q.z)
      expect(d).toBeGreaterThan(4 * 0.5)    // out toward the edge…
      expect(d).toBeLessThan(4 * 0.7)       // …but inside it
      expect(q.delay).toBeGreaterThan(0)    // the centre erupts first
    }
  })

  it("is the same cloud on every seat for the same seed", () => {
    expect(layoutPuffs(8, 42)).toEqual(layoutPuffs(8, 42))
  })

  it("puts a small area under one puff", () => {
    expect(layoutPuffs(2, 1)).toHaveLength(1)
  })

  it("keeps figures visible: two layers still let a sprite through", () => {
    const baked = 0.72                       // bake_skull_cloud.py's opacity cap
    const through = (1 - baked * CENTRE_OPACITY) * (1 - baked * SATELLITE_OPACITY)
    expect(through).toBeGreaterThan(0.2)
    expect(CLOUD_ASPECT).toBeCloseTo(9 / 16)
  })
})
