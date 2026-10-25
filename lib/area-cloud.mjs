// The poison cloud that stands in an area — timing and layout, pure, in one copy.
//
// WHY THIS FILE IS PLAIN JAVASCRIPT. Same reason as lib/rage.mjs: the painted map
// (scripts/velkynvelve-walk/template.html) is built by a Python script on Sam's machine, where there is no
// Node. build_walk.py pastes this file into the page at its AREA_CLOUD placeholder (minus `export`), so the
// map and lib/area-cloud.test.ts read the SAME functions. tsconfig has allowJs; the JSDoc types the tests.
/**
 *
 * Sam supplied the art (2026-10-25): a painted bank of green smoke with skulls
 * in it, 100 frames at 20 fps, drawn side-on. His brief: "preserve the
 * animation", "adjust the transparency slightly so you can see the pixel
 * character(s) it is affecting", "it should grow and fill the area of effect".
 *
 * The source is a ONE-SHOT, not a loop. Measured: consecutive frames differ by
 * 2.2 on average and the last frame differs from the first by 39.9 — the cloud
 * swells and pushes in for five seconds and the skulls fade out by about frame
 * 37. Looped straight it would pop back to a small cloud every five seconds.
 * So the sheet is played in two parts:
 *
 *   GROW  frames [0, grow) once — the skulls, the cloud swelling — while the
 *         quads spread out from the point of impact to fill the area.
 *   HOLD  frames [grow, frames) ping-ponged — forward to the end, back again.
 *         A slow swell run backwards is a slow settle, so the hold breathes
 *         with no seam, and it is still nothing but Sam's frames.
 *
 * Side-on art cannot lie flat, so the cloud is several upright puffs spread
 * over the area rather than one, each drawn in depth order among the figures:
 * a single puff at the centre would veil the figures behind it and leave the
 * ones in front of it standing in clean air.
 */

/**
 * @typedef {{frames: number, fps: number, grow: number}} CloudSheet
 * `grow` is the first frame of the hold; frames before it are the grow, played once.
 */

/** The art is 960x540 — every quad is 16:9, height from width. */
export const CLOUD_ASPECT = 540 / 960

/**
 * Which frame to show `t` seconds after the cloud started.
 *
 * `holdOffset` shifts where in the breathing a quad is, in frames, so a dozen
 * puffs do not swell in lockstep. It only applies to the hold: every puff
 * plays the grow from frame 0, because the skulls are in the grow.
 */
/**
 * `startAt` skips the opening frames: a cloud without skulls starts at SKULL_FREE_FROM, so the painted skulls of the
 * grow never show. It still plays forward from there, into the same hold.
 * @param {CloudSheet} sheet @param {number} t @param {number} [holdOffset] @param {number} [startAt]
 * @returns {number}
 */
export function cloudFrame(sheet, t, holdOffset = 0, startAt = 0) {
  const { frames, fps, grow } = sheet
  const f = startAt + Math.floor(Math.max(0, t) * fps)
  if (f < grow) return f
  const span = frames - 1 - grow
  if (span <= 0) return frames - 1
  const k = (((f - grow + Math.round(holdOffset)) % (2 * span)) + 2 * span) % (2 * span)
  return grow + (k <= span ? k : 2 * span - k)
}

/** Seconds the grow lasts — the spread to full size takes exactly this long. */
/** @param {CloudSheet} sheet @returns {number} */
export function growSeconds(sheet) {
  return sheet.grow / sheet.fps
}

/**
 * How far through the spread the cloud is, 0..1, eased out: it billows fast
 * from the point of impact and slows as it reaches the edge of the area.
 */
/** @param {number} t @param {number} seconds @param {number} [delay] @returns {number} */
export function spreadAt(t, seconds, delay = 0) {
  if (seconds <= 0) return 1
  const p = Math.min(1, Math.max(0, (t - delay) / seconds))
  return 1 - Math.pow(1 - p, 3)
}

/** Size a quad starts at, as a fraction of its full width. Never zero — it erupts. */
export const SPREAD_FROM = 0.3

/**
 * One puff of the cloud.
 *   x, z        final offset from the area's centre, in squares, on the floor (z is depth, + toward the viewer)
 *   width       full width in squares; height is width × CLOUD_ASPECT
 *   opacity     multiplies the baked opacity
 *   delay       seconds after impact this puff starts to spread
 *   holdOffset  frames into the hold breathing, so neighbours are out of step
 * @typedef {{x: number, z: number, width: number, opacity: number, delay: number, holdOffset: number}} Puff
 */

/**
 * Peak opacity per layer, on top of the 72% the sheet was baked at.
 *
 * Where two quads overlap a figure is behind both, so these are kept low
 * enough that two layers still let the sprite through: the centre at
 * 0.72 × 0.8 ≈ 58%, a satellite at 0.72 × 0.6 ≈ 43%, and a figure behind
 * one of each shows at roughly a quarter of its strength — dimmed, poisoned,
 * readable. The dark body of the smoke is baked lower than its bright rim,
 * so most of a figure sits behind less than that.
 */
