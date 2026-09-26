/**
 * WALKING ON A VELKYNVELVE NODE.
 *
 * Squares are too coarse to walk on: a figure stepping square to square moves
 * like a chess piece. So the search runs on a finer grid — every square split
 * into SUB x SUB cells (8 source px each) — then the zig-zag it finds is
 * pulled taut into a few straight legs.
 *
 *  - A* over sub-cells, eight directions. A diagonal step is only allowed when
 *    both orthogonal cells beside it are open, so nobody squeezes between two
 *    touching table corners.
 *  - A cell is open when a body of radius `radius` centred on it stands
 *    entirely on standable squares — figures keep their feet off the edge.
 *  - String-pulling: from each waypoint, jump to the farthest later waypoint
 *    whose straight line is clear for the whole body width, not just the
 *    centre line.
 *
 * Everything in and out is in source pixels. Pure — no Phaser, no DOM.
 */
import type { StandableGrid } from "./node"

export const SUB = 4

export interface Point {
  x: number
  y: number
}

export interface PathOptions {
  /** Source px per square. */
  squarePx: number
  /** Half the body width, source px. */
  radius?: number
}

const DEFAULT_RADIUS = 5

function standableAt(grid: StandableGrid, squarePx: number, x: number, y: number): boolean {
  const sx = Math.floor(x / squarePx)
  const sy = Math.floor(y / squarePx)
  return grid[sy]?.[sx] === true
}

/** Does a body of radius r centred on (x, y) stand entirely on standable squares? */
function bodyFits(grid: StandableGrid, squarePx: number, x: number, y: number, r: number): boolean {
  // Corners of the body's box, nudged inward by a hair so a body exactly
  // touching a square's edge does not count as standing on the next one.
  const e = r - 0.001
  return (
    standableAt(grid, squarePx, x - e, y - e) &&
    standableAt(grid, squarePx, x + e, y - e) &&
    standableAt(grid, squarePx, x - e, y + e) &&
    standableAt(grid, squarePx, x + e, y + e)
  )
}

/** Is the straight segment a→b clear for the whole body width? */
export function lineClear(
  grid: StandableGrid,
  squarePx: number,
  a: Point,
  b: Point,
  r: number = DEFAULT_RADIUS,
): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const steps = Math.max(1, Math.ceil(len / 2))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (!bodyFits(grid, squarePx, a.x + dx * t, a.y + dy * t, r)) return false
  }
  return true
}

const NEIGHBOURS: Array<[number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
]

/**
 * Waypoints from `from` to `to`, in source px, excluding the start. The last
 * waypoint is `to` itself. Returns [] when already there, null when `to` is
 * off the deck, inside a prop, or cut off.
 */
export function findPath(grid: StandableGrid, from: Point, to: Point, opts: PathOptions): Point[] | null {
  const { squarePx } = opts
  const r = opts.radius ?? DEFAULT_RADIUS
  const cellPx = squarePx / SUB
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const W = cols * SUB
  const H = rows * SUB

  if (!bodyFits(grid, squarePx, to.x, to.y, r)) return null
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.5) return []
  if (lineClear(grid, squarePx, from, to, r)) return [{ x: to.x, y: to.y }]

  const open = new Uint8Array(W * H)
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      open[cy * W + cx] = bodyFits(grid, squarePx, (cx + 0.5) * cellPx, (cy + 0.5) * cellPx, r) ? 1 : 0
    }
  }
  const cellOf = (p: Point) => ({
    cx: Math.min(W - 1, Math.max(0, Math.floor(p.x / cellPx))),
    cy: Math.min(H - 1, Math.max(0, Math.floor(p.y / cellPx))),
  })
  const start = cellOf(from)
  const goal = cellOf(to)
  // The figure may stand slightly off the cell lattice; let it start anywhere.
  open[start.cy * W + start.cx] = 1
  if (!open[goal.cy * W + goal.cx]) return null

  const startI = start.cy * W + start.cx
  const goalI = goal.cy * W + goal.cx
  const g = new Float64Array(W * H).fill(Infinity)
  const came = new Int32Array(W * H).fill(-1)
  const closed = new Uint8Array(W * H)
  const h = (i: number) => {
    const dx = Math.abs((i % W) - goal.cx)
    const dy = Math.abs(Math.floor(i / W) - goal.cy)
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)
  }
  // Small binary heap of [f, index].
  const heap: Array<[number, number]> = []
  const push = (f: number, i: number) => {
    heap.push([f, i])
    let k = heap.length - 1
    while (k > 0) {
      const p = (k - 1) >> 1
      if (heap[p][0] <= heap[k][0]) break
      ;[heap[p], heap[k]] = [heap[k], heap[p]]
      k = p
    }
  }
  const pop = (): [number, number] => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let k = 0
      for (;;) {
        const l = 2 * k + 1
        const rr = l + 1
        let m = k
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (rr < heap.length && heap[rr][0] < heap[m][0]) m = rr
        if (m === k) break
        ;[heap[m], heap[k]] = [heap[k], heap[m]]
        k = m
      }
    }
    return top
  }

  g[startI] = 0
  push(h(startI), startI)
  let found = false
  while (heap.length > 0) {
    const [, i] = pop()
    if (closed[i]) continue
    if (i === goalI) {
      found = true
      break
    }
    closed[i] = 1
    const cx = i % W
    const cy = Math.floor(i / W)
    for (const [dx, dy, cost] of NEIGHBOURS) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const ni = ny * W + nx
      if (!open[ni] || closed[ni]) continue
      if (dx !== 0 && dy !== 0 && (!open[cy * W + nx] || !open[ny * W + cx])) continue
      const ng = g[i] + cost
      if (ng < g[ni]) {
        g[ni] = ng
        came[ni] = i
        push(ng + h(ni), ni)
      }
    }
  }
  if (!found) return null

  const cells: Point[] = []
  for (let i = goalI; i !== -1; i = came[i]) {
    cells.push({ x: ((i % W) + 0.5) * cellPx, y: (Math.floor(i / W) + 0.5) * cellPx })
  }
  cells.reverse()
  // Replace the lattice ends with the real start and target.
  cells[0] = { x: from.x, y: from.y }
  cells[cells.length - 1] = { x: to.x, y: to.y }

  // String-pull.
  const out: Point[] = []
  let a = 0
  while (a < cells.length - 1) {
    let b = cells.length - 1
    while (b > a + 1 && !lineClear(grid, squarePx, cells[a], cells[b], r)) b--
    out.push(cells[b])
    a = b
  }
  return out
}
