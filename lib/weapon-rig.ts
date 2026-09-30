/**
 * weapon-rig — pure geometry for a first-person melee attack.
 *
 * No React, no canvas, no DOM. It answers two questions for a given moment in
 * an attack:
 *
 *   rigAt(clip, t)   where the hand is, and at what angle
 *   arcAt(clip, t)   the polygons of the trail the blade tip is cutting
 *
 * The caller draws. That is deliberate: the dashboard draws into a full-size
 * canvas, the first-person crawler draws into its own 640x360 buffer, and both
 * use the same numbers. See docs/design/claude_Melee_Attack_Rig.md.
 */

export type Phase = "windup" | "strike" | "recover"
export type Weight = "light" | "mid" | "heavy"

/** Joint pose. a1 is the elbow, a2 the wrist, both degrees; sc is foreshortening. */
export interface Pose { dx: number; dy: number; a1: number; a2: number; sc: number }
export interface Timing { windup: number; strike: number; recover: number }

/** A curved path the whole hand slides along WITHOUT rotating. */
export interface ArcPath { s: [number, number]; e: [number, number]; lift: number }

export interface Clip { cock: Pose; hit: Pose; path?: ArcPath }

export interface Rig { x: number; y: number; angle: number; scale: number; phase: Phase }

// --- the frame the numbers below live in -----------------------------------
/** Elbow at rest. Stage units; scale the whole thing to your surface. */
export const ELBOW = { x: 620, y: 600 } as const
export const FOREARM = 240
export const REST: Pose = { dx: 0, dy: 0, a1: -28, a2: -20, sc: 1 }
/** The angle the dagger art was painted at. Path clips hold this exactly. */
export const REST_ANGLE = ((REST.a1 + REST.a2 - 90) * Math.PI) / 180
/** Wrist to elbow, at rest. Path clips move the arm rigidly by this offset. */
export const ELBOW_OFFSET: [number, number] = [113, 212]

export const WEIGHT_SCALE: Record<Weight, number> = { light: 0.78, mid: 1, heavy: 1.36 }

export const CLIPS: Record<string, Clip> = {
  // Path clips: no rotation at all. The hand slides and the blade holds its angle.
  slash_d: {
    cock: { dx: 16, dy: -6, a1: 22, a2: 4, sc: 0.97 },
    hit: { dx: -18, dy: 10, a1: -78, a2: 4, sc: 1.05 },
    path: { s: [770, 470], e: [290, 470], lift: 150 },
  },
  jab: {
    cock: { dx: -18, dy: 13, a1: -38, a2: -28, sc: 0.97 },
    hit: { dx: 27, dy: -29, a1: -16, a2: -8, sc: 1.15 },
    path: { s: [484, 475], e: [560, 185], lift: 14 },
  },
  thrust: {
    cock: { dx: -30, dy: 22, a1: -46, a2: -36, sc: 0.94 },
    hit: { dx: 42, dy: -46, a1: -12, a2: -6, sc: 1.22 },
    path: { s: [477, 504], e: [575, 127], lift: 20 },
  },
  // Joint clips: the elbow (a1) carries the sweep, the wrist barely moves.
  slash_h: { cock: { dx: 22, dy: -2, a1: 10, a2: -10, sc: 0.98 }, hit: { dx: -26, dy: 4, a1: -86, a2: -10, sc: 1.04 } },
  chop_overhead: { cock: { dx: 10, dy: 30, a1: 44, a2: -20, sc: 0.95 }, hit: { dx: -10, dy: -16, a1: -74, a2: 6, sc: 1.1 } },
  bash: { cock: { dx: -14, dy: 14, a1: -6, a2: -30, sc: 0.96 }, hit: { dx: 22, dy: -20, a1: -46, a2: -8, sc: 1.12 } },
  swipe_wide: { cock: { dx: 26, dy: 2, a1: 30, a2: -14, sc: 1 }, hit: { dx: -30, dy: 6, a1: -96, a2: -14, sc: 1.03 } },
  throw: { cock: { dx: 20, dy: 34, a1: 50, a2: -40, sc: 0.9 }, hit: { dx: -16, dy: -30, a1: -60, a2: 20, sc: 1.16 } },
  shoot_bolt: { cock: { dx: -4, dy: -3, a1: -25, a2: -17, sc: 1.01 }, hit: { dx: 9, dy: 13, a1: -32, a2: -23, sc: 1 } },
  sling: { cock: { dx: 20, dy: 20, a1: 40, a2: -30, sc: 0.95 }, hit: { dx: -24, dy: -18, a1: -66, a2: 20, sc: 1.1 } },
  lash: { cock: { dx: 14, dy: 18, a1: 16, a2: -6, sc: 0.97 }, hit: { dx: -12, dy: -10, a1: -70, a2: 10, sc: 1.08 } },
  cast_gesture: { cock: { dx: -11, dy: 26, a1: -41, a2: -31, sc: 0.96 }, hit: { dx: 16, dy: -36, a1: -14, a2: 16, sc: 1.1 } },
  block: { cock: { dx: -16, dy: 16, a1: -35, a2: -26, sc: 0.98 }, hit: { dx: -36, dy: -41, a1: -56, a2: -41, sc: 1.06 } },
}

