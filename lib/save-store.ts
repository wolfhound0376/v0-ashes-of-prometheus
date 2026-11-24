// The saved-games shelf in the database (the rules are in lib/saves.ts; the work is in the migration
// migrations/20261110230000_campaign_saves.sql). Server only: every call needs the service role.
//
// Until the migration is applied, every helper here reports `missing` and the game behaves exactly as it did
// before saves existed — New Game resets, End keeps the world — so this can merge before the SQL runs.

import type { SupabaseClient } from "@supabase/supabase-js"
import { isSavesMissing, type SaveRow } from "@/lib/saves"

export type ShelfResult = { ok: true; id: string | null } | { ok: false; missing: true } | { ok: false; missing: false; error: string }

const LIST_COLUMNS_V1 = "id, name, saved_at, created_at, session_no, place, host, party, is_loaded"
/** Part 2 (migrations/20261123230000_save_checkpoints.sql): the campaign, the kind, Mortal Mode, the plate, play time. */
const LIST_COLUMNS = `${LIST_COLUMNS_V1}, campaign_id, kind, mortal, plate, play_seconds`

/** Every save, newest first, without the snapshots. `missing` = the migration has not been applied. Before part 2 is
 *  applied the new columns are simply absent, and every save reads as a campaign of its own. */
export async function listSaves(db: SupabaseClient): Promise<{ saves: SaveRow[]; missing: boolean; error?: string }> {
  let res: { data: unknown[] | null; error: { code?: string; message: string } | null } = await db.from("campaign_saves").select(LIST_COLUMNS).order("saved_at", { ascending: false })
  if (res.error?.code === "42703") res = await db.from("campaign_saves").select(LIST_COLUMNS_V1).order("saved_at", { ascending: false })
  const { data, error } = res
  if (error) return isSavesMissing(error) ? { saves: [], missing: true } : { saves: [], missing: false, error: error.message }
  return { saves: (data ?? []) as SaveRow[], missing: false }
}

/** The campaign in play (its head row), with Mortal Mode. Null when nothing is loaded or on any error. */
export async function headInPlay(db: SupabaseClient): Promise<{ id: string; name: string; mortal: boolean; play_seconds: number } | null> {
  const { data, error } = await db.from("campaign_saves").select("id, name, mortal, play_seconds").eq("is_loaded", true).maybeSingle()
  if (error || !data) return null
  return { id: data.id as string, name: data.name as string, mortal: Boolean(data.mortal), play_seconds: Number(data.play_seconds ?? 0) }
}

/** A checkpoint of the world in play: `auto` at End, `named` for the host's Save now. Refused in Mortal Mode. */
export async function checkpoint(db: SupabaseClient, kind: "auto" | "named", name: string): Promise<ShelfResult> {
  const { data, error } = await db.rpc("campaign_checkpoint", { p_kind: kind, p_name: name })
  if (error) return isSavesMissing(error) ? { ok: false, missing: true } : { ok: false, missing: false, error: error.message }
  return { ok: true, id: (data as string | null) ?? null }
}

/** Rewind: a checkpoint's world goes back into its campaign and is played (the campaign as it stood is kept first). */
export async function rewindTo(db: SupabaseClient, checkpointId: string): Promise<ShelfResult> {
  const { error } = await db.rpc("campaign_rewind", { p_id: checkpointId })
  if (error) return isSavesMissing(error) ? { ok: false, missing: true } : { ok: false, missing: false, error: error.message }
  return { ok: true, id: checkpointId }
}

/** Add real play time to the campaign in play (at End). Best-effort: a failure here never stops an End. */
export async function addPlayTime(db: SupabaseClient, seconds: number): Promise<void> {
  if (!(seconds > 0)) return
  try {
    const head = await headInPlay(db)
    if (head) await db.from("campaign_saves").update({ play_seconds: head.play_seconds + seconds }).eq("id", head.id)
  } catch { /* the time is a nicety, never a reason to fail */ }
}

/** Mark a new campaign Mortal (Sam: "yes on mortal mode"). */
export async function setMortal(db: SupabaseClient, id: string): Promise<string | null> {
  const { error } = await db.from("campaign_saves").update({ mortal: true }).eq("id", id)
  return error ? error.message : null
}

/** The save in play, if any. */
export async function loadedSave(db: SupabaseClient): Promise<{ id: string; name: string } | null | "missing"> {
  const { data, error } = await db.from("campaign_saves").select("id, name").eq("is_loaded", true).maybeSingle()
  if (error) return isSavesMissing(error) ? "missing" : null
  return data ? { id: data.id as string, name: data.name as string } : null
}

/**
 * Write the world in play into the save in play — or, when nothing is loaded yet (the first time ever), into a new
 * save named `nameIfNew` that becomes the save in play.
 */
export async function shelveWorldInPlay(db: SupabaseClient, nameIfNew: string): Promise<ShelfResult> {
  const cur = await loadedSave(db)
  if (cur === "missing") return { ok: false, missing: true }
  const { data, error } = await db.rpc("campaign_save", { p_id: cur?.id ?? null, p_name: cur ? null : nameIfNew, p_load: !cur })
  if (error) return isSavesMissing(error) ? { ok: false, missing: true } : { ok: false, missing: false, error: error.message }
  return { ok: true, id: (data as string | null) ?? null }
}

/** After a New Game: the fresh world becomes a new save, and the save in play (Sam's ruling 1). */
export async function startNewSave(db: SupabaseClient, name: string): Promise<ShelfResult> {
  const { data, error } = await db.rpc("campaign_save", { p_id: null, p_name: name, p_load: true })
  if (error) return isSavesMissing(error) ? { ok: false, missing: true } : { ok: false, missing: false, error: error.message }
  return { ok: true, id: (data as string | null) ?? null }
}

/** Put a save into play (the world in play is shelved first, inside the same transaction). */
export async function loadSave(db: SupabaseClient, id: string): Promise<ShelfResult> {
  const { error } = await db.rpc("campaign_load", { p_id: id })
  if (error) return isSavesMissing(error) ? { ok: false, missing: true } : { ok: false, missing: false, error: error.message }
  return { ok: true, id }
}

// THE USUAL PARTY (Sam, 2026-11-10: approved "the usual party" — players stay invited for the whole campaign).
// A save remembers who was at the table when it was last written (campaign_save_meta: the seated heroes' names).
// When the host opens the table, those heroes get their seats opened straight away, so nobody waits on an invite
// they had last time. Matched by name to live player characters; a hero since archived or renamed is skipped.
export function matchParty(names: unknown, roster: { id: string; name: string }[]): { id: string; name: string }[] {
  if (!Array.isArray(names)) return []
  const want = new Set(names.filter((n): n is string => typeof n === "string").map((n) => n.trim().toLowerCase()).filter(Boolean))
  const seen = new Set<string>()
  return roster.filter((c) => {
    const k = c.name.trim().toLowerCase()
    if (!want.has(k) || seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })
}

/** The usual party of the save in play: [] before the saves migration, with nothing loaded, or on any error. */
export async function usualParty(db: SupabaseClient): Promise<{ id: string; name: string }[]> {
  try {
    const { data, error } = await db.from("campaign_saves").select("party").eq("is_loaded", true).maybeSingle()
    if (error || !data) return []
    const { data: chars } = await db.from("characters").select("id, name").eq("is_player", true).is("archived_at", null)
    return matchParty((data as { party?: unknown }).party, (chars ?? []) as { id: string; name: string }[])
  } catch { return [] }
}
