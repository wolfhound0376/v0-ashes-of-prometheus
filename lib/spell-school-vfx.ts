// ============================================================================
// THE EIGHT SCHOOLS, AS COLOUR AND AS MOTION.
//
// lib/spell-school.ts already answers "which school is this spell?" and hands
// back a rune SHEET. It says nothing about how that rune should look or move,
// so until now every school's rune span up off the hand as one flat disc,
// tinted white, turning at the same speed. Eight different glyphs, one
// identical performance. A player could not read the school at a glance, only
// at a freeze-frame.
//
// This file is the other half: each school gets a COLOUR and a MOTION, and
// the rune becomes a ring of glyphs orbiting the caster's forearm rather than
// a single disc pinned to the palm. Sam, 2026-09-28: "rune symbols that are
// generated around the casting arms of the spell caster ... based on schools
// of magic as well as the colors and effects."
//
// ── what is canon here and what is not ─────────────────────────────────────
//
// The eight schools are SRD 5.1. Everything else below — the colours, the
// glyph counts, the motions — is HOMEBREW, invented for this board, and is
// Sam's call to change. 5e assigns no colour to any school; anyone who tells
// you evocation is "officially" orange is making it up. These were chosen for
// one reason only: eight hues a player can tell apart in a dark Underdark
// scene at the board's camera distance.
//
// ── why colour and motion, and not just colour ─────────────────────────────
//
// Colour alone fails twice. It fails for the ~8% of men with red-green colour
// vision deficiency, and it fails in peripheral vision, which is where a
// player actually is while they are reading the damage number instead of the
// caster's hands. MOTION survives both. So each school is a colour AND a
// distinct way of moving, and either one alone is enough to name it:
//
//   abjuration     guard blue      the ring CONTRACTS and locks — a barrier closing
//   conjuration    gate green      glyphs ARRIVE one at a time, ring opens outward
//   divination     silver          the ring HOLDS STILL; glyphs light in sequence
//   enchantment    rose            a slow hypnotic SWAY, glyphs breathing out of phase
//   evocation      raw orange      spins up ACCELERATING, flares white at release
//   illusion       lilac           every glyph has a DRIFTING TWIN that flickers
//   necromancy     grave green     the ring SINKS and tilts, glyphs hang inverted, guttering
//   transmutation  alchemic gold   glyphs SWAP places in eased steps — change itself
//
// ── why this file has no THREE import ──────────────────────────────────────
//
// So it can be tested. `glyphPose` is pure arithmetic — given a school, a
// glyph index and a time, it returns where that glyph is and how bright. The
// renderer (components/tactical/rune-ring.ts) does nothing but read these
// poses onto quads. A motion that looks wrong is a failing assertion here,
// not a thing you squint at on a board.
// ============================================================================

import type { MagicSchool } from "./spell-school"

/** How a school's ring behaves while the spell charges. Homebrew. */
export type RingMotion =
  | "contract" | "arrive" | "still" | "sway"
  | "flare" | "double" | "sink" | "morph"

export interface SchoolVfx {
  /** The ring's colour while it charges. */
  tint: number
  /** What it flashes to on the release frame. */
  release: number
  motion: RingMotion
  /**
   * How many glyphs orbit the forearm.
   *
   * Illusion carries twice as many quads as this number — each glyph has a
   * twin — but `glyphs` is the count of REAL ones, so the ring reads as the
   * same density as every other school.
   */
  glyphs: number
  /** Ring radius in board units. One square is 1.0, so these are small. */
  radius: number
  /** Base spin, radians per second. Signed: a negative school turns widdershins. */
  spin: number
  /** A one-word gloss, for the preview page and for anyone reading a diff. */
  reads: string
}

/**
 * HOMEBREW — Sam's call, not the SRD.
 *
 * Seven of the eight are placed around the hue wheel with at least 30 degrees
 * between any two neighbours; the eighth, divination, is deliberately
 * achromatic. The first draft put conjuration at a sea-green 163 degrees and
 * necromancy at a leaf-green 95, and the test below caught them reading as one
 * colour. They are now 83 degrees apart — a blue-green gate and a yellow-green
 * rot — which also survives red-green colour blindness, because that pair
 * separates on the blue-yellow axis a deuteranope still has.
 *
 * The tightest remaining neighbours are evocation (14 degrees) and
 * transmutation (45), and they differ in value as well as hue: a hot red-orange
 * against a pale gold.
 *
 * These deliberately do NOT dodge the damage-type burst tints in
 * spell-vfx-kit.ts, and they do not need to: the rune plays during the CHARGE,
 * at the caster's arm, and the burst plays on IMPACT, at the target. They are
 * separated in both time and space and never share a frame. What matters is
 * that the eight are distinct FROM EACH OTHER, because those are what a player
 * learns to read.
 */
