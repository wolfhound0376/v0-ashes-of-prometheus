import { describe, expect, it } from "vitest"
import {
  ALL_SCHOOLS, SCHOOL_VFX, glyphPose, quadCount, releasePose,
  type RingMotion,
} from "./spell-school-vfx"
import { SCHOOL_RUNE } from "./spell-school"
import { SCHOOL_RAMP } from "./spell-school"

const CHARGE = 0.8

/** Hue in degrees, 0..360. */
function hueOf(hex: number): number {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d === 0) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? 2 + (b - r) / d : 4 + (r - g) / d
  return (h * 60 + 360) % 360
}

const TAU = Math.PI * 2

/** The sorted angular gaps between a school's glyphs at time `t`. */
function gaps(school: (typeof ALL_SCHOOLS)[number], t: number): number[] {
  const n = SCHOOL_VFX[school].glyphs
  const angles = Array.from({ length: n }, (_, i) => {
    const a = glyphPose(school, i, t, CHARGE).angle % TAU
    return a < 0 ? a + TAU : a
  }).sort((a, b) => a - b)
  return angles.map((a, i) => (i === n - 1 ? angles[0] + TAU : angles[i + 1]) - a)
}

function minGap(school: (typeof ALL_SCHOOLS)[number], t: number): number {
  return Math.min(...gaps(school, t))
}

function maxGap(school: (typeof ALL_SCHOOLS)[number], t: number): number {
  return Math.max(...gaps(school, t))
}

/** HSV saturation, 0..1. */
function satOf(hex: number): number {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255
  const max = Math.max(r, g, b)
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max
}

describe("the table", () => {
  it("covers all eight schools and nothing else", () => {
    expect(ALL_SCHOOLS).toHaveLength(8)
    expect(Object.keys(SCHOOL_VFX).sort()).toEqual([...ALL_SCHOOLS].sort())
  })

  it("agrees with the rune sheet map — one entry per school in both", () => {
    for (const s of ALL_SCHOOLS) expect(SCHOOL_RUNE[s]).toBeTruthy()
  })

  it("gives every school its own colour", () => {
    const tints = ALL_SCHOOLS.map((s) => SCHOOL_VFX[s].tint)
    expect(new Set(tints).size).toBe(8)
  })

  it("gives every school its own motion — colour alone is not enough", () => {
    const motions = ALL_SCHOOLS.map((s) => SCHOOL_VFX[s].motion)
    expect(new Set(motions).size).toBe(8)
  })

  it("distinguishes any two schools close in hue by their MOTION", () => {
    // This replaces a "every pair at least 30 degrees apart" assertion, and
    // the replacement is a real loosening rather than a tidy-up, so it is
    // worth saying why. That rule described a palette chosen to be a legend.
    // The colours now come from Sam's reference sheet (SCHOOL_RAMP), which was
    // drawn to look good, and it does NOT space eight hues evenly: abjuration
    // and illusion are both blue, five degrees apart.
    //
    // What a player actually needs is to tell two schools apart, and hue was
    // only ever one way of providing that. This file has always given each
    // school its own motion — see the test above. So the guarantee is now
    // stated directly: schools that look alike must not MOVE alike.
    const chromatic = ALL_SCHOOLS.filter((s) => satOf(SCHOOL_VFX[s].tint) >= 0.15)
    for (let i = 0; i < chromatic.length; i++) {
      for (let j = i + 1; j < chromatic.length; j++) {
        const a = chromatic[i], b = chromatic[j]
        const ha = hueOf(SCHOOL_VFX[a].tint), hb = hueOf(SCHOOL_VFX[b].tint)
        const gap = Math.min(Math.abs(ha - hb), 360 - Math.abs(ha - hb))
        if (gap < 30) {
          expect(SCHOOL_VFX[a].motion, `${a} and ${b} are ${gap.toFixed(0)}deg apart and must not share a motion`)
            .not.toBe(SCHOOL_VFX[b].motion)
        }
      }
    }
  })

  it("separates every pair by hue, by value, or by motion — never by none of the three", () => {
    // The weakened-but-true colour guarantee, and the reason it is weakened:
    // the reference sheet draws divination as a violet eye and necromancy as
    // a violet skull, and sampled they land 12 degrees and ONE point of
    // luminance apart. On the ring those two are the same colour. Their
    // emblems differ; their glows do not.
    //
    // This is a finding about the sheet, not a slack test. Each emblem's own
    // hue distribution does lean apart — divination peaks near 255, necromancy
    // near 275 — so a future resample could separate them honestly without
    // inventing a colour. Until then, "still" versus "sink" is what tells them
    // apart, and that is asserted rather than assumed.
    const lum = (h: number) => 0.2126 * ((h >> 16) & 255) + 0.7152 * ((h >> 8) & 255) + 0.0722 * (h & 255)
    const byColourOnly: string[] = []
    for (let i = 0; i < ALL_SCHOOLS.length; i++) {
      for (let j = i + 1; j < ALL_SCHOOLS.length; j++) {
        const A = ALL_SCHOOLS[i], B = ALL_SCHOOLS[j]
        const a = SCHOOL_VFX[A], b = SCHOOL_VFX[B]
        const ha = hueOf(a.tint), hb = hueOf(b.tint)
        const gap = Math.min(Math.abs(ha - hb), 360 - Math.abs(ha - hb))
        const dv = Math.abs(lum(a.tint) - lum(b.tint))
        const colourSeparated = gap > 20 || dv > 25
        if (!colourSeparated) byColourOnly.push(`${A}/${B}`)
        expect(colourSeparated || a.motion !== b.motion,
          `${A} and ${B} are ${gap.toFixed(0)}deg and ${dv.toFixed(0)} value apart AND share a motion`).toBe(true)
      }
    }
    // Pinned, so a resample that fixes it makes this fail loudly and someone
    // deletes the exemption rather than it rotting here unnoticed.
    expect(byColourOnly).toEqual(["divination/necromancy"])
  })

  it("takes its colours from SCHOOL_RAMP, so there is only ever one palette", () => {
    // The whole point of this change. A second table of school colours is how
    // the codebase already got three different things called "school".
    for (const s of ALL_SCHOOLS) {
      expect(SCHOOL_VFX[s].tint, s).toBe(SCHOOL_RAMP[s].glow)
      expect(SCHOOL_VFX[s].release, s).toBe(SCHOOL_RAMP[s].core)
    }
  })

  it("divination is no longer achromatic — the reference draws it violet", () => {
    // Recorded rather than dropped: the old design made divination the one
    // school identified by having NO colour ("clear sight is clear light").
    // Sam's sheet draws it as a violet eye in a triangle, so that idea does
    // not survive the reference. Its motion, "still", is now what marks it out.
    expect(satOf(SCHOOL_VFX.divination.tint)).toBeGreaterThan(0.3)
    expect(SCHOOL_VFX.divination.motion).toBe("still")
  })

  it("keeps every ring small enough to sit on a forearm, not on the square", () => {
    for (const s of ALL_SCHOOLS) {
      expect(SCHOOL_VFX[s].radius).toBeGreaterThan(0.2)
      expect(SCHOOL_VFX[s].radius).toBeLessThan(0.5)
    }
  })
})

