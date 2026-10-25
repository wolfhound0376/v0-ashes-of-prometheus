// Reading the party's situation (lib/situation.ts) out of the database. The one place that knows the
// table and how the live run is found, so the chat route and /api/party/situation agree on both.
//
// Best-effort by contract: every failure — the table not pasted in yet, no run, a network blip —
// comes back as null, never a throw. Nothing that reads the situation may hold up a turn.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { PartySituationRow } from "@/lib/situation"

export const SITUATION_TABLE = "party_situation"

/** The run everything keys on: the same answer party_location_label() uses, with a plain fallback. */
export async function activeRun(db: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await db.rpc("subnodal_active_run")
    if (!error && typeof data === "string" && data) return data
    const { data: runs } = await db.from("campaign_runs").select("id, status, started_at, created_at")
      .order("started_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(5)
    const active = (runs ?? []).find((r) => r.status === "active") ?? (runs ?? [])[0]
    return (active?.id as string | undefined) ?? null
  } catch {
    return null
  }
}

/** The live run's row, or null when there is none (or the table is not there yet). */
export async function readPartySituation(db: SupabaseClient, runId?: string | null): Promise<PartySituationRow | null> {
  try {
    const run = runId || (await activeRun(db))
    if (!run) return null
    const { data, error } = await db.from(SITUATION_TABLE).select("*").eq("campaign_run_id", run).maybeSingle()
    if (error || !data) return null
    return data as PartySituationRow
  } catch {
    return null
  }
}