export const CENTRE_OPACITY = 0.8
export const SATELLITE_OPACITY = 0.6

/** A tiny deterministic PRNG, so every seat lays the same cloud for the same cast. */
/** @param {number} seed */
function cloudRng(seed) {
  let s = (seed >>> 0) || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * The quads that fill an area `diameter` squares across.
 *
 * One at the centre the full width of the area, then a ring of smaller ones
 * at 60% of the radius so the near and far edges are veiled too. A one- or
 * two-square area gets the centre alone. Satellites start a beat after the
 * centre, staggered, so the cloud rolls outward rather than appearing as a
 * ring.
 */
/** @param {number} diameter @param {number} [seed] @returns {Puff[]} */
export function layoutPuffs(diameter, seed = 1) {
  const d = Math.max(1, diameter)
  const r = d / 2
  const rand = cloudRng(seed)
  /** @type {Puff[]} */
  const puffs = [{ x: 0, z: 0, width: d, opacity: CENTRE_OPACITY, delay: 0, holdOffset: 0 }]
  const n = d < 3 ? 0 : Math.min(6, Math.round(d * 0.75))
  const start = rand() * Math.PI * 2
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.4
    const at = r * (0.55 + rand() * 0.1)
    puffs.push({
      x: Math.cos(a) * at,
      z: Math.sin(a) * at,
      width: d * (0.5 + rand() * 0.12),
      opacity: SATELLITE_OPACITY,
      delay: 0.12 + (i / n) * 0.35,
      holdOffset: Math.floor(rand() * 40),
    })
  }
  return puffs
}

/**
 * The first frame of Sam's sheet with no skull in it. Measured on a contact sheet of frames 0-50: the big skull is
 * still faintly there at 34 and gone by 38. A cloud that should show no skulls (Stinking Cloud) starts here.
 */
export const SKULL_FREE_FROM = 38

/**
 * Skull heads fading in and out of a held cloud (Sam, 2026-10-25: "skeleton heads showing up in the gas (in and
 * out) depending on the spell").
 *
 * Time is cut into slots of SKULL_SLOT seconds. Each slot may raise one skull (seeded, so every seat sees the same
 * ones): which puff it surfaces in, where in that puff, which of the heads, and how big. A skull lives SKULL_LIFE
 * seconds — rising slowly, fading in, holding, fading out — so two or three are usually showing and they overlap
 * rather than blink on in turn. Nothing surfaces until the cloud has finished growing: the grow has its own painted
 * skulls.
 *
 * Returns the skulls showing at `t`, each with the puff index, an offset inside the puff as fractions of its width
 * and height (u from the centre, v up from the base), the head index, a scale relative to the puff's width, and alpha.
 * @param {number} t seconds since the cloud started
 * @param {number} from seconds at which skulls may begin (the end of the grow)
 * @param {number} puffs how many puffs the cloud has
 * @param {number} heads how many heads the sheet holds
 * @param {number} [seed]
 * @returns {{slot: number, puff: number, u: number, v: number, head: number, size: number, alpha: number}[]}
 */
export function skullsAt(t, from, puffs, heads, seed = 1) {
  const out = []
  if (puffs <= 0 || heads <= 0 || t < from) return out
  const first = Math.max(0, Math.floor((t - from - SKULL_LIFE) / SKULL_SLOT) + 1)
  const last = Math.floor((t - from) / SKULL_SLOT)
  for (let k = first; k <= last; k++) {
    const rand = cloudRng((seed * 7919 + k * 104729) >>> 0)
    if (rand() > SKULL_CHANCE) continue
    const age = t - from - k * SKULL_SLOT
    if (age < 0 || age > SKULL_LIFE) continue
    const p = age / SKULL_LIFE
    const fadeIn = Math.min(1, p / 0.3), fadeOut = Math.min(1, (1 - p) / 0.35)
    const ease = (x) => x * x * (3 - 2 * x)
    out.push({
      slot: k,
      puff: Math.floor(rand() * puffs),
      u: (rand() - 0.5) * 0.5,
      v: 0.3 + rand() * 0.3 + p * 0.06,          // a slow rise through the gas
      head: Math.floor(rand() * heads),
      size: 0.16 + rand() * 0.1,
      alpha: SKULL_ALPHA * ease(fadeIn) * ease(fadeOut),
    })
  }
  return out
}
/** Seconds between chances for a skull to surface. */
export const SKULL_SLOT = 0.9
/** Seconds a skull is visible, in and out. */
export const SKULL_LIFE = 2.6
/** Odds a slot raises one. */
export const SKULL_CHANCE = 0.7
/** A skull's peak opacity: inside the gas, not pasted on it. */
export const SKULL_ALPHA = 0.85
