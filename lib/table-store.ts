// The table's state in the database (the rules are in lib/table.ts).
//
// Everything lives in world_flags, the table every screen already reads and the Restart already wipes:
//   `table`             the TableState (absent = closed)
//   `seated:<id>`       one per seat (lib/seats.ts), now with `seat` (1..5) and `ready`
// No new table, no migration.

import type { SupabaseClient } from "@supabase/supabase-js"
import heroSprites from "@/scripts/velkynvelve-walk/heroes.json"
import { readSeated, seatFlagKey, type Seat } from "@/lib/seats"
import {
  CLOSED, READINESS_COLUMNS, dmLight, freeSeatNumber, missingOf, readTableState, readinessOf, seatLight, shouldStart,
  type CharacterRowForReadiness, type Light, type Readiness, type TableState,
} from "@/lib/table"

const CAMPAIGN = "ashes-of-prometheus"
const TABLE_KEY = "table"

const HERO_SPRITES = Object.fromEntries(Object.entries(heroSprites as Record<string, string>).filter(([k]) => k !== "_"))

export async function readTable(db: SupabaseClient): Promise<TableState> {
  const { data } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", TABLE_KEY).maybeSingle()
  return data ? readTableState(data.value) : CLOSED
}

export async function writeTable(db: SupabaseClient, t: TableState, note: string): Promise<void> {
  const { error } = await db.from("world_flags").upsert(
    { campaign_id: CAMPAIGN, key: TABLE_KEY, value: t, set_by: "dm", note },
    { onConflict: "campaign_id,key" },
  )
  if (error) throw new Error(`table not written: ${error.message}`)
}

/** Take (or keep) a seat. Keeps the seat number and `at` of an existing seat. */
export async function writeSeat(db: SupabaseClient, s: Seat, by: "seat" | "dm", note: string): Promise<void> {
  const { error } = await db.from("world_flags").upsert(
    { campaign_id: CAMPAIGN, key: seatFlagKey(s.id), value: s, set_by: by, note },
    { onConflict: "campaign_id,key" },
  )
  if (error) throw new Error(`seat not written: ${error.message}`)
}

export async function removeSeat(db: SupabaseClient, characterId: string): Promise<void> {
  const { error } = await db.from("world_flags").delete().eq("campaign_id", CAMPAIGN).eq("key", seatFlagKey(characterId))
  if (error) throw new Error(`seat not removed: ${error.message}`)
}

/** Empty every seat (a new session starts with nobody at the table). */
export async function clearSeats(db: SupabaseClient): Promise<void> {
  const { error } = await db.from("world_flags").delete().eq("campaign_id", CAMPAIGN).like("key", "seated:%")
  if (error) throw new Error(`seats not cleared: ${error.message}`)
}

export type SeatView = {
  id: string
  name: string
  seat: number | null
  dm: boolean
  ready: boolean
  light: Light
  missing: string[]
  readiness: Readiness
  thumbnail: string | null
  /** The hero's idle loop, if one exists — the seat plays it while the table waits. */
  loop: string | null
  /** The cartoon player this hero chose to sit as (0..6), if they chose. */
  figure: number | null
  cls: string | null
}

export type TableView = {
  state: TableState
  dmLight: Light | null
  seats: SeatView[]
}

export async function readinessFor(db: SupabaseClient, ids: string[]): Promise<Map<string, { r: Readiness; row: CharacterRowForReadiness }>> {
  const out = new Map<string, { r: Readiness; row: CharacterRowForReadiness }>()
  if (!ids.length) return out
  const { data } = await db.from("characters").select(READINESS_COLUMNS).in("id", ids)
  for (const row of (data ?? []) as unknown as CharacterRowForReadiness[]) out.set(row.id, { r: readinessOf(row, HERO_SPRITES), row })
  return out
}

/** The whole table as the room shows it: state, the DM's light, and every seat with its light. */
export async function readTableView(db: SupabaseClient): Promise<TableView> {
  const [state, seated] = await Promise.all([readTable(db), readSeated(db)])
  const ready = await readinessFor(db, seated.map((s) => s.id))
  const seats: SeatView[] = seated.map((s) => {
    const found = ready.get(s.id)
    const r = found?.r ?? { sprite: false, sheet: false, voice: false, thumbnail: false }
    const row = found?.row
    return {
      id: s.id,
      name: row?.name ?? s.name,
      seat: s.seat ?? null,
      dm: !!s.dm,
      ready: !!s.ready,
      light: seatLight(r, !!s.ready, !!s.dm),
      missing: missingOf(r),
      readiness: r,
      thumbnail: row?.portrait_image_url || row?.face_image_url || row?.avatar_image_url || null,
      loop: row?.idle_url || null,
      figure: typeof s.figure === "number" ? s.figure : null,
      cls: row?.class ?? null,
    }
  }).sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99))
  return { state, dmLight: dmLight(state), seats }
}

/** If the DM is green and every seat is green, the session begins. Returns the (possibly new) view. */
export async function startIfReady(db: SupabaseClient, view: TableView): Promise<TableView> {
  if (!shouldStart(view.state, view.seats.map((s) => s.light))) return view
  const state: TableState = { ...view.state, status: "live", startedAt: new Date().toISOString() }
  await writeTable(db, state, `Session ${state.session} began with ${view.seats.map((s) => s.name).join(", ")}`)
  return { ...view, state, dmLight: dmLight(state) }
}

/** The next free seat number, counting the seats already held. */
export function nextSeatNumber(view: TableView): number | null {
  return freeSeatNumber(view.seats.map((s) => s.seat ?? undefined))
}
