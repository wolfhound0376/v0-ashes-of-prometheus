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
 * a long tunnel with side caves off it, a stream grotto, a fungus cave, a pool chamber and an alcove.
 */
export const PIXEL_ROADS = ["road-01", "road-02"] as const
export type PixelRoadId = (typeof PIXEL_ROADS)[number]

/** Which stretch a leg is walked on, or null when the leg is not walked at all (water). */
export function pixelRoadFor(leg: RoadLeg): PixelRoadId | null {
  if (leg.mode === "sail") return null
  return "road-02"
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