describe("quadCount", () => {
  it("is the glyph count for every school but illusion", () => {
    for (const s of ALL_SCHOOLS) {
      const expected = s === "illusion" ? SCHOOL_VFX[s].glyphs * 2 : SCHOOL_VFX[s].glyphs
      expect(quadCount(s), s).toBe(expected)
    }
  })

  it("doubles illusion, because every glyph there has a twin", () => {
    expect(quadCount("illusion")).toBe(SCHOOL_VFX.illusion.glyphs * 2)
  })
})

describe("glyphPose — the invariants that hold for every school", () => {
  it("never returns an opacity outside 0..1", () => {
    for (const s of ALL_SCHOOLS) {
      for (let i = 0; i < quadCount(s); i++) {
        for (let t = 0; t <= CHARGE; t += 0.02) {
          const p = glyphPose(s, i, t, CHARGE, 7)
          expect(p.opacity, `${s}[${i}] @${t.toFixed(2)}`).toBeGreaterThanOrEqual(0)
          expect(p.opacity, `${s}[${i}] @${t.toFixed(2)}`).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it("never returns a non-finite pose", () => {
    for (const s of ALL_SCHOOLS) {
      for (let i = 0; i < quadCount(s); i++) {
        const p = glyphPose(s, i, 0.37, CHARGE)
        for (const v of [p.angle, p.radius, p.along, p.opacity, p.scale]) {
          expect(Number.isFinite(v), `${s}[${i}]`).toBe(true)
        }
      }
    }
  })

  it("keeps the radius positive — a glyph never turns inside out through the axis", () => {
    for (const s of ALL_SCHOOLS) {
      for (let i = 0; i < quadCount(s); i++) {
        for (let t = 0; t <= CHARGE; t += 0.05) {
          expect(glyphPose(s, i, t, CHARGE).radius, `${s}[${i}]`).toBeGreaterThan(0)
        }
      }
    }
  })

  it("has the whole ring visible by the release frame, so a cast never fires half-drawn", () => {
    for (const s of ALL_SCHOOLS) {
      const real = SCHOOL_VFX[s].glyphs
      for (let i = 0; i < real; i++) {
        // Illusion's twins are meant to flicker; its real glyphs are not.
        expect(glyphPose(s, i, CHARGE, CHARGE).opacity, `${s}[${i}]`).toBeGreaterThan(0.5)
      }
    }
  })

  it("never collapses: the ring always spans the circle, for every school", () => {
    // The invariant that holds EVERYWHERE. If the glyphs ever piled into one
    // place the largest gap would open up towards a full turn, so capping the
    // largest gap catches a collapse without forbidding a crossing.
    for (const s of ALL_SCHOOLS) {
      for (let t = 0; t <= CHARGE; t += 0.02) {
        expect(maxGap(s, t), `${s} collapsed @${t.toFixed(2)}`).toBeLessThan(TAU * 0.6)
      }
    }
  })

  it("keeps glyphs off each other at every instant — except the school on two rings", () => {
    // Abjuration is exempt on real grounds rather than as a dodge: its glyphs
    // sit on two different radii (asserted below), so two of them sharing an
    // angle are not in the same place and never look it.
    for (const s of ALL_SCHOOLS) {
      if (s === "abjuration") continue
      const n = SCHOOL_VFX[s].glyphs
      const floor = (TAU / n) * 0.3
      for (let t = 0; t <= CHARGE; t += 0.02) {
        expect(minGap(s, t), `${s} clumped @${t.toFixed(2)}`).toBeGreaterThan(floor)
      }
    }
  })

  it("abjuration runs on TWO concentric rings, so a crossing is never a collision", () => {
    for (let t = 0; t <= CHARGE; t += 0.05) {
      const outer = glyphPose("abjuration", 0, t, CHARGE).radius
      const inner = glyphPose("abjuration", 1, t, CHARGE).radius
      // A clear gap between the circles at every moment of the charge.
      expect(inner).toBeLessThan(outer * 0.7)
      expect(outer - inner).toBeGreaterThan(0.08)
    }
  })

  it("abjuration's two rings turn opposite ways", () => {
    const d = (i: number) => glyphPose("abjuration", i, 0.2, CHARGE).angle - glyphPose("abjuration", i, 0.1, CHARGE).angle
    expect(Math.sign(d(0))).toBe(-Math.sign(d(1)))
  })

  it("is deterministic in t — two seats see the same ring", () => {
    for (const s of ALL_SCHOOLS) {
      const a = glyphPose(s, 1, 0.41, CHARGE, 3)
      const b = glyphPose(s, 1, 0.41, CHARGE, 3)
      expect(a).toEqual(b)
    }
  })
})

describe("glyphPose — each school actually does the thing it claims", () => {
  it("abjuration CONTRACTS: the ring is smaller at release than at the start", () => {
    const start = glyphPose("abjuration", 0, 0, CHARGE).radius
    const end = glyphPose("abjuration", 0, CHARGE, CHARGE).radius
    expect(end).toBeLessThan(start * 0.7)
  })

  it("abjuration LOCKS: the spin has all but stopped by release", () => {
    const early = glyphPose("abjuration", 0, 0.30, CHARGE).angle - glyphPose("abjuration", 0, 0.25, CHARGE).angle
    const late = glyphPose("abjuration", 0, CHARGE, CHARGE).angle - glyphPose("abjuration", 0, CHARGE - 0.05, CHARGE).angle
    expect(Math.abs(late)).toBeLessThan(Math.abs(early) * 0.5)
  })

  it("conjuration ARRIVES one at a time: the last glyph is still absent when the first is lit", () => {
    const n = SCHOOL_VFX.conjuration.glyphs
    const t = 0.05
    expect(glyphPose("conjuration", 0, t, CHARGE).opacity).toBeGreaterThan(0)
    expect(glyphPose("conjuration", n - 1, t, CHARGE).opacity).toBe(0)
  })

  it("conjuration OPENS OUTWARD: the ring is wider at release", () => {
    expect(glyphPose("conjuration", 0, CHARGE, CHARGE).radius)
      .toBeGreaterThan(glyphPose("conjuration", 0, 0, CHARGE).radius * 2)
  })

  it("divination HOLDS STILL: the angle never changes — the only school that does not turn", () => {
    for (let t = 0; t <= CHARGE; t += 0.1) {
      expect(glyphPose("divination", 2, t, CHARGE).angle)
        .toBeCloseTo(glyphPose("divination", 2, 0, CHARGE).angle, 9)
    }
  })

  it("divination READS IN SEQUENCE: glyph 0 lights before the last one", () => {
    const n = SCHOOL_VFX.divination.glyphs
    const t = 0.2
    expect(glyphPose("divination", 0, t, CHARGE).opacity)
      .toBeGreaterThan(glyphPose("divination", n - 1, t, CHARGE).opacity)
  })

  it("enchantment SWAYS: a glyph crosses back over its own slot rather than only advancing", () => {
    // Strip the base rotation; what is left must change sign — that is a sway.
    const spin = SCHOOL_VFX.enchantment.spin
    const off = (t: number) => glyphPose("enchantment", 0, t, CHARGE).angle - spin * t
    const samples = Array.from({ length: 60 }, (_, k) => off(k * 0.05))
    expect(Math.max(...samples)).toBeGreaterThan(Math.min(...samples) + 0.3)
  })

  it("evocation ACCELERATES: it turns further in the last tenth than in the first", () => {
    const first = glyphPose("evocation", 0, 0.1, CHARGE).angle - glyphPose("evocation", 0, 0, CHARGE).angle
    const last = glyphPose("evocation", 0, CHARGE, CHARGE).angle - glyphPose("evocation", 0, CHARGE - 0.1, CHARGE).angle
    expect(last).toBeGreaterThan(first * 2)
  })

  it("illusion TWINS: the back half is dimmer than the real glyphs and offset from them", () => {
    const n = SCHOOL_VFX.illusion.glyphs
    const real = glyphPose("illusion", 0, 0.4, CHARGE, 5)
    const twin = glyphPose("illusion", n, 0.4, CHARGE, 5)
    expect(twin.opacity).toBeLessThan(real.opacity * 0.6)
    expect(twin.angle).not.toBeCloseTo(real.angle, 3)
  })

  it("illusion FLICKERS: a twin's brightness is not constant over time", () => {
    const n = SCHOOL_VFX.illusion.glyphs
    const seen = new Set<string>()
    for (let t = 0; t < CHARGE; t += 0.01) {
      seen.add(glyphPose("illusion", n, t, CHARGE, 5).opacity.toFixed(3))
    }
    expect(seen.size).toBeGreaterThan(5)
  })

  it("necromancy SINKS toward the hand and HANGS INVERTED", () => {
    expect(glyphPose("necromancy", 0, CHARGE, CHARGE).along).toBeLessThan(-0.1)
    expect(glyphPose("necromancy", 0, 0.4, CHARGE).scale).toBeLessThan(0)
  })

  it("necromancy GUTTERS: brightness rises and falls rather than settling", () => {
    const samples = Array.from({ length: 80 }, (_, k) => glyphPose("necromancy", 0, 0.2 + k * 0.01, CHARGE).opacity)
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.2)
  })

  it("transmutation STEPS rather than spins: the angular speed is not constant", () => {
    const v = (t: number) => (glyphPose("transmutation", 0, t + 0.01, CHARGE).angle - glyphPose("transmutation", 0, t, CHARGE).angle) / 0.01
    const speeds = Array.from({ length: 100 }, (_, k) => v(k * 0.02))
    // A true spin has one speed; stepping has a fast phase and a still phase.
    expect(Math.max(...speeds)).toBeGreaterThan(Math.min(...speeds) + 0.5)
    expect(Math.min(...speeds)).toBeLessThan(0.25)
  })

  it("transmutation ends each step exactly one slot on, so glyphs land in real slots", () => {
    const n = SCHOOL_VFX.transmutation.glyphs
    const slot = (Math.PI * 2) / n
    // t such that t*0.85 is a whole number: the moment a step completes.
    const t = 1 / 0.85
    const moved = glyphPose("transmutation", 0, t, CHARGE).angle - glyphPose("transmutation", 0, 0, CHARGE).angle
    expect(moved).toBeCloseTo(slot, 4)
  })
})

describe("releasePose", () => {
  it("fades to nothing and never goes negative", () => {
    for (const s of ALL_SCHOOLS) {
      expect(releasePose(s, 0).opacity).toBeCloseTo(1, 5)
      expect(releasePose(s, 5).opacity).toBe(0)
      expect(releasePose(s, 5).scale).toBeGreaterThan(0)
    }
  })

  it("throws evocation's ring hardest — the power just left the hand", () => {
    const evo = releasePose("evocation", 0.2).scale
    for (const s of ALL_SCHOOLS) {
      if (s === "evocation") continue
      expect(evo, s).toBeGreaterThan(releasePose(s, 0.2).scale)
    }
  })

  it("barely throws abjuration's at all — a closed barrier does not scatter", () => {
    expect(releasePose("abjuration", 0.2).scale).toBeLessThan(releasePose("divination", 0.2).scale)
  })
})
