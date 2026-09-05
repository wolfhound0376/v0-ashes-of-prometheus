// Items on the floor.
//
// Sam: "We need a way to be able to pick up items (to put in inventory,
// throw, interact with) on our player UI."
//
// A ground item is a catalogue item lying on one square of one map
// (vtt_ground_items). This file is the pure half: the row shape the board
// and the route both read, the reach test, and the rule for what picking a
// thing up costs on your turn. No I/O, so the route and a test can both call
// it and the board cannot be offered a pickup the server will refuse.

export interface GroundItemRow {
  id: string
  map_id: string
  item_id: string
  name: string
  quantity: number
  grid_x: number
  grid_y: number
  dropped_by?: string | null
  picked_up_by?: string | null
  picked_up_at?: string | null
}

/** Anything the wire hands back, tidied into rows the board can draw. */
export function normaliseGroundItems(raw: unknown): GroundItemRow[] {
  if (!Array.isArray(raw)) return []
  const out: GroundItemRow[] = []
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r.id !== "string" || typeof r.name !== "string") continue
    if (r.picked_up_at) continue
    const x = Number(r.grid_x)
    const y = Number(r.grid_y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    out.push({
      id: r.id,
      map_id: String(r.map_id ?? ""),
      item_id: String(r.item_id ?? ""),
      name: r.name,
      quantity: Math.max(1, Number(r.quantity ?? 1) || 1),
      grid_x: x,
      grid_y: y,
      dropped_by: (r.dropped_by as string | null) ?? null,
      picked_up_by: null,
      picked_up_at: null,
    })
  }
  return out
}

/**
 * Within arm's reach: the same square, or any of the eight around it. Five
 * feet on this board is one square in any direction, diagonals included,
 * which is how the movement rules already count.
 */
export function withinReach(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1
}

/** The half of turn_state this rule reads and writes. */
export interface InteractionEconomy {
  action?: boolean
  /** The free object interaction, already used this turn. */
  interacted?: boolean
}

export type InteractionVerdict =
  | { ok: true; cost: "free" | "action"; next: InteractionEconomy }
  | { ok: false; reason: string }

/**
 * WHAT EACH HANDLING OF A THING COSTS.
 *
 * Sam's ruling, and it is his table: "picking up doesn't cost anything.
 * equipping or throwing does."
 *
 * The SRD is stricter — one free object interaction per turn, a second one
 * costs the Use an Object action — and this used to enforce that. In play it
 * spent a rogue's whole action on bending down, which made the floor
 * something to avoid rather than something to use. A ruling that gets the
 * table reaching for scenery is worth more than the letter here.
 *
 * DRAWING a weapon is still the free interaction the book says it is, and
 * throwing is a genuine action, so the economy still means something.
 */
export type Handling = "pickup" | "equip" | "throw" | "drop"

export function handlingCost(what: Handling): "none" | "free" | "action" {
  switch (what) {
    // Free, and not even the free interaction. Bending down is not a turn.
    case "pickup": return "none"
    case "drop":   return "none"
    // "These do take an action though" - Sam, on the paper doll.
    case "equip":  return "free"
    case "throw":  return "action"
  }
}

/**
 * What picking something up costs, SRD 5.1 "Interacting with Objects Around
 * You": one free object interaction on your turn, as part of your move or
 * your action; a second one is the Use an Object action. So the first pickup
 * is free, the second spends the action, and with both gone there is nothing
 * left to reach with.
 *
 * Out of combat there is no turn and no economy; the caller does not ask.
 */
export function interactionCost(econ: InteractionEconomy, what: string): InteractionVerdict {
  if (!econ.interacted) {
    return { ok: true, cost: "free", next: { ...econ, interacted: true } }
  }
  if (!econ.action) {
    return { ok: true, cost: "action", next: { ...econ, action: true, interacted: true } }
  }
  return { ok: false, reason: `Nothing left this turn to reach for ${what} with — the free interaction and the action are both spent.` }
}

/** "an Obsidian Shard", "3 Arrows". For the log line. */
export function describePile(name: string, quantity: number): string {
  if (quantity > 1) return `${quantity} ${name}`
  return /^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`
}
