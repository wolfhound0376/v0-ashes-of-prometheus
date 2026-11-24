/**
 * THE PIXEL ROAD ON THE REAL MARCH (Sam, 2026-11-23): "Pixel road part of the real march. As we move far enough it
 * should reflect our movement on the nodal map and then fade out/in to the pixel map we are walking."
 *
 * Each leg of a march (one road edge between two markers of the nodal map) is walked on a PixelLab tile map
 * (public/pixel-road/<id>) before the nodal map moves the party along that edge. This file says WHICH tile map a leg
 * is walked on and builds the page's address. Pure; the map module does the rest.
 */
export interface RoadLeg {
  /** node_key the leg leaves */
  a: string
  /** node_key the leg reaches */
  b: string
  /** the edge's mode: only a road is walked; a sail edge is water */
  mode: string | null
}

/**
 * The stretches that are painted. road-01 (64 x 24 cells) has the Ruins built into its wall and is the Rehearsal
 * door's. road-02 (112 x 48 cells, about three and a half times the floor) is the one a march walks (Sam,
 * 2026-11-23: "make sure that the pixel map we walk is large enough for us to explore when we are traveling"):
 * a long tunnel with side caves off it, a stream grotto, a fungus cave, a pool chamber and an alcove. road-03 (112 x 44,
 * "The violet hollow") is the painted misty-violet Underdark Sam picked (2026-11-23: spire, fungus tree, glowing
 * fungus): a tunnel, a north cave, a chamber round a black lake, a south cave and an alcove.
 */
export const MARCH_ROADS: readonly PixelRoadId[] = ["road-02", "road-03"]
export const PIXEL_ROADS = ["road-01", "road-02", "road-03"] as const
export type PixelRoadId = (typeof PIXEL_ROADS)[number]

/** Which stretch a leg is walked on, or null when the leg is not walked at all (water). */
export function pixelRoadFor(leg: RoadLeg): PixelRoadId | null {
  if (leg.mode === "sail") return null
  // So marches differ, each leg has its own stretch, picked from its two ends (either direction gives the same one,
  // and the same leg is always the same stretch). Claude's rule, not the book's.
  const key = [leg.a, leg.b].sort().join("|")
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return MARCH_ROADS[h % MARCH_ROADS.length]
}

const slugs = (xs: readonly string[], max: number) => [...new Set(xs.map((s) => s.toLowerCase().replace(/[^a-z0-9-]/g, "")).filter(Boolean))].slice(0, max)

/** The road page's address for one leg. `line` is the heroes (leader first), `npcs` the companions walking with them. */
export function pixelRoadHref(o: { road: PixelRoadId; line: readonly string[]; npcs: readonly string[]; from: string; to: string }): string {
  const q = new URLSearchParams({ embed: "1", road: o.road })
  const line = slugs(o.line, 7)
  if (line.length) q.set("line", line.join(","))
  const npcs = slugs(o.npcs, 10).filter((s) => !line.includes(s))
  if (npcs.length) q.set("npcs", npcs.join(","))
  if (o.from) q.set("from", o.from.slice(0, 40))
  if (o.to) q.set("to", o.to.slice(0, 40))
  return `/pixel-road/index.html?${q.toString()}`
}

/** Per-browser switch (the DM's button under the map): on unless turned off. */
export const PIXEL_ROAD_SWITCH = "aop:map-pixel-road"

/**
 * BACK TO THE SAME SPOT AFTER A ROAD FIGHT (Sam, 2026-11-24: the fight "returns the party to the same spot on the
 * road"). A meeting halts the party part-way along a stretch. If it comes to blows the whole tab leaves for the
 * battle plate (lib/travel/battle.ts battleHref) and comes back to /map as a fresh page, which used to show only the
 * nodal map: the stretch, and where the party stood on it, were forgotten. So when the road halts the party it says
 * where (aop:road-at), the map module keeps that here for this tab, and on the way back the road is laid over the
 * map again with the party standing where it was stopped. Put away when the meeting ends without a fight, when the
 * stretch is walked to its end, or when it is too old to be this march. Nothing is saved to the game.
 */
export const ROAD_SPOT_KEY = "aop:road-spot"
/** Longer than any fight; shorter than a tab left open overnight. */
export const ROAD_SPOT_MAX_AGE_MS = 6 * 60 * 60 * 1000
export interface RoadSpot {
  /** the road page's address for the leg, as pixelRoadHref built it */
  src: string
  /** the leg: node_key left, node_key reached */
  a: string
  b: string
  /** where the leader stood, in the stretch's own pixels */
  x: number
  y: number
  /** when (ms) */
  t: number
  /** the leg's trap dice (lib/travel/road-traps.ts trapSeedKey), so the stretch comes back with the same traps */
  seed?: string
}

export function roadSpot(src: string, leg: { a: string; b: string; seed?: string }, at: { x: unknown; y: unknown }, now: number): RoadSpot | null {
  const x = Number(at.x), y = Number(at.y)
  if (!src.startsWith("/pixel-road/index.html?") || !leg.a || !leg.b || !Number.isFinite(x) || !Number.isFinite(y)) return null
  return { src, a: leg.a, b: leg.b, x: Math.round(x), y: Math.round(y), t: now, ...(typeof leg.seed === "string" && leg.seed ? { seed: leg.seed.slice(0, 120) } : {}) }
}

/** The kept spot, or null when there is none, it is not one of ours, or it is too old. */
export function parseRoadSpot(raw: string | null | undefined, now: number): RoadSpot | null {
  if (!raw) return null
  let o: Partial<RoadSpot> | null = null
  try { o = JSON.parse(raw) as Partial<RoadSpot> } catch { return null }
  if (!o || typeof o.src !== "string" || typeof o.a !== "string" || typeof o.b !== "string" || typeof o.t !== "number") return null
  if (now - o.t > ROAD_SPOT_MAX_AGE_MS || now < o.t - 60_000) return null
  return roadSpot(o.src, { a: o.a, b: o.b, seed: typeof o.seed === "string" ? o.seed : undefined }, { x: o.x, y: o.y }, o.t)
}

/**
 * The road page's address to come back to: the same leg, the party standing at the spot (`spot`), and the marker
 * ahead already asked about (`met`), so its dice are not rolled a second time.
 */
export function roadSpotHref(s: RoadSpot): string {
  const u = new URL(s.src, "http://x")
  u.searchParams.set("spot", `${s.x},${s.y}`)
  u.searchParams.set("met", "1")
  return `${u.pathname}?${u.searchParams.toString()}`
}
