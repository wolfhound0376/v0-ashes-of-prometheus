// The saved-games shelf in the database (the rules are in lib/saves.ts; the work is in the migration
// migrations/20261110230000_campaign_saves.sql). Server only: every call needs the service role.
//
// Until the migration is applied, every helper here reports `missing` and the game behaves exactly as it did
// before saves existed — New Game resets, End keeps the world — so this can merge before the SQL runs.

import type { SupabaseClient } from "@supabase/supabase-js"
import { isSavesMissing, type SaveRow } from "@/lib/saves"

export type ShelfResult = { ok: true; id: string | null } | { ok: false; missing: true } | { ok: false; missing: false; error: string }

const LIST_COLUMNS = "id, name, saved_at, created_at, session_no, place, host, party, is_loaded"

/** Every save, newest first, without the snapshots. `missing` = the migration has not been applied. */
export async function listSaves(db: SupabaseClient): Promise<{ saves: SaveRow[]; missing: boolean; error?: string }> {
  const { data, error } = await db.from("campaign_saves").select(LIST_COLUMNS).order("saved_at", { ascending: false })
  if (error) return isSavesMissing(error) ? { saves: [], missing: true } : { saves: [], missing: false, error: error.message }
  return { saves: (data ?? []) as SaveRow[], missing: false }
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
