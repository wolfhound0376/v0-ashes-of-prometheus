// ITEM HISTORY — where a thing came from and whose hands it passed through.
//
// Sam, 2026-11-10: "Are all of these inventory items that we are picking up unique with their own ID like the original
// plan for this game or are we just building as many as we want" — then "go with recommendation" on
// claude/Item_Identity_Design_2026-11-10.md. This is its step 1: every time the Underwalk moves an item, one row goes
// into `item_events` against the inventory row that IS the item. The table already held condition changes (camp
// repair, lib/repair.ts); these are the movement kinds beside them.
//
// BEST EFFORT, always. The move itself has already happened by the time this is called; a history line that fails to
// write must never undo or block it. Until supabase/migrations/20261110233000_item_events_movement_kinds.sql is run,
// the table's kind check refuses these kinds and every call here quietly does nothing.
//
// KNOWN GAP, closed by step 2 of the design: `item_events.inventory_item_id` cascades on delete. An item that is
// dropped whole or used up has its row deleted today, and its history goes with it.

export const MOVEMENT_KINDS = ["acquire", "pickup", "give", "drop", "consume"] as const
export type MovementKind = (typeof MOVEMENT_KINDS)[number]
export const isMovementKind = (k: string): k is MovementKind => (MOVEMENT_KINDS as readonly string[]).includes(k)

export type ItemMove = {
  inventoryItemId: string | null | undefined
  /** whose pack the row is in AFTER the move (for a drop or a use: who did it) */
  characterId: string | null | undefined
  kind: MovementKind
  /** free detail: where it came from, who gave it, how many. Kept small; the DM reads it. */
  detail?: Record<string, unknown>
}

/** The row to insert, or null when there is nothing to hang the event on. Pure, so it can be tested. */
export function itemEventRow(m: ItemMove): { inventory_item_id: string; character_id: string | null; kind: MovementKind; detail: Record<string, unknown> } | null {
  if (!m.inventoryItemId || !isMovementKind(m.kind)) return null
  const detail: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(m.detail ?? {})) if (v !== undefined && v !== null && v !== "") detail[k] = v
  return { inventory_item_id: m.inventoryItemId, character_id: m.characterId || null, kind: m.kind, detail }
}

type Db = { from: (t: string) => any }   // eslint-disable-line @typescript-eslint/no-explicit-any

/** Write one history line. Never throws, never reports failure to the caller's player. */
export async function recordItemMove(db: Db, m: ItemMove): Promise<void> {
  const row = itemEventRow(m)
  if (!row) return
  try { await db.from("item_events").insert(row) } catch { /* history is a record, not a gate */ }
}
