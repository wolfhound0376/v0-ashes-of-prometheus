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

// THE ONE LINE A PLAYER SEES (Item_Identity_Design, step 5; Sam's ruling 5: "Players see a one-line provenance; the DM
// sees the full trail"). Built from the movement lines above, oldest first. Nothing is invented: a thing with no
// history (starting rags, the journal) gets no line.

export type HistoryLine = { kind: string; detail?: Record<string, unknown> | null; occurred_at?: string | null }

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "")

/** Where a thing came from, in one short sentence, or null when there is nothing on record. Pure. */
export function provenanceLine(events: readonly HistoryLine[]): string | null {
  const moves = events.filter((e) => isMovementKind(e.kind)).sort((a, b) => String(a.occurred_at ?? "").localeCompare(String(b.occurred_at ?? "")))
  // a pick-up of the very row that was dropped is the same thing coming back, not a new source
  const all = moves.filter((e) => e.kind === "acquire" || e.kind === "pickup")
  const fresh = all.filter((e) => !(e.kind === "pickup" && e.detail?.same_item === true))
  const sources = fresh.length ? fresh : all.slice(0, 1)
  const last = moves[moves.length - 1]
  const handed = last && last.kind === "give" && str(last.detail?.from) ? `given by ${str(last.detail?.from)}` : ""
  if (!sources.length) return handed ? `${handed[0].toUpperCase()}${handed.slice(1)}.` : null
  const places = new Set(sources.map((e) => str(e.detail?.from) || (e.kind === "pickup" ? "the floor" : "")))
  let line: string
  if (places.size > 1) line = "Gathered from more than one place"   // a stack that grew: one line cannot name them all
  else {
    const first = sources[0], d = first.detail ?? {}, from = str(d.from)
    if (first.kind === "pickup") line = "Picked up off the floor"
    else if (d.from_stash === true) line = `Recovered from ${from || "the drow's stores"}${str(d.confiscated_from) ? `, where the drow kept what they took from ${str(d.confiscated_from)}` : ""}`
    else line = from ? `Taken from ${from}` : "Taken as loot"
  }
  return `${line}${handed ? `, then ${handed}` : ""}.`
}
