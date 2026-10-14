// ============================================================================
// SEATS — who is actually playing this run.
//
// Sam, 2026-10-14: "Unless there are multiple players, only the character
// selected will populate in the game." Per-browser identity is localStorage
// (AGENTS.md §5), so the database could not say who was at the table; the map
// drew all four every time. A seat is a world flag, `seated:<characterId>`,
// written when a claim is verified (/api/verify-claim — the dashboard on every
// load, /awaken at the door) and cleared with every other flag by a restart,
// so a new run starts with nobody seated until someone comes through the door.
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

export type Seat = { id: string; name: string; at: string; dm?: boolean }

/** Record that this character has sat down this run. Best-effort: never throws. */
export async function seatCharacter(db: SupabaseClient, character: { id: string; name: string }, opts: { dm?: boolean } = {}): Promise<void> {
  try {
    const key = seatFlagKey(character.id)
    const { data } = await db.from("world_flags").select("key, value").eq("campaign_id", CAMPAIGN).eq("key", key).maybeSingle()
    const prev = (data?.value ?? null) as Partial<Seat> | null
    // Already seated: keep the first `at`. A player claiming a DM-run companion takes it over
    // (dm → false); the DM seating an already-seated player changes nothing.
    if (prev && (!prev.dm || opts.dm)) return
    const { error } = await db.from("world_flags").upsert(
      { campaign_id: CAMPAIGN, key, value: { id: character.id, name: character.name, at: prev?.at ?? new Date().toISOString(), dm: !!opts.dm }, set_by: opts.dm ? "dm" : "seat", note: opts.dm ? `${character.name} runs as the DM's NPC` : `${character.name} sat down` },
      { onConflict: "campaign_id,key" },
    )
    if (error) console.error("[seat] not written:", error.message)
  } catch (e) {
    console.error("[seat] failed:", e)
  }
}

/** Everyone seated this run, earliest first. Empty when nobody has come through the door yet. */
export async function readSeated(db: SupabaseClient): Promise<Seat[]> {
  try {
    const { data } = await db.from("world_flags").select("key, value").eq("campaign_id", CAMPAIGN).like("key", `${PREFIX}%`)
    const seats: Seat[] = []
    for (const row of data ?? []) {
      const v = row.value as Partial<Seat> | null
      if (v && typeof v.id === "string" && typeof v.name === "string") seats.push({ id: v.id, name: v.name, at: typeof v.at === "string" ? v.at : "", dm: !!v.dm })
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