export const DEFAULT_TIMING: Timing = { windup: 220, strike: 90, recover: 300 }

// --- easing -----------------------------------------------------------------
const easeOut = (p: number) => 1 - (1 - p) * (1 - p)
const easeIn = (p: number) => Math.pow(p, 1.7)
const easeBack = (p: number, k: number) => 1 + (k + 1) * Math.pow(p - 1, 3) + k * Math.pow(p - 1, 2)
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

export function scaledTiming(t: Timing, weight: Weight): Timing {
  const m = WEIGHT_SCALE[weight] ?? 1
  // Weight bends the approach and the settle. It never slows the contact.
  return { windup: t.windup * m, strike: t.strike, recover: t.recover * m }
}
export function totalMs(t: Timing, weight: Weight): number {
  const d = scaledTiming(t, weight)
  return d.windup + d.strike + d.recover
}

function lerpPose(a: Pose, b: Pose, p: number): Pose {
  return {
    dx: a.dx + (b.dx - a.dx) * p, dy: a.dy + (b.dy - a.dy) * p,
    a1: a.a1 + (b.a1 - a.a1) * p, a2: a.a2 + (b.a2 - a.a2) * p,
    sc: a.sc + (b.sc - a.sc) * p,
  }
}
function bezier(p: ArcPath, u: number): [number, number] {
  const mx = (p.s[0] + p.e[0]) / 2
  const my = (p.s[1] + p.e[1]) / 2 - 2 * p.lift
  const v = 1 - u
  return [v * v * p.s[0] + 2 * v * u * mx + u * u * p.e[0], v * v * p.s[1] + 2 * v * u * my + u * u * p.e[1]]
}
function wristOf(p: Pose): [number, number] {
  const r = ((p.a1 - 90) * Math.PI) / 180
  return [ELBOW.x + p.dx + Math.cos(r) * FOREARM, ELBOW.y + p.dy + Math.sin(r) * FOREARM]
}
const REST_WRIST = wristOf(REST)

/** Where the hand is at normalised time t (0..1) through the clip. */
export function rigAt(clipName: string, t: number, weight: Weight = "light", timing: Timing = DEFAULT_TIMING): Rig {
  const C = CLIPS[clipName] ?? CLIPS.jab
  const d = scaledTiming(timing, weight)
  const T = d.windup + d.strike + d.recover
  let ms = clamp01(t) * T
  let phase: Phase, u: number, pose: Pose
  if (ms < d.windup) {
    phase = "windup"; u = ms / d.windup; pose = lerpPose(REST, C.cock, easeOut(u))
  } else if (ms - d.windup < d.strike) {
    phase = "strike"; u = (ms - d.windup) / d.strike; pose = lerpPose(C.cock, C.hit, easeIn(u))
  } else {
    phase = "recover"; u = (ms - d.windup - d.strike) / d.recover
    const k = weight === "heavy" ? 1.5 : weight === "mid" ? 1.05 : 0.75
    pose = lerpPose(C.hit, REST, Math.min(1, easeBack(u, k)))
  }

  if (!C.path) {
    const [wx, wy] = wristOf(pose)
    return { x: wx, y: wy, angle: ((pose.a1 + pose.a2 - 90) * Math.PI) / 180, scale: pose.sc, phase }
  }
  // Path clip: pure translation, the angle never leaves the painted pose.
  const a = bezier(C.path, 0), b = bezier(C.path, 1)
  let pt: [number, number]
  if (phase === "windup") {
    const q = easeOut(u); pt = [REST_WRIST[0] + (a[0] - REST_WRIST[0]) * q, REST_WRIST[1] + (a[1] - REST_WRIST[1]) * q]
  } else if (phase === "strike") {
    pt = bezier(C.path, easeIn(u))
  } else {
    const q = easeOut(Math.min(1, u)); pt = [b[0] + (REST_WRIST[0] - b[0]) * q, b[1] + (REST_WRIST[1] - b[1]) * q]
  }
  return { x: pt[0], y: pt[1], angle: REST_ANGLE, scale: pose.sc, phase }
}