export const SCHOOL_VFX: Record<MagicSchool, SchoolVfx> = {
  //            tint      hue    release    motion
  evocation:     { tint: 0xff4a12, release: 0xfff1d0, motion: "flare",    glyphs: 6, radius: 0.34, spin:  2.6, reads: "power winding up" },
  transmutation: { tint: 0xffd24a, release: 0xfff4c8, motion: "morph",    glyphs: 6, radius: 0.37, spin:  0.0, reads: "one thing becoming another" },
  necromancy:    { tint: 0x9fcf3a, release: 0xe4ffab, motion: "sink",     glyphs: 6, radius: 0.36, spin: -1.0, reads: "something guttering" },
  conjuration:   { tint: 0x22d3a0, release: 0xc8ffe6, motion: "arrive",   glyphs: 5, radius: 0.36, spin:  1.6, reads: "something arriving" },
  abjuration:    { tint: 0x4ea8ff, release: 0xd6ecff, motion: "contract", glyphs: 6, radius: 0.40, spin:  2.1, reads: "a barrier closing" },
  illusion:      { tint: 0xb37dff, release: 0xe8d6ff, motion: "double",   glyphs: 5, radius: 0.38, spin: -1.4, reads: "not quite there" },
  enchantment:   { tint: 0xff6fb5, release: 0xffd4ea, motion: "sway",     glyphs: 5, radius: 0.37, spin:  1.1, reads: "a slow persuasion" },
  // The achromatic one on purpose: divination is the school with no colour
  // of its own and no movement either. Clear sight looks like clear light.
  divination:    { tint: 0xe8f2ff, release: 0xffffff, motion: "still",    glyphs: 7, radius: 0.38, spin:  0.0, reads: "a thing being read" },
}

/** Every school, in the SRD's own order. For the preview page and for tests. */
export const ALL_SCHOOLS: MagicSchool[] = [
  "abjuration", "conjuration", "divination", "enchantment",
  "evocation", "illusion", "necromancy", "transmutation",
]

/** Where one glyph is, and how bright, at one instant. */
export interface GlyphPose {
  /** Angle around the forearm axis, radians. */
  angle: number
  /** Distance from that axis, board units. */
  radius: number
  /** Along the forearm: negative is toward the hand, positive toward the elbow. */
  along: number
  /** 0..1. A glyph that has not arrived yet is 0. */
  opacity: number
  /** Scale multiplier. Negative means the glyph hangs inverted. */
  scale: number
}

const TAU = Math.PI * 2

