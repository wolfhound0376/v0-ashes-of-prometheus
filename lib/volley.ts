// ============================================================================
// SPELLS THAT FIRE MORE THAN ONE THING, AND SPELLS THAT SHOVE.
//
// Sam: "magic missile and eldritch blast should show projectiles that match
// the amount they fire ... the ability to choose how many projectiles (clicks
// in a circle like BG3 for each target out of a total available). We need
// blasts that throw people back or make them fall and stay lying on the
// ground."
//
// Until now Magic Missile was one 3d4+3 lump on one creature and nothing on
// this board pushed anybody. The rules here are pure and shared by the board
// (the picker) and the route (the roll), so the two cannot disagree about how
// many darts there are or where a shove ends.
//
// Sources: SRD 5.1 Spells — Magic Missile ("three glowing darts ... one more
// dart for each slot level above 1st"), Scorching Ray ("three rays ... one
// additional ray for each slot level above 2nd"), Eldritch Blast ("two beams
// at 5th level, three beams at 11th level, and four beams at 17th level"),
// Thunderwave ("On a failed save, a creature takes 2d8 thunder damage and is
// pushed 10 feet away from you").
// ============================================================================

import type { Cell } from "@/lib/aoe"

/** How a spell's projectile count scales. On the spellbook entry. */
export interface VolleySpec {
  /** At the spell's own level, from a caster of any level. */
  count: number
  /** Extra projectiles per slot level above the spell's level (Magic Missile, Scorching Ray). */
  perSlotAbove?: number
  /** Caster-level steps for cantrips: [level, count] pairs, ascending (Eldritch Blast). */
  byCasterLevel?: [number, number][]
}

/** How many projectiles this cast fires. */
export function projectileCount(
  entry: { level: number; volley?: VolleySpec },
  opts: { slotLevel?: number | null; casterLevel?: number | null } = {},
): number {
  const v = entry.volley
  if (!v) return 1
  let n = v.count
  if (v.perSlotAbove && opts.slotLevel != null && opts.slotLevel > entry.level) {
    n += v.perSlotAbove * (opts.slotLevel - entry.level)
  }
  if (v.byCasterLevel && opts.casterLevel != null) {
    for (const [lvl, count] of v.byCasterLevel) if (opts.casterLevel >= lvl) n = count
  }
  return Math.max(1, n)
}

/** Who gets how many. Order is the order the targets were picked in. */
export type Allocation = { token: string; count: number }[]

export function allocated(a: Allocation): number {
  return a.reduce((s, t) => s + t.count, 0)
}

/**
 * One click on a target: one more projectile for them, while there are any
 * left to give. `delta` −1 takes one back. A target that reaches zero leaves
 * the list, so the picker's order stays the order of first choice.
 */
export function allocate(current: Allocation, token: string, total: number, delta = 1): Allocation {
  const next = current.map((t) => ({ ...t }))
  const at = next.find((t) => t.token === token)
  if (delta > 0) {
    if (allocated(next) >= total) return current
    if (at) at.count += 1
    else next.push({ token, count: 1 })
  } else if (at) {
    at.count -= 1
  }
  return next.filter((t) => t.count > 0)
}

/**
 * Where a shove ends.
 *
 * "Pushed 10 feet away from you": straight away along the line from the
 * caster, one square at a time, stopping at the first square that is not
 * free — a wall, the edge of the map, another body. A creature stopped
 * short has hit something, and `blocked` says so, which is what the caller
 * turns into a fall. (The SRD's push does not knock prone by itself; a
 * body slammed into a wall going down is Sam's ruling, flagged as such
 * where it is applied.)
 *
 * The direction is the 8-way sign of the offset, so a creature diagonally
 * off the caster is pushed diagonally: each diagonal square is one square
 * of the distance, as the board's Chebyshev movement already counts it.
 */
export function pushPath(opts: {
  from: Cell
  victim: Cell
  squares: number
  free: (c: Cell) => boolean
}): { to: Cell; moved: number; blocked: boolean; path: Cell[] } {
  const dx = Math.sign(opts.victim.x - opts.from.x)
  const dy = Math.sign(opts.victim.y - opts.from.y)
  const path: Cell[] = []
  let cur = { ...opts.victim }
  if (dx === 0 && dy === 0) return { to: cur, moved: 0, blocked: false, path }
  let moved = 0
  while (moved < opts.squares) {
    const next = { x: cur.x + dx, y: cur.y + dy }
    if (!opts.free(next)) break
    cur = next
    path.push(cur)
    moved++
  }
  return { to: cur, moved, blocked: moved < opts.squares, path }
}

/** Feet to squares, rounded down: a 10-ft push is two squares. */
export function pushSquares(feet: number): number {
  return Math.max(0, Math.floor(feet / 5))
}
