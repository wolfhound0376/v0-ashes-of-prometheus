// THE RUINS DOOR OPENS ONLY FROM THE ROAD (Sam, 2026-11-23: "why did I start the game here and not the pen??").
//
// The walk page's Ruins door (?ruins=1, scripts/velkynvelve-walk/template.html ruinsDoor) walks the whole party into
// the six painted rooms. It used to do that from anywhere: a fresh campaign's party, still chained in the slave pen,
// was moved into the Ruins by one screen opening that address, and the next player to Continue woke up there.
// The Ruins are on the march (the travel map's Ruins card, the pixel road's door), so the door is shut while the
// party's place on the travel map is still the outpost itself. app/api/party/position answers; the page decides.

/** The travel node the party stands on until it marches out of Velkynvelve (travel_nodes.node_key). */
export const OUTPOST_NODE = "velkynvelve"

/** Is the party still in the outpost, by its travel-map node? Unknown is not "in": the door does not guess. */
export function partyInOutpost(nodeKey: string | null | undefined): boolean {
  return typeof nodeKey === "string" && nodeKey.trim().toLowerCase() === OUTPOST_NODE
}
