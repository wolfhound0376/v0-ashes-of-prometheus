// lib/travel/handoff.ts — a way out of Velkynvelve hands the party to the travel map.
//
// Sam's editor export (2026-10-24) names, for every exit that leaves the outpost, the cavern plate it
// comes out on: the tunnels, the wastes under the lift, the Darklake shore down the river, and so on
// (scripts/velkynvelve-walk/spec.py CAVERNS). None of those plates is painted or walkable in this repo
// yet, so the walk page does not try to walk them. It sends the party to /map with the way out in the
// query string, and this file reads that on the map side.
//
// `biome` is the camp plate that stands in for each cavern today (lib/camp-plates.ts). The wastes, the
// lair and the crystal passage have no plate of their own, so they fall to the tunnels — the same rule
// campBiomeFor applies to anything it does not recognise. Nothing here invents a plate.

import { CAMP_PLATES, type CampBiome } from "@/lib/camp-plates"

export type WalkHandoffKey = "tunnels" | "wastes" | "shore" | "lair" | "grove" | "crystal"

export interface WalkHandoff {
  /** The cavern as the walk names it. */
  name: string
  /** The camp plate that stands in for it today. */
  biome: CampBiome
  /** Whether the way out is still Claude's draw from the guide, unreviewed by Sam. */
  proposed: boolean
  /**
   * THE NODAL SIDE (Sam, 2026-10-24: "wire the nodal map to the different 'leave the map' options").
   * The `travel_nodes.node_key`s this cavern comes out onto. The map keeps only those that an edge in
   * `travel_edges` actually joins to the place the party left, so a key listed here that has no edge in
   * the data is simply not offered — the data decides, never this list alone. Empty means the cavern
   * leads to no road the map knows yet (the lair, the grove and the crystal passage are caverns beyond
   * caverns in Sam's export, not ways off the outpost).
   */
  roads: readonly string[]
}

/**
 * Mirrors spec.py CAVERNS: name and biome per key. Keep the two in step by hand.
 *
 * Roads are SAM'S PICKS, made on the Velkynvelve Exit Picker (2026-10-24, read back from its `picks` store) — one
 * list per cavern whose outward exit (a `leave` zone with no plate in `to`) steps the party onto the Underdark map:
 *   wastes  "Tunnel to the Oozing Temple"  → road-10
 *   lair    "Hook Horror Layer"            → road-21
 *   shore   "Traverse the Darklake"        → cliff-pool (the Glowing pool)
 *   grove   "New exit"                     → road-09
 *   tunnels "On west to the Darklake"      → road-07, road-10 (that zone walks onto the shore plate today, so this list
 *                                             waits for an outward exit on the tunnels plate)
 *   crystal — nothing picked.
 * The lift is not a way off the map (Sam: it goes down to the pool plate, area 14), so it has no entry here.
 * A pick with no edge in `travel_edges` from the party's node is not offered until the edge exists (see roadsOpenedBy).
 */
export const WALK_HANDOFFS: Readonly<Record<WalkHandoffKey, WalkHandoff>> = {
  tunnels: { name: "The tunnels", biome: "tunnels", proposed: true, roads: ["road-07", "road-10"] },
  wastes: { name: "The wastes", biome: "tunnels", proposed: true, roads: ["road-10"] },
  shore: { name: "The Darklake shore", biome: "shore", proposed: true, roads: ["cliff-pool"] },
  lair: { name: "The lair", biome: "tunnels", proposed: true, roads: ["road-21"] },
  grove: { name: "The grove", biome: "fungal", proposed: false, roads: ["road-09"] },
  crystal: { name: "The crystal passage", biome: "tunnels", proposed: false, roads: [] },
}

export interface WalkArrival {
  /** The place the party walked out of. Only "velkynvelve" today. */
  from: string
  via: WalkHandoffKey
  name: string
  biome: CampBiome
  /** The plate URL the map can show behind the arrival note. */
  plate: string
  /** The travel nodes this way out may come onto, before the map checks them against its edges. */
  roads: readonly string[]
}

