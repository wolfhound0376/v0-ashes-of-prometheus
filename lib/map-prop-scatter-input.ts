// Turning a V5 canon node tile into something `scatter()` can read.
//
// The scatter in lib/map-props.ts is pure and knows nothing about where a room
// comes from. This is the adapter: it takes the cell-geometry JSON that lives
// in Storage at `vtt-assets/node-maps/v5/node-NN.json` (linked from
// `vtt_maps.terrain.cells_url`) and produces the `ScatterMap` the scatter
// wants — floor, occupied, exits.
//
// Why this is its own file: it is the part with real decisions in it, and
// decisions want tests. The route around it is plumbing.
//
// THE THREE DECISIONS, and why each is what it is:
//
//   1. A DOOR SQUARE IS NOT FLOOR TO SCATTER ON. Doors sit ON floor cells in
//      the V5 format — node 11's gate is at [1,0], which is also in `floor`.
//      A mushroom growing in the gateway is wrong twice over: it reads as
//      scenery in a doorway, and the renderer draws the door frame through it.
//      So door squares go in `occupied`, not out of `floor`: they stay
//      walkable, they just never wear anything.
//
//   2. EXITS COME FROM THE FILE, NOT FROM THE BORDER. `protectedSquares()`
//      keeps blockers off the exit mouths and one path between each pair, and
//      it can only do that if it is told where the exits are. The V5 builder
//      already solved exit matching globally over permutations and wrote the
//      answer down; re-deriving it here from border clusters would be a second,
//      worse implementation of something already decided.
//
//   3. WATER IS FLOOR. `cells.water` is empty on every node shipped so far,
//      but the format carries it and the Darklake maps will use it. Water
//      cells are walkable (swimming, wading) and absolutely should grow
//      scenery, so they join the floor set rather than being skipped. If a
//      water cell is ALSO in `floor` it is counted once.

import type { ScatterMap } from "./map-props"

/** A square, as the node JSON writes it. */
interface NodeCell {
  sq: [number, number]
}

/** The shape this reads out of a V5 node cell-geometry file. */
export interface NodeCells {
  cells?: {
    floor?: NodeCell[]
    doors?: NodeCell[]
    water?: NodeCell[]
    walls?: NodeCell[]
  }
  exits?: Array<{ cells?: Array<[number, number]> }>
}

const key = (x: number, y: number) => `${x},${y}`

/** Pull `[x,y]` out of a cell, tolerating a malformed row rather than throwing. */
function squares(list: NodeCell[] | undefined): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const c of list ?? []) {
    const sq = c?.sq
    if (!Array.isArray(sq) || sq.length < 2) continue
    const [x, y] = sq
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue
    out.push([x, y])
  }
  return out
}

/** De-duplicate a cell list, keeping first-seen order so the result is stable. */
function unique(cells: Array<[number, number]>): Array<[number, number]> {
  const seen = new Set<string>()
  const out: Array<[number, number]> = []
  for (const [x, y] of cells) {
    const k = key(x, y)
    if (seen.has(k)) continue
    seen.add(k)
    out.push([x, y])
  }
  return out
}

export interface ScatterMapInput {
  /** Extra squares to keep clear — live tokens, usually. */
  occupied?: Array<[number, number]>
}

/**
 * Build the `ScatterMap` for one node.
 *
 * Deterministic: same file in, same arrays out, in the same order. The scatter
 * shuffles its own copy, so order here only has to be stable, not meaningful.
 */
export function scatterMapFrom(node: NodeCells, opts: ScatterMapInput = {}): ScatterMap {
  const floorCells = squares(node?.cells?.floor)
  const waterCells = squares(node?.cells?.water)
  const doorCells = squares(node?.cells?.doors)

  // Water is walkable and wants scenery (decision 3).
  const floor = unique([...floorCells, ...waterCells])
  const walkable = new Set(floor.map(([x, y]) => key(x, y)))

  // Doors are spoken for (decision 1). Caller-supplied occupied squares — the
  // tokens standing on the board — join them. Anything not actually on the
  // floor is dropped: the scatter only ever looks at floor squares, so an
  // off-map "occupied" entry is noise that would make the set harder to read.
  const occupied = unique([...doorCells, ...(opts.occupied ?? [])]).filter(([x, y]) =>
    walkable.has(key(x, y)),
  )

  // Exits as the builder recorded them (decision 2). An exit whose cells have
  // all been clipped away is dropped rather than passed through empty —
  // `protectedSquares` pairs exits up, and an empty one would pair with
  // everything and protect nothing.
  const exits: Array<Array<[number, number]>> = []
  for (const e of node?.exits ?? []) {
    const cells: Array<[number, number]> = []
    for (const c of e?.cells ?? []) {
      if (!Array.isArray(c) || c.length < 2) continue
      const [x, y] = c
      if (!Number.isInteger(x) || !Number.isInteger(y)) continue
      if (!walkable.has(key(x, y))) continue
      cells.push([x, y])
    }
    if (cells.length) exits.push(unique(cells))
  }

  return { floor, occupied, exits }
}