/** The elbow, for callers that draw a forearm. */
export function elbowAt(rig: Rig): [number, number] {
  return [rig.x + ELBOW_OFFSET[0], rig.y + ELBOW_OFFSET[1]]
}

// --- the trail --------------------------------------------------------------
/** Four bands, outer first. Widths are stage units at weight = mid. */
export const ARC_BANDS: Array<{ width: number; color: string }> = [
  { width: 42, color: "#16243f" },
  { width: 32, color: "#2f4f86" },
  { width: 19, color: "#79b2e8" },
  { width: 8, color: "#eef7ff" },
]

export interface ArcBandPoly { color: string; points: Array<[number, number]> }
export interface Arc { alpha: number; bands: ArcBandPoly[] }

/**
 * The trail the blade tip is cutting at time t.
 *
 * tipOffset is the tip's position relative to the hand, in the SAME frame
 * rigAt returns — for an unrotating path clip that is a constant, which is why
 * the trail can never drift away from the blade.
 */
export function arcAt(
  clipName: string, t: number, tipOffset: [number, number],
  weight: Weight = "light", timing: Timing = DEFAULT_TIMING, samples = 40,
): Arc | null {
  const d = scaledTiming(timing, weight)
  const T = d.windup + d.strike + d.recover
  const a = d.windup / T, b = (d.windup + d.strike) / T
  const tt = clamp01(t)
  if (tt < a) return null
  let head: number, tail: number, alpha: number
  if (tt <= b) { const p = (tt - a) / (b - a); head = p; tail = Math.max(0, p - 0.55); alpha = 1 }
  else { const q = (tt - b) / (1 - b); head = 1; tail = Math.min(1, 0.45 + q * 0.8); alpha = Math.max(0, 1 - q / 0.5) }
  if (alpha <= 0 || head - tail < 0.03) return null

  const pts: Array<[number, number]> = []
  for (let i = 0; i <= samples; i++) {
    const u = tail + (head - tail) * (i / samples)
    const r = rigAt(clipName, a + (b - a) * u, weight, timing)
    const c = Math.cos(r.angle - REST_ANGLE), s = Math.sin(r.angle - REST_ANGLE)
    const ox = tipOffset[0] * r.scale, oy = tipOffset[1] * r.scale
    pts.push([r.x + ox * c - oy * s, r.y + ox * s + oy * c])
  }
  const kw = WEIGHT_SCALE[weight] ?? 1
  const bands = ARC_BANDS.map((band) => ({ color: band.color, points: ribbon(pts, band.width * kw) }))
  return { alpha, bands }
}

function ribbon(pts: Array<[number, number]>, maxW: number): Array<[number, number]> {
  const L: Array<[number, number]> = [], R: Array<[number, number]> = [], n = pts.length
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const w = maxW * Math.pow(Math.sin(Math.PI * u), 0.7)
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n - 1, i + 1)]
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], m = Math.hypot(dx, dy) || 1
    const nx = (-dy / m) * (w / 2), ny = (dx / m) * (w / 2)
    L.push([pts[i][0] + nx, pts[i][1] + ny]); R.push([pts[i][0] - nx, pts[i][1] - ny])
  }
  return L.concat(R.reverse())
}
