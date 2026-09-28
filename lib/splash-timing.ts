// ============================================================================
// SPLASH — when the blast reaches each body in it.
//
// Sam, 2026-09-28: "magical and explosive splash effects that land on
// targets."
//
// ── the bug this fixes ─────────────────────────────────────────────────────
//
// An area cast already resolves correctly. The board fires ONE kit effect at
// the aim point, lays a floor decal over `p.cells`, and then, in flinch(),
// loops `p.victims` applying hit points and reactions to everyone standing in
// the shape. What it never does is put anything ON those bodies. So a Fireball
// dropped into four drow blooms once in the middle of them, and the four drow
// take damage numbers and flinch while nothing visibly touches any of them.
// The explosion and the casualties are two unrelated events that happen to
// share a frame.
//
// ── what this file is ──────────────────────────────────────────────────────
//
// The arithmetic for making the blast ARRIVE at each body, rather than all at
// once. A shockwave is a wave: it leaves the centre and takes time to cross
// the room, so a drow standing on the far edge of a 20-foot radius is hit a
// beat after the one at ground zero. Staggering the splashes by real distance
// is what turns four simultaneous poofs into an expanding explosion, and it
// costs nothing but the delay computed here.
//
// Pure arithmetic and no THREE import, so the timing can be asserted rather
// than eyeballed. components/tactical/spell-splash.ts does the drawing.
// ============================================================================

import type { DamageType } from "@/components/tactical/spell-vfx-kit"

/**
 * Damage types that arrive as a WAVE FRONT — a pressure or light front that
 * leaves the centre and travels. These stagger.
 *
 * Everything else arrives as a MEDIUM: a cloud settles, a rime spreads, a
 * necrotic wither takes hold. Those have no front to travel and are drawn
 * together, which is both correct and cheaper.
 *
 * Cold is deliberately on the slow list even though Cone of Cold is plainly
 * a blast: what makes cold read is the rime creeping over everyone at once,
 * not a pressure front. If that turns out wrong on the board it is one line.
 */
const EXPLOSIVE: ReadonlySet<DamageType> = new Set<DamageType>([
  "fire", "thunder", "lightning", "force", "radiant",
])

export function isExplosive(type: DamageType): boolean {
  return EXPLOSIVE.has(type)
}

/**
 * How fast the front crosses the room, in FEET per second.
 *
 * Not physical — a real blast wave is supersonic and would arrive everywhere
 * inside one frame, which is the same as not staggering at all. This is the
 * speed at which a 20-foot-radius Fireball takes about a fifth of a second to
 * reach its outer edge: slow enough for the eye to read as expansion, fast
 * enough that nobody waits for their damage number.
 */
export const WAVE_FEET_PER_SECOND = 110

/** Nobody waits longer than this, however large the shape. */
export const MAX_SPLASH_DELAY = 0.26

export interface SplashBody {
  id: string
  /** Grid square the body stands on. */
  x: number
  y: number
}

export interface SplashArrival extends SplashBody {
  /** Seconds after the impact frame that this body's splash plays. */
  delay: number
  /** Distance from the blast centre, in feet. For the renderer's falloff. */
  distanceFt: number
  /**
   * 1 at ground zero falling to `EDGE_STRENGTH` at the furthest body — scales
   * the splash's size and spark count so the edge of a blast is visibly the
   * edge rather than a second ground zero.
   */
  strength: number
}

/** How strong the furthest body's splash is relative to the nearest. */
export const EDGE_STRENGTH = 0.55

/**
 * Turn everyone caught in a shape into an ordered list of arrivals.
 *
 * `centre` is the shape's own origin in GRID coordinates — the aim point for
 * a sphere, the caster's own square for a cone or a self-centred burst, which
 * is what the board already passes as `p.centre`. That makes a cone's front
 * travel outward from the caster along the cone, which is right.
 *
 * `feetPerSquare` is the board's 5. Passed rather than imported so a test can
 * use a round number.
 */
export function splashArrivals(
  centre: { x: number; y: number },
  bodies: readonly SplashBody[],
  opts: {
    explosive: boolean
    feetPerSquare: number
    waveFeetPerSecond?: number
    maxDelay?: number
  },
): SplashArrival[] {
  const speed = opts.waveFeetPerSecond ?? WAVE_FEET_PER_SECOND
  const cap = opts.maxDelay ?? MAX_SPLASH_DELAY

  const measured = bodies.map((b) => {
    const dx = b.x - centre.x
    const dy = b.y - centre.y
    return { body: b, distanceFt: Math.hypot(dx, dy) * opts.feetPerSquare }
  })

  // Strength falls off across the ACTUAL SPREAD of this blast — furthest
  // body minus nearest — rather than across the furthest distance alone.
  //
  // The difference bites whenever nobody is standing at ground zero. Dividing
  // by the furthest distance makes `k` equal 1 for every body in a ring of
  // equidistant victims, so a Fireball that catches four drow at exactly 10
  // feet would draw four identical EDGE splashes and no full one. Measuring
  // the spread instead means the nearest body in any blast is always the full
  // one and the furthest is always the faint one, which is what the falloff
  // is for; with one victim, or with no spread at all, everybody is nearest.
  const near = measured.reduce((m, r) => Math.min(m, r.distanceFt), Infinity)
  const far = measured.reduce((m, r) => Math.max(m, r.distanceFt), 0)
  const spread = far - near

  return measured
    .map(({ body, distanceFt }) => {
      const k = spread > 0 ? (distanceFt - near) / spread : 0
      return {
        ...body,
        distanceFt,
        delay: opts.explosive ? Math.min(cap, distanceFt / speed) : 0,
        strength: 1 - (1 - EDGE_STRENGTH) * k,
      }
    })
    .sort((a, b) => a.delay - b.delay || a.id.localeCompare(b.id))
}

/**
 * What a splash should look like given how the body FARED.
 *
 * A save is not a miss — the fireball still washed over them — but it must not
 * look like a full hit or the board lies about the roll. A saved body takes a
 * smaller, cooler, sparkless splash: the blast reached them and they turned
 * it. A body that took nothing at all (immune, or an ally the shape spared)
 * gets nothing.
 */
export function splashWeight(outcome: {
  amount: number
  heals?: boolean
  word?: string | null
}): { draw: boolean; scale: number; sparks: number; warded: boolean } {
  const saved = (outcome.word ?? "").trim().toUpperCase() === "SAVED"
  if (outcome.amount <= 0 && !saved) return { draw: false, scale: 0, sparks: 0, warded: false }
  if (saved) return { draw: true, scale: 0.62, sparks: 0, warded: true }
  return { draw: true, scale: 1, sparks: 1, warded: false }
}
