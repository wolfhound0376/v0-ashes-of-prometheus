// ============================================================================
// SEATS — who is actually playing this run.
//
// Sam, 2026-10-14: "Unless there are multiple players, only the character
// selected will populate in the game." Per-browser identity is localStorage
// (AGENTS.md §5), so the database could not say who was at the table; the map
// drew all four every time. A seat is a world flag, `seated:<characterId>`,
// cleared with every other flag by a restart.
//
// SINCE 2026-10-25 a seat is taken ONLY at the staging table (/table, /api/table,
// lib/table.ts), while the DM has it open, and every seat empties when the DM ends
// the session. It used to be written whenever a claim was verified, which let a
// hero walk into a game already under way. The old `seatCharacter` writer is gone
// (2026-10-25) so nothing can seat a hero outside the table; the table writes seats
// through lib/table-store.ts, and the table itself opens only from the DM door
// (lib/dm-door.ts).
//
// A seat is "has sat down this run", not "is online now". The party on the map
// is everyone seated; a player who closes the tab is still in the party, and
// still at the table for Malachar. Nothing here is presence.
//
// A DM-RUN COMPANION is a seat with `dm: true` (Sam, 2026-10-14: "The DM can
// add characters but will treat them like an NPC, with the DM controlling
// that character"). It walks with the party on the map, only the DM's browser
// can lead it, and Malachar is told it is an NPC in the DM's hands: he may
// give it a line in a scene, never a decision or a roll of its own. A player
// who later claims that character turns the seat into a player's seat.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js"

const CAMPAIGN = "ashes-of-prometheus"
const PREFIX = "seated:"

export const seatFlagKey = (characterId: string) => `${PREFIX}${characterId}`

// `seat` (1..5) and `ready` belong to the table (lib/table.ts, Sam 2026-10-25): where around the table
// the hero sits, and whether their player pressed Ready. Seats written before the table existed lack both.
// `figure` (0..6) is which of the table's seven cartoon players they chose to sit as (Sam, 2026-10-25).
// `away` (Sam, 2026-10-25): the DM stepped this player out mid-game. The seat is kept — same chair, same figure —
// so the DM can let them back in, but they are not in the game until he does. Only ever set while the session is live.
export type Seat = { id: string; name: string; at: string; dm?: boolean; seat?: number; ready?: boolean; figure?: number; away?: boolean }

/** Everyone seated this run, earliest first. Empty when nobody has come through the door yet. */
export async function readSeated(db: SupabaseClient): Promise<Seat[]> {
  try {
    const { data } = await db.from("world_flags").select("key, value").eq("campaign_id", CAMPAIGN).like("key", `${PREFIX}%`)
    const seats: Seat[] = []
    for (const row of data ?? []) {
      const v = row.value as Partial<Seat> | null
      if (v && typeof v.id === "string" && typeof v.name === "string") seats.push({ id: v.id, name: v.name, at: typeof v.at === "string" ? v.at : "", dm: !!v.dm, seat: typeof v.seat === "number" ? v.seat : undefined, ready: !!v.ready, figure: typeof v.figure === "number" ? v.figure : undefined, away: !!v.away })
    }
    return seats.sort((a, b) => a.at.localeCompare(b.at))
  } catch (e) {
    console.error("[seat] read failed:", e)
    return []
  }
}

/** The DM sends a companion away: the seat is removed. Best-effort. */
export async function unseatCharacter(db: SupabaseClient, characterId: string): Promise<void> {
  try {
    const { error } = await db.from("world_flags").delete().eq("campaign_id", CAMPAIGN).eq("key", seatFlagKey(characterId))
    if (error) console.error("[seat] not removed:", error.message)
  } catch (e) {
    console.error("[seat] unseat failed:", e)
  }
}
