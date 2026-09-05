/**
 * PUTTING A THING DOWN SOMEWHERE ELSE.
 *
 * Sam: "we should be able to pick up items both as an option in an icon,
 * throw item, and by double clicking it."
 *
 * Picking up already worked. Throwing did not exist at all, and it is the
 * half that makes an inventory feel like it is IN the room: a dagger you can
 * only carry is a line on a sheet, and a dagger you can put across the pen is
 * a decision.
 *
 * What a throw is, mechanically, is a transfer: the row leaves the character's
 * inventory and becomes a pile on a square. Nothing here rolls dice. Throwing
 * a weapon AT somebody is an attack and belongs to the attack path, which
 * already knows about ranges and AC; this is the humbler thing — heaving an
 * object to a spot, which is how a key reaches a prisoner and how a torch
 * reaches a dark corner.
 */

/** Feet per square, matching lib/tactical. Stated so the tests can see it. */
export const FEET_PER_SQUARE = 5

/**
 * Thrown weapons carry their own ranges in the SRD, and they differ enough to
 * matter: a dart goes three times as far as a net. Normal range first, long
 * range second — beyond normal is disadvantage, which is the attack path's
 * business, but the LONG range is a hard stop for everybody.
 */
const THROWN: { match: RegExp; normal: number; long: number }[] = [
  { match: /\bdart\b/i, normal: 20, long: 60 },
  { match: /\bdagger|knife|dirk|shiv\b/i, normal: 20, long: 60 },
  { match: /\bhandaxe|hand axe\b/i, normal: 20, long: 60 },
  { match: /\blight hammer\b/i, normal: 20, long: 60 },
  { match: /\bjavelin\b/i, normal: 30, long: 120 },
  { match: /\bspear|trident\b/i, normal: 20, long: 60 },
  { match: /\bnet\b/i, normal: 5, long: 15 },
  { match: /\bflask|vial|oil|acid|holy water|alchemist/i, normal: 20, long: 60 },
]

/**
 * Anything that is not a thrown weapon. The SRD has no table for hurling a
 * lantern, so this is a ruling rather than a citation: a person can put an
 * ordinary object about four squares, and a heavy one rather less.
 */
const DEFAULT_NORMAL = 20
const DEFAULT_LONG = 40
/** Past this weight it is a shove, not a throw. */
export const TOO_HEAVY_LB = 60

export interface ThrowRange {
  normal: number
  long: number
  /** True when the range came from the SRD rather than the general ruling. */
  known: boolean
}

export function throwRangeFor(name: string | null | undefined, weightLb?: number | null): ThrowRange {
  const n = String(name ?? "")
  for (const t of THROWN) {
    if (t.match.test(n)) return { normal: t.normal, long: t.long, known: true }
  }
  const w = Number(weightLb)
  // A heavy thing does not fly. Scale down rather than refuse outright, so a
  // shield can still be shoved a square and a table cannot be lobbed.
  if (Number.isFinite(w) && w > 20) {
    const factor = Math.max(0.25, 1 - (w - 20) / 80)
    return { normal: Math.max(5, Math.round(DEFAULT_NORMAL * factor / 5) * 5),
             long: Math.max(5, Math.round(DEFAULT_LONG * factor / 5) * 5), known: false }
  }
  return { normal: DEFAULT_NORMAL, long: DEFAULT_LONG, known: false }
}

export interface Square { x: number; y: number }

/** Chebyshev, the same diagonal the rest of the board measures with. */
export const distanceFt = (a: Square, b: Square) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * FEET_PER_SQUARE

export interface ThrowVerdict {
  ok: boolean
  /** Beyond normal range but inside long: allowed, and worth saying. */
  longRange: boolean
  distanceFt: number
  reason?: string
}

/**
 * May this be thrown there?
 *
 * Refuses only for reasons a player can see and fix: too far, too heavy, or
 * nowhere. Everything about whose turn it is and what it costs is the route's
 * business, exactly as it is for picking up.
 */
export function canThrow(opts: {
  from: Square
  to: Square
  name?: string | null
  weightLb?: number | null
}): ThrowVerdict {
  const d = distanceFt(opts.from, opts.to)
  const w = Number(opts.weightLb)
  if (Number.isFinite(w) && w > TOO_HEAVY_LB) {
    return { ok: false, longRange: false, distanceFt: d, reason: `too heavy to throw` }
  }
  if (d === 0) {
    return { ok: false, longRange: false, distanceFt: d, reason: "that is the square you are standing in — drop it instead" }
  }
  const range = throwRangeFor(opts.name, opts.weightLb)
  if (d > range.long) {
    return { ok: false, longRange: false, distanceFt: d, reason: `out of range — that is ${d} ft and it carries ${range.long} ft at the very most` }
  }
  return { ok: true, longRange: d > range.normal, distanceFt: d }
}
