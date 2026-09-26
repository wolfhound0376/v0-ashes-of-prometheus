/**
 * VELKYNVELVE NODES — the data behind one top-down sprite map.
 *
 * A node is one piece of Velkynvelve, usually 12x12 squares (the tavern platform, the
 * slave pen, ...). Everything about it lives in
 * public/velkynvelve/nodes/<slug>/node.json next to its art:
 *
 *  - `walkable`: one string per row. `o` = deck, `b` = rope bridge,
 *    `g` = a locked gate, `.` = chasm. Deck is derived from the composed
 *    Wang deck (a square is deck when at least three of its four tile
 *    corners are deck), so it matches what the eye sees. Bridges and gates
 *    come from `geometry` when a node has it (see geometry.ts).
 *  - `props`: furniture. Each blocks the rectangle of squares it covers; a
 *    brazier also carries a light.
 *  - `spawns`: who stands where when the node opens. `sprite` points at the
 *    same sprite.json manifests the 3D board uses (lib/sprite-token.ts).
 *
 * Coordinates are squares, (0,0) top-left. One square is `squarePx` source
 * pixels (32 = 5 ft).
 */

import { walkableFromGeometry, type NodeGeometry } from "./geometry"

export type Facing =
  | "south"
  | "south-east"
  | "east"
  | "north-east"
  | "north"
  | "north-west"
  | "west"
  | "south-west"

export interface NodeLight {
  /** CSS hex colour, e.g. "#b98cff". */
  color: string
  /** Radius of the light pool, in source px. */
  radius: number
  /** 0 = steady, 0.2 = a lively flame. Fraction of the radius it wobbles by. */
  flicker: number
}

export interface NodeProp {
  id: string
  /** Image file, relative to the node folder. */
  image: string
  /** Top-left square of the footprint. */
  x: number
  y: number
  /** Footprint in squares. Every square in it is blocked. */
  w: number
  h: number
  light?: NodeLight
  /** Draw scale for art made larger than its footprint. Default 1. */
  scale?: number
  /**
   * "under": hangs below the deck and bridges (cobwebs under a walkway) and
   * blocks nothing. Omitted: stands on the floor and blocks its footprint.
   */
  layer?: "under"
}

export interface NodeLabel {
  x: number
  y: number
  text: string
}

export interface NodeSpawn {
  id: string
  /** Absolute URL of a sprite.json manifest. */
  sprite: string
  x: number
  y: number
  facing: Facing
}

export interface VelkynvelveNode {
  slug: string
  name: string
  /** Squares per side. */
  squares: number
  /** Source pixels per square. */
  squarePx: number
  /**
   * Deck image, relative to the node folder. Chasm pixels are transparent.
   * Omitted when the node's floor is drawn from `geometry` instead.
   */
  deck?: string
  /**
   * Floor as shapes (octagon platforms, rope bridges at any angle, gates).
   * When present, `walkable` is computed from it on load and the scene
   * draws the shapes; see geometry.ts.
   */
  geometry?: NodeGeometry
  /** Stone texture tile for geometry platforms, relative to the node folder. */
  floorTile?: string
  walkable: string[]
  props: NodeProp[]
  spawns: NodeSpawn[]
  /**
   * A waterfall falling through the abyss, `width` squares wide from
   * column `x`, breaking into foam at each of `ledges` (rows, in squares).
   */
  waterfall?: { x: number; width: number; ledges?: number[] }
  /** Where the bridges lead, written over the abyss. */
  labels?: NodeLabel[]
  /** Set when the layout is not yet the canon cell geometry — says why. */
  approximate?: string
}

/** A node as loaded, with the folder its relative paths resolve against. */
export interface LoadedNode extends VelkynvelveNode {
  baseUrl: string
}

/** grid[y][x] — true where a figure may stand. */
export type StandableGrid = boolean[][]

/** Deck squares minus every square a prop covers. */
export function standableGrid(node: VelkynvelveNode): StandableGrid {
  const grid: StandableGrid = []
  for (let y = 0; y < node.squares; y++) {
    const row = node.walkable[y] ?? ""
    const line: boolean[] = []
    for (let x = 0; x < node.squares; x++) line.push(row[x] === "o" || row[x] === "b")
    grid.push(line)
  }
  for (const p of node.props) {
    if (p.layer === "under") continue
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x; x < p.x + p.w; x++) {
        if (grid[y] && x >= 0 && x < node.squares) grid[y][x] = false
      }
    }
  }
  return grid
}

export function nodeBaseUrl(slug: string): string {
  return `/velkynvelve/nodes/${slug}/`
}

export async function loadNode(slug: string): Promise<LoadedNode> {
  const baseUrl = nodeBaseUrl(slug)
  const res = await fetch(`${baseUrl}node.json`)
  if (!res.ok) throw new Error(`Velkynvelve node "${slug}" not found (${res.status})`)
  const node = (await res.json()) as VelkynvelveNode
  return withWalkable({ ...node, baseUrl })
}

/** Fill in `walkable` from `geometry` when the node is described by shapes. */
export function withWalkable<T extends VelkynvelveNode>(node: T): T {
  if (node.geometry) return { ...node, walkable: walkableFromGeometry(node.geometry, node.squares) }
  return node
}
