// lib/travel/entrance.ts — a great place opens its entrance.
//
// Sam's scope (2026-10-14): "A great place opens its entrance (the stage grow into
// the painted entrance plate, then its rooms where they exist)."
//
// The eight painted entrance plates were approved on 2026-10-11/12 and live in the
// public bucket at `vtt-assets/scenes/entrance/<slug>.jpg`. The slug is the node's
// own key for seven of the eight; the Shrine of Ibrandul sits on a road node
// (`road-05`), so its node carries `metadata.entrance_plate` to say which plate is
// its own. An explicit key always wins over the derived one.
//
// A node with no plate has no entrance: arriving there is an ordinary stop. Nothing
// here invents a plate URL for a place that was never painted.

/** Where the approved plates live. */
export const ENTRANCE_BASE = "/storage/v1/object/public/vtt-assets/scenes/entrance"

/** The eight places with an approved, painted entrance plate (2026-10-11/12). */
export const PAINTED_ENTRANCES: readonly string[] = [
  "velkynvelve",
  "gracklstugh",
  "sloobludop",
  "blingdenstone",
  "neverlight-grove",
  "menzoberranzan",
  "shrine-of-ibrandul",
  "vitrine-grove",
]

/** Places the party can actually walk into, beyond the plate. Keyed by plate slug. */
export const WALKABLE_SCENES: Readonly<Record<string, string>> = {
  velkynvelve: "/velkynvelve",
}

export interface EntranceNode {
  node_key: string
  name: string | null
  node_type: string
  metadata: Record<string, unknown> | null
}

export interface Entrance {
  /** The plate's slug, which is also its file name. */
  slug: string
  /** Full public URL of the painted plate. */
  plate: string
  /** The place's name, for the title over the plate. */
  name: string
  /** Where "Enter" leads, or null when the plate is as far as the party can go today. */
  scene: string | null
}

/**
 * The entrance for a node, or null when it has none.
 *
 * `supabaseUrl` is the project URL; the caller passes it so this stays pure and
 * testable. Only `location` nodes have entrances — a waypoint is a stone on the
 * road, not a place.
 */
export function entranceFor(node: EntranceNode, supabaseUrl: string): Entrance | null {
  if (node.node_type !== "location") return null
  const explicit = typeof node.metadata?.entrance_plate === "string" ? (node.metadata.entrance_plate as string).trim() : ""
  const slug = explicit || node.node_key
  if (!PAINTED_ENTRANCES.includes(slug)) return null
  return {
    slug,
    plate: `${supabaseUrl.replace(/\/+$/, "")}${ENTRANCE_BASE}/${slug}.jpg`,
    name: node.name ?? slug,
    scene: WALKABLE_SCENES[slug] ?? null,
  }
}
