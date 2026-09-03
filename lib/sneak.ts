// ============================================================================
// SNEAKING — who can actually see you, and from which way they are looking.
//
// Sam: "When hide is selected reveal everyone's line of site (except the
// player selecting hide — change this word to Sneak) and be reasonable. If
// they are not facing the character they shouldn't be able to see in 200-360
// degrees. If they are an animal they may be able to smell if you are within
// one foot of them. If whomever is sneaking does not intersect with line of
// site (and remember height rules; haflings, gnomes, and small people can
// often benefit from being short and walking behind tall people), then no
// roll for stealth is required. If they intersect then a roll is performed
// per turn in sneak mode."
//
// THIS IS A HOUSE RULE AND IT SHOULD BE READ AS ONE.
//
// 5e has NO facing. It is a deliberate omission in the core rules — the DMG
// offers facing only as an optional variant — because tracking which way a
// miniature points slows a table down and invites arguments. None of that
// applies here: the board already knows exactly where every creature is, and
// a computer can turn a token without anybody arguing about it. So the reason
// 5e leaves facing out is a reason that does not exist in this game.
//
// What it buys is the thing Sam actually wants: a rogue who can work the room
// instead of rolling dice at it. Position becomes a decision.
//
// WHAT IT REPLACES. The SRD's rule is "you can't hide from a creature that can
// see you clearly", full stop — one boolean, and lib/hiding flattens the whole
// room to the keenest passive Perception. That is correct 5e and it made Hide
// a dice-roll with no geography. Here, being seen is a fact about ARCS, WALLS
// and BODIES, and:
//
//   nobody can see you   →  hidden, NO ROLL. You did the work with your feet.
//   somebody can        →  a contest, re-rolled each turn you stay in sneak.
//
// EVERYTHING BELOW IS PURE. No Supabase, no THREE, no React — because the
// board draws these cones and the server judges by them, and if those two ever
// used different arithmetic the game would be lying to the player about the
// one thing this feature exists to show them. One function, two callers.
// ============================================================================

/** The size ladder, as a number, so "bigger than" is arithmetic. */
export const SIZE_ORDER: Record<string, number> = {
  tiny: 0, small: 1, medium: 2, large: 3, huge: 4, gargantuan: 5,
}

export function sizeRank(size: string | null | undefined): number {
  const k = (size ?? "").trim().toLowerCase()
  return k in SIZE_ORDER ? SIZE_ORDER[k] : SIZE_ORDER.medium
}

/**
 * How wide a creature's vision is, in degrees, centred on its facing.
 *
 * Sam's number: blind "in 200-360 degrees", so 200 degrees of sight and 160
 * of blind spot behind. That is generous — a human's real binocular arc is
 * far narrower — and generous is right: this is a tabletop abstraction, and a
 * rule that makes creatures nearly blind would turn every fight into a
 * conga line of people sneaking up behind each other.
 */
export const VISION_ARC_DEG = 200

/**
 * How far a beast can smell you, in squares.
 *
 * Sam said "within one foot". The board's smallest unit is a five-foot
 * square, so one foot rounds to the square you are standing in and the ones
 * touching it — you cannot be a foot from something without being adjacent to
 * it. Stated because it is a deviation from what he wrote, not an oversight.
 */
export const SMELL_SQUARES = 1

export interface Vantage {
  id: string
  label: string
  x: number
  y: number
  /**
   * Which way it is looking, in radians, matching vtt_tokens.rotation_y —
   * the board's own convention, where 0 faces +Z and the angle is
   * atan2(dx, dz).
   *
   * NULL MEANS ALL-ROUND, and that is the safe direction to fail in. A
   * creature whose facing nobody has recorded must not become blind by
   * accident: until this feature, rotation_y was 0 on every token in the
   * database, and treating "unset" as "facing north" would have silently made
   * three quarters of the room unable to see anything.
   */
  facing: number | null
  passivePerception: number
  size: string | null
  /** Beasts smell. A drow does not. */
  isBeast?: boolean
  /** Blindsight or tremorsense, in squares: sees without looking. */
  blindsight?: number
}

export interface Sneaker {
  x: number
  y: number
  size: string | null
}

/** Why a particular creature cannot see the sneaker — or why it can. */
export type Sight =
  | { sees: false; why: "behind" | "wall" | "screened" }
  | { sees: true; how: "eyes" | "smell" | "blindsight" }

/** Smallest signed difference between two angles, in radians. */
function angleDelta(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Chebyshev distance in squares — the metric the rest of this board uses. */
export function squaresBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

/**
 * The angle that faces from `a` toward `b`, in the board's convention.
 *
 * Returns NULL when the two are the same square: there is no direction from a
 * point to itself, and inventing one would silently turn a creature that
 * stood still. The caller leaves the old facing alone.
 */
export function facingTowards(a: { x: number; y: number }, b: { x: number; y: number }): number | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return null
  return Math.atan2(dx, dy)
}

/**
 * Is the sneaker inside this creature's arc of vision?
 *
 * A creature standing on top of you is always in your arc: the angle between
 * two identical points is meaningless, and "you cannot see the thing in your
 * own square" is not a rule anybody wants.
 */
