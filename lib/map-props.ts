// Scenery on the floor: which prop lands on which square.
//
// The library itself is 191 pixel-art props in `map_props` — fungi, rubble,
// corpses, stalagmites, cages, bridges, a temple — each carrying the facts
// this file needs: which biomes it belongs to, how big it is, whether a
// creature can walk through it, and how often it should turn up. The art
// lives at `vtt-assets/props/<slug>.png`. See docs `claude_Map_Prop_Library`.
//
// Two ways a prop reaches a square, and they must not be confused:
//
//   HAND-PLACED   the DM (or canon) puts it there. Nothing here decides it.
//   SCATTERED     this file decides it, from the node's biome and a seed.
//
// `scatter` is pure and seeded. The same map, the same seed and the same
// catalog give the same floor, every reload, on every seat at the table —
// which is the only reason a scatter can be persisted as rows rather than
// re-rolled per client and drawn four different ways.
//
// THE RULE THAT MATTERS MOST: a prop that blocks movement may never land on
// a square that the party needs in order to cross the room. The V5 node maps
// are built around registered exits, and the hysteresis classifier in
// `build_nodes_v5.py` exists precisely because a severed route is the one
// map bug nobody notices until a session stalls on it. A random stalagmite
// that walls off node 8's only northern exit would do the same damage. So
// blockers are kept off every exit-to-exit shortest path, and off the exit
// mouths themselves.
//
// Traps are not scattered at all. Every trap row ships `spawn_weight: 0`, so
// the weighted draw below can never pick one: a trap appears where the DM or
// an encounter table put it, and nowhere else.

/** `() => number` in [0,1), as the rest of the engine spells it. */
export type Rng = () => number

export type RenderClass = "decal" | "billboard" | "overhead"

/** One row of `map_props`, narrowed to what placement actually reads. */
export interface MapProp {
  slug: string
  render_class: RenderClass
  /** Footprint in 5-ft squares. Most props are 1x1. */
  footprint_w: number
  footprint_h: number
  /** velkynvelve | cave | fungal_forest | drow_outpost | quarry | graveyard | ruins | water | camp | dungeon | surface */
  biomes: string[]
  blocks_movement: boolean
  difficult_terrain: boolean
  /** 0 means never scattered — hand-placed only. Traps and big structures. */
  spawn_weight: number
  /** Cap for one map, if the prop would look silly repeated. */
  max_per_map?: number | null
  /** Minimum Chebyshev distance between two of the SAME prop, in squares. */
  min_spacing?: number | null
}

export interface PropPlacement {
  prop_slug: string
  grid_x: number
  grid_y: number
  rotation: 0 | 90 | 180 | 270
  flip_x: boolean
  placed_by: "random"
  seed: number
}

export interface ScatterMap {
  /** Every walkable square, floor and difficult alike. */
  floor: Array<[number, number]>
  /** Squares already spoken for: tokens, doors, canon props. Never scattered on. */
  occupied?: Array<[number, number]>
  /** Registered exits, as cell lists. Blockers stay off these and the paths between them. */
  exits?: Array<Array<[number, number]>>
}

/** `x,y` — the key every set and map in here is keyed by. */
const k = (x: number, y: number) => `${x},${y}`

/**
 * Mulberry32. Small, fast, and — the point — identical in every browser, so
 * a seed persisted with the placement redraws the same floor tomorrow.
 */
