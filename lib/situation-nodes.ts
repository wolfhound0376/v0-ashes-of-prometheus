// The walk's plate → the node map's node.
//
// Two tables describe where the party is inside a place, kept by two different hands. `party_situation`
// is the walk's own account (plate, stance, gate, ward), written from a player's browser.
// `subnodal_party_position` is the DM's node map, moved only by `dm_move_party_subnodal`, and it is what
// party_location_label(), the NPC window's backdrop and the camp verdict all read. Until 2026-10-25 nothing
// joined them, so the party could stand in the guard tower while every one of those still said "Slave Pen".
//
// Sam, 2026-10-25: "Have the situation route do the subnodal move itself, server-side, whenever a walk patch
// carries a plate: look up the node by number on the velkynvelve-nodes map and update the position row with
// the service role. Leave the caverns alone. Do not touch fog, so the DM's 'what can they see' stays the DM's."
//
// This file is the pure half: which node a plate slug names. The route does the lookups and the write.

/**
 * The node number a walk plate stands on, or null when the plate is not on the node map.
 *
 *   node-11-slave-pen            → 11
 *   node-10b-guard-tower-lower   → 10   the lower chamber and the armory are the same stalactite as area 10;
 *   node-10c-guard-tower-armory  → 10   the node map resolves the tower as one node, and the finer plate
 *                                       stays on record in party_situation.sub_location
 *   biome-tunnels, biome-shore…  → null the caverns are not on the node map (Sam: leave them alone)
 */
export function plateToNodeNumber(slug: string | null | undefined): number | null {
  if (typeof slug !== "string") return null
  const m = /^node-(\d{1,3})[a-z]?(?:-|$)/i.exec(slug.trim())
  if (!m) return null
  const n = Number(m[1])
  return Number.isInteger(n) && n > 0 ? n : null
}
