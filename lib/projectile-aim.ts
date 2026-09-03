// ============================================================================
// WHERE THE ARROW ACTUALLY GOES.
//
// Sam: "we should be able to see an arrow projectile leaving the bow or
// crossbow. An arrow flies and a hit impales the target or misses them if
// missed." And earlier: "Spells should hit the target creature or object
// directly when spell hits and misses the target when they miss, potentially
// causing damage elsewhere."
//
// THE BUG. Ranged weapon attacks were queued with `swing: true`, and the board
// short-circuits those: "a swing spawns no effect: the contact frame IS the
// impact". True of a sword. Wrong of a crossbow — the drow raised it, the
// bolt never existed, and Fifi took damage from nothing crossing the room.
//
// A MISS MUST MISS. Every projectile on this board has always flown to the
// target's exact centre, hit or miss, so the only difference a player could
// see between a 3 and a 19 was whether a number came off the body afterwards.
// That is the whole reason `margin` was put on the wire: "a martial who is
// missed by 2 was very nearly hit... one missed by 9 was never in danger."
// This is the first thing to spend it.
//
// Pure, so the geometry is testable without a scene. The board turns these
// numbers into a mesh.
// ============================================================================

export interface Vec2 { x: number; z: number }

/**
 * How far wide a miss goes, in board units, from the margin.
 *
 * A near miss (margin -1) should shave past the shoulder; a wide one (-10 or
 * worse) should be visibly nowhere near. Clamped at both ends: a fumble that
 * rolls -25 must not send the bolt into the next room, and a miss by one must
 * still be seen to miss rather than looking like a hit that failed to
 * register.
 */
export function missOffset(margin: number): number {
  const by = Math.max(0, -margin)          // margin is negative on a miss
  const NEAR = 0.35                        // just past them
  const FAR = 1.6                          // a whole square wide
  const t = Math.min(1, by / 10)
  return NEAR + (FAR - NEAR) * t
}

/**
 * The point a shot actually travels to.
 *
 * On a hit, the target. On a miss, a point offset PERPENDICULAR to the line of
 * flight, so the bolt passes the target rather than stopping short of it —
 * stopping short reads as hitting an invisible wall, and overshooting straight
 * through reads as a hit that did no damage.
 *
 * `seed` picks the side, so two misses in a row do not both go left, and the
 * same shot always looks the same when replayed on another seat.
 */
export function aimPoint(opts: {
  from: Vec2
  to: Vec2
  hit: boolean
  margin?: number
  seed?: number
}): Vec2 {
  if (opts.hit) return { ...opts.to }
  const dx = opts.to.x - opts.from.x
  const dz = opts.to.z - opts.from.z
  const len = Math.hypot(dx, dz)
  // Shooter and target on the same square: there is no line to be wide of, so
  // the shot simply arrives. Better than dividing by zero and sending the
  // bolt to NaN, which removes it from the scene without a trace.
  if (len < 1e-4) return { ...opts.to }
  // Perpendicular, normalised.
  const px = -dz / len
  const pz = dx / len
  const side = ((opts.seed ?? 0) % 2 === 0) ? 1 : -1
  const off = missOffset(opts.margin ?? -5) * side
  // A LITTLE PAST THEM, TOO. A bolt that stops level with the target looks
  // like it struck something invisible; carrying it 25% beyond reads as a
  // shot that went by.
  return {
    x: opts.to.x + px * off + (dx / len) * 0.5,
    z: opts.to.z + pz * off + (dz / len) * 0.5,
  }
}

/**
 * How long the shot is in the air, in seconds.
 *
 * Proportional to distance, because a bolt across the room should take longer
 * than one at five feet — a fixed duration makes short shots look slow and
 * long ones look teleported. Bounded so neither extreme stalls the turn.
 */
export function flightTime(from: Vec2, to: Vec2, unitsPerSecond = 26): number {
  const d = Math.hypot(to.x - from.x, to.z - from.z)
  return Math.min(0.65, Math.max(0.12, d / unitsPerSecond))
}