export function withinArc(v: Vantage, s: { x: number; y: number }, arcDeg = VISION_ARC_DEG): boolean {
  if (v.facing == null) return true
  const dx = s.x - v.x
  const dy = s.y - v.y
  if (dx === 0 && dy === 0) return true
  // The board's angle convention: rotation_y = atan2(dx, dz), 0 facing +Z.
  const toward = Math.atan2(dx, dy)
  return Math.abs(angleDelta(toward, v.facing)) <= (arcDeg / 2) * (Math.PI / 180)
}

/**
 * The squares a straight line from `a` to `b` passes through, endpoints
 * excluded.
 *
 * Supercover rather than Bresenham: a line that clips the corner of a square
 * has passed through it, and for cover that matters — the thin-line version
 * lets a rogue be "screened" by a body the line technically missed by an
 * inch, which is exactly the kind of ruling that starts an argument.
 */
export function squaresOnLine(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  const dx = b.x - a.x
  const dy = b.y - a.y
  const steps = Math.max(Math.abs(dx), Math.abs(dy))
  if (steps === 0) return out
  const seen = new Set<string>([`${a.x},${a.y}`, `${b.x},${b.y}`])
  // Sample finely enough that no square on a diagonal is skipped.
  const n = steps * 4
  for (let i = 1; i < n; i++) {
    const t = i / n
    const x = Math.round(a.x + dx * t)
    const y = Math.round(a.y + dy * t)
    const k = `${x},${y}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ x, y })
  }
  return out
}

/**
 * Can this creature see the sneaker?
 *
 * The order of the checks is the rule. Blindsight and smell come FIRST,
 * because they do not care which way anything is facing and a creature that
 * can smell you is not fooled by standing behind a friend.
 */
export function sightOf(opts: {
  vantage: Vantage
  sneaker: Sneaker
  /** Everyone else on the board, for the screening check. */
  bodies: { x: number; y: number; size: string | null; id: string }[]
  /** Squares that are floor. Anything not in here blocks sight. */
  walkable?: Set<string>
  arcDeg?: number
}): Sight {
  const { vantage: v, sneaker: s } = opts
  const dist = squaresBetween(v, s)

  // Sees without looking. Nothing below can save you from this.
  if (v.blindsight && dist <= v.blindsight) return { sees: true, how: "blindsight" }
  // Sam: an animal may smell you if you are close enough. Facing is
  // irrelevant to a nose.
  if (v.isBeast && dist <= SMELL_SQUARES) return { sees: true, how: "smell" }

  if (!withinArc(v, s, opts.arcDeg)) return { sees: false, why: "behind" }

  const between = squaresOnLine(v, s)

  // A wall between you is a wall whichever way anyone is facing.
  if (opts.walkable && opts.walkable.size > 0) {
    for (const c of between) {
      if (!opts.walkable.has(`${c.x},${c.y}`)) return { sees: false, why: "wall" }
    }
  }

  // SOMEBODY BIGGER, STANDING IN THE WAY.
  //
  // Sam's height rule, generalised past halflings: you are screened by anyone
  // at least one size larger than you standing on the line. That is what
  // makes a gnome behind a human invisible — and, just as usefully, what lets
  // anybody at all duck behind a hook horror.
  //
  // Strictly larger, not equal: two humans in a line do not hide each other,
  // which is both true and what stops a party of four mediums forming an
  // impenetrable wall by standing still.
  const mine = sizeRank(s.size)
  for (const c of between) {
    const body = opts.bodies.find((b) => b.x === c.x && b.y === c.y && b.id !== v.id)
    if (body && sizeRank(body.size) > mine) return { sees: false, why: "screened" }
  }

  return { sees: true, how: "eyes" }
}

export interface SneakVerdict {
  /** Everyone who can see the sneaker, with how. */
  seenBy: { id: string; label: string; how: "eyes" | "smell" | "blindsight"; passivePerception: number }[]
  /**
   * Nobody can see them: hidden with NO ROLL.
   *
   * Sam's rule, and the reason the whole feature is worth building — a rogue
   * who worked the angles has already succeeded, and asking for a d20 after
   * that would tell the player their positioning did not matter.
   */
  unopposed: boolean
  /** The number to beat when it IS opposed. Null when nobody can see. */
  dc: number | null
  /** Whose passive Perception set that number. */
  keenest: string | null
}

/** Work out what the room can see. */
export function surveySneak(opts: {
  sneaker: Sneaker
  vantages: Vantage[]
  bodies: { x: number; y: number; size: string | null; id: string }[]
  walkable?: Set<string>
  arcDeg?: number
}): SneakVerdict {
  const seenBy: SneakVerdict["seenBy"] = []
  for (const v of opts.vantages) {
    const sight = sightOf({ vantage: v, sneaker: opts.sneaker, bodies: opts.bodies, walkable: opts.walkable, arcDeg: opts.arcDeg })
    if (sight.sees) {
      seenBy.push({ id: v.id, label: v.label, how: sight.how, passivePerception: v.passivePerception })
    }
  }
  if (!seenBy.length) return { seenBy, unopposed: true, dc: null, keenest: null }
  // The keenest eye in the room sets the bar, as it did before — one boolean
  // on the token still cannot hold "hidden from the drow but not the
  // priestess", and being seen by the sharpest of them is the conservative
  // direction to round in.
  const best = seenBy.reduce((a, b) => (b.passivePerception > a.passivePerception ? b : a))
  return { seenBy, unopposed: false, dc: best.passivePerception, keenest: best.label }
}