export function rngFrom(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic 32-bit seed from a string, so a node slug gives a floor. */
export function seedFrom(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Props this biome can grow, still in the random draw. */
export function eligible(props: MapProp[], biome: string): MapProp[] {
  return props.filter((p) => p.spawn_weight > 0 && p.biomes.includes(biome))
}

/**
 * Every square a creature must be able to stand on for the room to work:
 * the exit mouths, plus one shortest path between each pair of exits.
 *
 * Not the whole walkable set and not a corridor — just enough that a blocker
 * can never sever the room. Props may still crowd a route; they may not
 * close it.
 */
export function protectedSquares(map: ScatterMap): Set<string> {
  const keep = new Set<string>()
  const exits = map.exits ?? []
  for (const cells of exits) for (const [x, y] of cells) keep.add(k(x, y))
  if (exits.length < 2) return keep

  const walk = new Set(map.floor.map(([x, y]) => k(x, y)))
  for (let i = 0; i < exits.length; i++) {
    for (let j = i + 1; j < exits.length; j++) {
      const path = shortestPath(walk, exits[i], exits[j])
      for (const key of path) keep.add(key)
    }
  }
  return keep
}

/**
 * Breadth-first from one exit cluster to another, 4-connected, over walkable
 * squares. Returns the squares on one shortest path, or nothing when the two
 * are already unreachable (a map that was born severed is not ours to fix —
 * the importer reports unmatched exits rather than inventing them).
 */
function shortestPath(walk: Set<string>, from: Array<[number, number]>, to: Array<[number, number]>): string[] {
  const goal = new Set(to.map(([x, y]) => k(x, y)))
  const prev = new Map<string, string | null>()
  const q: Array<[number, number]> = []
  for (const [x, y] of from) {
    const key = k(x, y)
    if (!walk.has(key)) continue
    prev.set(key, null)
    q.push([x, y])
  }
  let head = 0
  while (head < q.length) {
    const [x, y] = q[head++]
    const key = k(x, y)
    if (goal.has(key)) {
      const path: string[] = []
      let cur: string | null = key
      while (cur) {
        path.push(cur)
        cur = prev.get(cur) ?? null
      }
      return path
    }
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Array<[number, number]>) {
      const nk = k(nx, ny)
      if (!walk.has(nk) || prev.has(nk)) continue
      prev.set(nk, key)
      q.push([nx, ny])
    }
  }
  return []
}

/** Chebyshev distance — a square's neighbours are the eight around it. */
const cheb = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by))

/** Weighted pick without replacement bias; returns an index into `items`. */
function pickWeighted<T extends { spawn_weight: number }>(items: T[], rng: Rng): T | null {
  const total = items.reduce((s, i) => s + i.spawn_weight, 0)
  if (total <= 0) return null
  let r = rng() * total
  for (const i of items) {
    r -= i.spawn_weight
    if (r <= 0) return i
  }
  return items[items.length - 1] ?? null
}

export interface ScatterOptions {
  /** Fraction of walkable squares that end up wearing something. */
  density?: number
  /** Hard ceiling, whatever the density works out to. */
  limit?: number
}

/**
 * Decide the scenery for one map.
 *
 * Pure: give it the same catalog, map, biome and seed and it returns the same
 * placements in the same order. The caller persists them with the seed, so a
 * re-roll is a deliberate act and a reload is not.
 */
