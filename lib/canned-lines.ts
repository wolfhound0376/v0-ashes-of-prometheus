// ============================================================================
// SAYING IT AGAIN — pulling a line out of the archive instead of generating it.
// ============================================================================
//
// Sam, 2026-10-30: recycling covers NPC barks and system flavour. The archive
// (dialogue_archive) holds them; lib/dialogue-tags.ts decided which ones may
// be reused; this is the read side.
//
// The whole value is in what it does NOT do. It never returns a Malachar line,
// a player's words or anything with a name or a number in it, because those
// rows are `reusable = false` in the table and the query filters on it — the
// rule is enforced in the index, not in the caller's good intentions.
//
// A miss returns null, and a miss is the normal case early on: the archive
// only fills as runs end. A caller must always be able to generate instead.
// That is deliberate — this is a saving, never a dependency.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { LineTrigger } from "./dialogue-tags"

export type CannedRequest = {
  /** Whose mouth it has to come out of. Required: a guard's bark in a
   *  prisoner's voice is worse than no bark. */
  speaker: string
  /** The occasion. Omit to take anything that speaker has ever said. */
  trigger?: LineTrigger
  /** Lines to skip — usually the last few said, so a bark does not repeat
   *  twice running. */
  exclude?: string[]
  /** How many candidates to consider before picking one. */
  pool?: number
}

export type CannedLine = { text: string; speaker: string; trigger: string | null }

/**
 * One reusable line this speaker has said before on this occasion, or null.
 *
 * Picks at random from the most recent `pool` candidates rather than always
 * the newest: a guard with four archived warnings should sound like a guard
 * with four warnings, not like a guard with one.
 *
 * Never throws. A database that cannot be reached is a miss, and a miss costs
 * the caller a generation, never the line.
 */
export async function pickCannedLine(
  db: SupabaseClient,
  req: CannedRequest,
  random: () => number = Math.random,
): Promise<CannedLine | null> {
  const speaker = req.speaker?.trim()
  if (!speaker) return null
  const pool = Math.max(1, Math.min(50, req.pool ?? 20))

  try {
    // Every filter goes on before the ordering: a PostgREST builder is
    // thenable at any point, so appending a filter after .limit() happens to
    // work, and reads as if the limit were applied first. Keep it honest.
    let q = db
      .from("dialogue_archive")
      .select("text, speaker, trigger")
      .eq("reusable", true)
      .eq("speaker", speaker)
    if (req.trigger) q = q.eq("trigger", req.trigger)

    const { data, error } = await q.order("archived_at", { ascending: false }).limit(pool)
    if (error || !data?.length) return null

    const skip = new Set((req.exclude ?? []).map((s) => s.trim()))
    const usable = (data as CannedLine[]).filter((r) => r.text?.trim() && !skip.has(r.text.trim()))
    if (!usable.length) return null

    return usable[Math.floor(random() * usable.length)] ?? null
  } catch (e) {
    console.log("[canned-lines] lookup skipped:", (e as Error).message)
    return null
  }
}