/** Smooth 0..1. The one easing curve this file uses. */
function ease(p: number): number {
  const k = p < 0 ? 0 : p > 1 ? 1 : p
  return k * k * (3 - 2 * k)
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * The total number of QUADS a school's ring needs.
 *
 * Only illusion differs from its glyph count: every glyph there carries a
 * twin, so the renderer must allocate double. Asking the table directly would
 * under-allocate and silently drop half the ring.
 */
export function quadCount(school: MagicSchool): number {
  const vfx = SCHOOL_VFX[school]
  return vfx.motion === "double" ? vfx.glyphs * 2 : vfx.glyphs
}

/**
 * Where glyph `i` of `school` sits at time `t` seconds into a charge of
 * `charge` seconds.
 *
 * `i` runs 0..quadCount(school)-1. For illusion, the back half of that range
 * is the twins; every other school has no twins and uses the whole range as
 * real glyphs.
 *
 * `seed` only perturbs schools whose motion is meant to look unrepeatable
 * (illusion's flicker). Everything else is deterministic in `t` alone, so two
 * seats watching the same cast see the same ring.
 */
export function glyphPose(
  school: MagicSchool,
  i: number,
  t: number,
  charge: number,
  seed = 0,
): GlyphPose {
  const vfx = SCHOOL_VFX[school]
  const n = vfx.glyphs
  const twin = vfx.motion === "double" && i >= n
  const idx = twin ? i - n : i
  const p = charge > 0 ? clamp01(t / charge) : 1
  const a0 = (idx / n) * TAU
  const R = vfx.radius

  // Defaults every motion starts from, then overrides what it cares about.
  let angle = a0 + vfx.spin * t
  let radius = R
  let along = 0
  let opacity = ease(clamp01(t / 0.18))   // a common quick fade-in
  let scale = 1

  switch (vfx.motion) {
    // A BARRIER CLOSING. TWO CONCENTRIC RINGS, counter-rotating, both drawing
    // inward and both locking as the spin bleeds off.
    //
    // The first draft put the counter-rotation in ONE ring, alternating the
    // direction glyph by glyph. That reads badly and the test caught it: when
    // every other glyph turns the other way, neighbours converge in pairs, so
    // a six-glyph ring spends nearly half the charge looking like three
    // clumps of two rather than like a ring. Splitting them onto two radii
    // fixes it at the root — glyphs on different circles can pass each other
    // without ever appearing to touch — and a double ward ring is the better
    // picture of abjuration anyway.
    case "contract": {
      const outer = idx % 2 === 0
      const dir = outer ? 1 : -1
      // Half a slot of offset so the two rings interleave rather than lining up.
      const stagger = outer ? 0 : Math.PI / n
      angle = a0 + stagger + dir * vfx.spin * t * (1 - 0.9 * ease(p))
      radius = R * (outer ? 1 : 0.6) * (1.7 - 0.75 * ease(p))
      break
    }

    // SOMETHING ARRIVING. Glyphs do not fade in together; each one appears in
    // its turn, and the ring opens outward as it fills. By the release frame
    // all of them are present, which is the point — the conjuration is complete.
    case "arrive": {
      const born = (idx / n) * 0.55 * charge
      opacity = ease(clamp01((t - born) / 0.16))
      radius = R * (0.32 + 0.68 * ease(p))
      break
    }

    // A THING BEING READ. No spin at all — this is the one school whose ring
    // does not turn, and that stillness is its whole signature. The glyphs
    // light one after another, left to right, and stay lit.
    case "still": {
      angle = a0
      const born = (idx / n) * 0.7 * charge
      opacity = ease(clamp01((t - born) / 0.12))
      radius = R * (1 + 0.04 * Math.sin(t * 1.8))
      break
    }

    // A SLOW PERSUASION. The ring turns lazily while each glyph sways across
    // its own slot and breathes in and out of the radius, every one on its own
    // phase — so the ring never looks rigid.
    case "sway": {
      angle = a0 + vfx.spin * t + 0.32 * Math.sin(t * 2.2 + idx * 1.1)
      radius = R * (1 + 0.16 * Math.sin(t * 1.7 + idx * 2.0))
      break
    }

    // POWER WINDING UP. Quadratic, not linear: the ring is visibly faster at
    // the end of the charge than at the start, which is what makes a held
    // Fireball feel like it is straining. It also creeps in slightly, so the
    // release throws it outward from a tight ring.
    case "flare": {
      angle = a0 + vfx.spin * t * t * 0.85
      radius = R * (1.15 - 0.25 * ease(p))
      break
    }

    // NOT QUITE THERE. Each real glyph has a twin a few degrees off, drifting,
    // at under half brightness, blinking out and back. A player cannot count
    // an illusion ring, which is exactly right for the school.
    case "double": {
      if (twin) {
        angle = a0 + vfx.spin * t + 0.22 * Math.sin(t * 2.9 + idx * 1.7 + seed)
        radius = R * (1 + 0.12 * Math.cos(t * 2.3 + idx))
        const lit = Math.sin(t * 11 + idx * 2.7 + seed * 0.5) > -0.55 ? 1 : 0.12
        opacity *= 0.42 * lit
      }
      break
    }

    // SOMETHING GUTTERING. The ring slides down the forearm toward the hand,
    // the glyphs hang upside down, and the whole thing flickers like a candle
    // that is going out rather than burning.
    case "sink": {
      along = -0.16 * ease(p)
      radius = R * (1 + 0.08 * ease(p))
      // Floor at 0.60, not at 0.44: the first draft's deeper trough could land
      // exactly on the release frame and fire the spell off a ring nobody
      // could see. It still gutters over a 0.40 range, which is the look.
      opacity *= 0.80 + 0.20 * Math.sin(t * 9 + idx * 1.3)
      scale = -1
      break
    }

    // ONE THING BECOMING ANOTHER. The ring does not spin — it STEPS. Each
    // glyph eases into the slot its neighbour just left, holds, then steps
    // again, so the eye reads a sequence of swaps rather than rotation.
    case "morph": {
      const phase = t * 0.85
      const step = Math.floor(phase)
      const f = ease(phase - step)
      angle = a0 + (TAU / n) * (step + f)
      // Glyphs pull in slightly mid-swap and settle back out on arrival,
      // so a swap looks like a handover rather than a slide.
      radius = R * (1 - 0.14 * Math.sin(f * Math.PI))
      break
    }
  }

  return { angle, radius, along, opacity: clamp01(opacity), scale }
}

/**
 * How the whole ring behaves on and after the RELEASE frame, as one scalar
 * each for scale and opacity.
 *
 * `u` is seconds since release. Every school throws its ring outward and
 * fades it, but evocation throws it hardest — the ring is the power, and the
 * power just left.
 */
export function releasePose(school: MagicSchool, u: number): { scale: number; opacity: number } {
  const vfx = SCHOOL_VFX[school]
  const life = vfx.motion === "flare" ? 0.34 : 0.26
  const k = clamp01(u / life)
  const throwOut = vfx.motion === "flare" ? 2.4 : vfx.motion === "contract" ? 0.35 : 1.5
  return { scale: 1 + throwOut * k, opacity: 1 - ease(k) }
}