export function scatter(
  props: MapProp[],
  map: ScatterMap,
  biome: string,
  seed: number,
  opts: ScatterOptions = {},
): PropPlacement[] {
  const pool = eligible(props, biome)
  if (pool.length === 0 || map.floor.length === 0) return []

  const rng = rngFrom(seed)
  const density = opts.density ?? 0.18
  const target = Math.min(
    opts.limit ?? Number.POSITIVE_INFINITY,
    Math.max(0, Math.floor(map.floor.length * density)),
  )
  if (target === 0) return []

  const walk = new Set(map.floor.map(([x, y]) => k(x, y)))
  const taken = new Set<string>((map.occupied ?? []).map(([x, y]) => k(x, y)))
  const keep = protectedSquares(map)

  // Shuffle the floor once, then walk it. Sampling squares in a fixed shuffled
  // order (rather than drawing a random square each time) keeps the whole thing
  // O(n) and stops a nearly-full map from spinning on collisions.
  const order = map.floor.slice()
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  const out: PropPlacement[] = []
  const countBySlug = new Map<string, number>()
  const placedBySlug = new Map<string, Array<[number, number]>>()

  for (const [x, y] of order) {
    if (out.length >= target) break
    const key = k(x, y)
    if (taken.has(key)) continue

    const prop = pickWeighted(pool, rng)
    if (!prop) break

    const n = countBySlug.get(prop.slug) ?? 0
    if (prop.max_per_map != null && n >= prop.max_per_map) continue

    // A blocker may not stand on the room's own routes.
    if (prop.blocks_movement && keep.has(key)) continue

    // Multi-square props need every square of their footprint free, walkable,
    // and — if they block — clear of the protected routes too.
    const cells = footprint(x, y, prop)
    let fits = true
    for (const [cx, cy] of cells) {
      const ck = k(cx, cy)
      if (!walk.has(ck) || taken.has(ck)) { fits = false; break }
      if (prop.blocks_movement && keep.has(ck)) { fits = false; break }
    }
    if (!fits) continue

    // Keep two of the same thing apart, so a scatter reads as scenery rather
    // than as a tiled texture.
    const spacing = prop.min_spacing ?? 0
    if (spacing > 0) {
      const mine = placedBySlug.get(prop.slug) ?? []
      if (mine.some(([px, py]) => cheb(px, py, x, y) < spacing)) continue
    }

    for (const [cx, cy] of cells) taken.add(k(cx, cy))
    countBySlug.set(prop.slug, n + 1)
    placedBySlug.set(prop.slug, [...(placedBySlug.get(prop.slug) ?? []), [x, y]])

    out.push({
      prop_slug: prop.slug,
      grid_x: x,
      grid_y: y,
      // A decal may lie any way up; a standing thing keeps its feet under it
      // and is only ever mirrored, because a stalagmite rotated 90 degrees is
      // a stalagmite lying down.
      rotation: prop.render_class === "decal" ? (([0, 90, 180, 270] as const)[Math.floor(rng() * 4)]) : 0,
      flip_x: rng() < 0.5,
      placed_by: "random",
      seed,
    })
  }

  return out
}

/** Every square a prop covers, anchored at its top-left. */
export function footprint(x: number, y: number, p: Pick<MapProp, "footprint_w" | "footprint_h">): Array<[number, number]> {
  const cells: Array<[number, number]> = []
  for (let dx = 0; dx < Math.max(1, p.footprint_w); dx++) {
    for (let dy = 0; dy < Math.max(1, p.footprint_h); dy++) cells.push([x + dx, y + dy])
  }
  return cells
}

/**
 * Squares a scattered prop makes impassable, for the movement overlay to add
 * to its own blocked set. Difficult terrain is NOT returned here: the board
 * reads that from `cells.difficult`, and a prop that only slows you down is
 * the map's business, not the pathfinder's wall list.
 */
export function blockedBy(placements: PropPlacement[], props: MapProp[]): Array<[number, number]> {
  const bySlug = new Map(props.map((p) => [p.slug, p]))
  const out: Array<[number, number]> = []
  for (const pl of placements) {
    const p = bySlug.get(pl.prop_slug)
    if (!p?.blocks_movement) continue
    out.push(...footprint(pl.grid_x, pl.grid_y, p))
  }
  return out
}

/** Squares a scattered prop turns into difficult terrain. */
export function difficultBy(placements: PropPlacement[], props: MapProp[]): Array<[number, number]> {
  const bySlug = new Map(props.map((p) => [p.slug, p]))
  const out: Array<[number, number]> = []
  for (const pl of placements) {
    const p = bySlug.get(pl.prop_slug)
    if (!p?.difficult_terrain) continue
    out.push(...footprint(pl.grid_x, pl.grid_y, p))
  }
  return out
}

/** Public URL for a prop's art, given the project's storage base. */
export const propArtUrl = (base: string, slug: string) =>
  `${base.replace(/\/$/, "")}/props/${slug}.png`
