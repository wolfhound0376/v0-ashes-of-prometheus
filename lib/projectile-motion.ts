// ============================================================================
// HOW A SPELL CROSSES THE ROOM.
//
// Every thrown spell used to travel the same way: a straight lerp from the
// hand to the target at constant speed, with a sprite that always faced the
// camera the same way up. A Fireball and a Magic Missile differed only in
// colour. Sam: "better magic projectile movement".
//
// A projectile's motion is what tells you what it is before it lands. A ball
// of fire is HEAVY: it is lobbed, it rises and falls. A missile of force is
// ALIVE: it weaves, hunting the target, and never misses (the spell says so).
// A psychic bolt DRIFTS, spiralling in. A dart is just fast.
//
// Pure functions of progress, so the whole thing is testable without a scene
// and replays identically on every seat — the seed picks the phase, the
// board turns the numbers into a mesh.
// ============================================================================

export type MotionKind = "lob" | "weave" | "dart" | "drift" | "seek"

export interface MotionProfile {
  kind: MotionKind
  /**
   * Exponent on progress: 1 is constant speed, above 1 leaves the hand slowly
   * and arrives fast (a throw), below 1 the reverse. Arrival should be the
   * fastest moment for anything that hits — the eye reads a slowing bolt as
   * a bolt that missed.
   */
  ease: number
  /** Peak lift at the midpoint, in board units per square of distance, capped by `liftMax`. */
  lift: number
  liftMax: number
  /** Side-to-side hunt: amplitude in board units, and how many full swings across the flight. */
  weaveAmp: number
  weaveCycles: number
  /** Corkscrew around the line of flight: radius in board units, turns per flight. */
  spiralRadius: number
  spiralTurns: number
  /** How far the sprite is stretched along its travel at full speed. 1 = not at all. */
  stretch: number
  /** After-images drawn behind it. 0 = none. */
  trail: number
  /**
   * A swing out wide before it comes home: the peak sideways bulge of the
   * whole path, in board units. The seed picks the side, so a volley fans
   * out — three darts leave by three routes and all arrive. Sam: "Magic
   * missile can actually move around to find a target."
   */
  bow?: number
}

export const MOTION: Record<MotionKind, MotionProfile> = {
  // Fireball, Acid Splash's glob, a thrown flask: it has weight, so it arcs.
  lob:   { kind: "lob",   ease: 1.15, lift: 0.11, liftMax: 0.55, weaveAmp: 0,    weaveCycles: 0,   spiralRadius: 0,    spiralTurns: 0, stretch: 1.0,  trail: 3 },
  // Magic Missile: it swerves toward the target and tightens as it closes.
  weave: { kind: "weave", ease: 1.30, lift: 0.02, liftMax: 0.12, weaveAmp: 0.24, weaveCycles: 2.5, spiralRadius: 0,    spiralTurns: 0, stretch: 1.35, trail: 3 },
  // A straight, fast shot — Guiding Bolt, a ray resolved as an attack.
  dart:  { kind: "dart",  ease: 1.60, lift: 0,    liftMax: 0,    weaveAmp: 0,    weaveCycles: 0,   spiralRadius: 0,    spiralTurns: 0, stretch: 1.45, trail: 2 },
  // A psychic bolt: it corkscrews in, unhurried until the end.
  drift: { kind: "drift", ease: 1.05, lift: 0.03, liftMax: 0.15, weaveAmp: 0,    weaveCycles: 0,   spiralRadius: 0.12, spiralTurns: 2, stretch: 1.0,  trail: 3 },
  // Magic Missile: each dart swings out on its own side and homes in — a
  // volley leaves as a fan and closes as a fist. Still weaves a little, so
  // it reads as hunting rather than as a fixed arc.
  seek:  { kind: "seek",  ease: 1.25, lift: 0.04, liftMax: 0.25, weaveAmp: 0.08, weaveCycles: 2,   spiralRadius: 0,    spiralTurns: 0, stretch: 1.3,  trail: 3, bow: 0.9 },
}

export interface Vec3 { x: number; y: number; z: number }

/** Progress along the line of flight, eased. 0 at the hand, 1 at the target. */
export function alongAt(profile: MotionProfile, p: number): number {
  const c = Math.min(1, Math.max(0, p))
  return Math.pow(c, profile.ease)
}

/**
 * Where the projectile is at progress `p`, in the flight's own frame:
 * `along` in 0..1 down the line, `up` in board units above the line, `side`
 * in board units to the right of it (facing the target).
 *
 * `distance` is the length of the flight in board units: a lob over ten
 * squares rises higher than one over two. `seed` picks the phase so two
 * missiles in the same volley do not swing in step.
 */