/** The least the map needs to know about a node or an edge to pick the roads a way out opens. */
export interface RoadNode {
  id: string
  node_key: string
  metadata?: { map_x?: unknown; map_y?: unknown } | null
}
export interface RoadEdge {
  from_node_id: string
  to_node_id: string
}

/** A road the party may take off the plate: the node, and which way it lies from where they stand. */
export interface RoadChoice {
  node: RoadNode
  /** Eight-point compass word from the party's node by map pixels, so the choice needs no invented place-name. */
  heading: Heading
}
export type Heading = "north" | "north-east" | "east" | "south-east" | "south" | "south-west" | "west" | "north-west"
const HEADINGS: readonly Heading[] = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"]

/**
 * Where `to` lies from `at`, by the map's pixel axes (y grows downward), on eight points. Four would do
 * for one road, but Velkynvelve's two both leave to the south and only "south-west" / "south-east"
 * tells them apart.
 */
export function headingBetween(at: { map_x: number; map_y: number }, to: { map_x: number; map_y: number }): Heading {
  const a = Math.atan2(to.map_y - at.map_y, to.map_x - at.map_x) // 0 = east, +pi/2 = south
  const slot = Math.round((a < 0 ? a + Math.PI * 2 : a) / (Math.PI / 4)) % 8
  return HEADINGS[slot]
}

/**
 * The roads a hand-off opens from the node the party stands on: the arrival's `roads` that exist in
 * `nodes` AND share an edge with `here`, in the order the hand-off lists them. Anything else is dropped
 * without comment — a road the data does not join to this place is not a road the party can take.
 */
export function roadsOpenedBy(arrival: WalkArrival, here: RoadNode, nodes: readonly RoadNode[], edges: readonly RoadEdge[]): RoadChoice[] {
  const xy = (n: RoadNode) =>
    n.metadata && typeof n.metadata.map_x === "number" && typeof n.metadata.map_y === "number"
      ? { map_x: n.metadata.map_x, map_y: n.metadata.map_y }
      : null
  const at = xy(here)
  const out: RoadChoice[] = []
  for (const key of arrival.roads) {
    const node = nodes.find((n) => n.node_key === key)
    if (!node) continue
    const joined = edges.some(
      (e) => (e.from_node_id === here.id && e.to_node_id === node.id) || (e.from_node_id === node.id && e.to_node_id === here.id),
    )
    if (!joined) continue
    const to = xy(node)
    out.push({ node, heading: at && to ? headingBetween(at, to) : "south" })
  }
  return out
}

const isKey = (v: string | null): v is WalkHandoffKey => !!v && v in WALK_HANDOFFS

/** The link the walk page follows when the party leaves. The page builds the same string by hand (template.html leaveVelkynvelve). */
export function walkHandoffHref(via: WalkHandoffKey, from = "velkynvelve"): string {
  const h = WALK_HANDOFFS[via]
  return `/map?from=${encodeURIComponent(from)}&via=${encodeURIComponent(via)}&plate=${encodeURIComponent(h.biome)}`
}

/**
 * Reads a hand-off out of the map page's query string, or null when the party did not just walk out of
 * anywhere. An unknown `via` is ignored rather than guessed; an explicit `plate` wins over the key's own
 * biome only when it names a real camp plate, the same way campBiome treats ?plate=.
 */
export function parseWalkHandoff(search: string | URLSearchParams): WalkArrival | null {
  const q = typeof search === "string" ? new URLSearchParams(search) : search
  const via = q.get("via")
  if (!isKey(via)) return null
  const h = WALK_HANDOFFS[via]
  const plate = q.get("plate")
  const biome: CampBiome = plate && plate in CAMP_PLATES ? (plate as CampBiome) : h.biome
  return { from: q.get("from") || "velkynvelve", via, name: h.name, biome, plate: CAMP_PLATES[biome], roads: h.roads }
}