export function poseAt(profile: MotionProfile, p: number, distance: number, seed = 0): { along: number; up: number; side: number } {
  const c = Math.min(1, Math.max(0, p))
  const along = alongAt(profile, c)
  const phase = ((seed % 7) / 7) * Math.PI * 2
  // Lift: a half-sine, so it leaves the hand rising and arrives falling.
  const lift = Math.min(profile.liftMax, profile.lift * distance)
  let up = Math.sin(c * Math.PI) * lift
  let side = 0
  if (profile.weaveAmp) {
    // The hunt tightens as it closes: full swing leaving, none arriving.
    const damp = Math.pow(1 - c, 0.6)
    side += Math.sin(c * profile.weaveCycles * Math.PI * 2 + phase) * profile.weaveAmp * damp
  }
  if (profile.spiralRadius) {
    const damp = Math.sin(c * Math.PI)   // opens after launch, closes on arrival
    const a = c * profile.spiralTurns * Math.PI * 2 + phase
    side += Math.cos(a) * profile.spiralRadius * damp
    up += Math.sin(a) * profile.spiralRadius * damp
  }
  if (profile.bow) {
    // A half-sine bulge to one side, peaking before the midpoint so the dart
    // is already turning home by the time it is furthest out. Which side, and
    // how far, is the seed's: consecutive seeds alternate and spread, so a
    // fan of darts opens rather than three darts stacking on one path.
    const sign = seed % 2 === 0 ? 1 : -1
    const spread = 0.55 + 0.45 * (((seed >> 1) % 3) / 2)
    side += Math.sin(Math.pow(c, 0.8) * Math.PI) * profile.bow * spread * sign
  }
  return { along, up, side }
}

/**
 * The flight frame: unit vectors along the flight, to its right, and up,
 * built from the hand and the target. Returned flat so callers without a
 * vector library can use it.
 */
export function flightFrame(from: Vec3, to: Vec3): { forward: Vec3; right: Vec3; up: Vec3; distance: number } {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z
  const distance = Math.hypot(dx, dy, dz)
  if (distance < 1e-6) {
    return { forward: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, distance: 0 }
  }
  const forward = { x: dx / distance, y: dy / distance, z: dz / distance }
  // Right = forward × world-up, flattened so "side" is always horizontal.
  const flat = Math.hypot(forward.x, forward.z)
  const right = flat < 1e-6
    ? { x: 1, y: 0, z: 0 }
    : { x: -forward.z / flat, y: 0, z: forward.x / flat }
  return { forward, right, up: { x: 0, y: 1, z: 0 }, distance }
}

/** World position at progress `p`, as plain numbers. */
export function positionAt(profile: MotionProfile, p: number, from: Vec3, to: Vec3, seed = 0): Vec3 {
  const f = flightFrame(from, to)
  const pose = poseAt(profile, p, f.distance, seed)
  return {
    x: from.x + (to.x - from.x) * pose.along + f.right.x * pose.side + f.up.x * pose.up,
    y: from.y + (to.y - from.y) * pose.along + f.right.y * pose.side + f.up.y * pose.up,
    z: from.z + (to.z - from.z) * pose.along + f.right.z * pose.side + f.up.z * pose.up,
  }
}

/**
 * How far to roll a camera-facing sprite so its +X points along `velocity`
 * as seen on screen. `right` and `up` are the camera's own axes in world
 * space. Radians, counter-clockwise on screen. Zero when the velocity is
 * straight at or away from the camera, where no roll is right.
 */
export function screenRoll(velocity: Vec3, right: Vec3, up: Vec3): number {
  const vx = velocity.x * right.x + velocity.y * right.y + velocity.z * right.z
  const vy = velocity.x * up.x + velocity.y * up.y + velocity.z * up.z
  if (Math.abs(vx) < 1e-6 && Math.abs(vy) < 1e-6) return 0
  return Math.atan2(vy, vx)
}

/**
 * How much of the sprite's stretch applies right now: none leaving the
 * hand, all of it at arrival speed. Speed is the derivative of the eased
 * progress, normalised so a constant-speed flight reads 1 the whole way.
 */
export function stretchAt(profile: MotionProfile, p: number): number {
  const c = Math.min(1, Math.max(0, p))
  const speed = profile.ease * Math.pow(Math.max(c, 1e-4), profile.ease - 1)   // d/dp of p^ease
  const k = Math.min(1.6, speed) / 1.6
  return 1 + (profile.stretch - 1) * k
}
