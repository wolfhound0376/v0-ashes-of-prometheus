// lib/travel/leader-store.ts — the leader columns on travel_march, read with the
// service role. Shared by /api/travel (writes) and /api/travel/leader (the
// public read). Pure rules live in lib/travel/leader.ts.
import type { createAdminClient } from "@/lib/supabase/admin"
import { HOST_KEY, readHostValue } from "@/lib/host"

type Db = ReturnType<typeof createAdminClient>

/** The party: every player character, the only people who may vote or lead. */
export async function roster(db: Db): Promise<{ id: string; name: string }[]> {
  const { data } = await db.from("characters").select("id,name").eq("is_player", true).order("name")
  return (data ?? []) as { id: string; name: string }[]
}

/**
 * The leader columns, read best-effort: until migrations/travel_march_leader.sql
 * is applied they do not exist, and the DM must still be able to march.
 */
export async function readLeader(db: Db, runId: string | null): Promise<{ leader: string | null; host: string | null; votes: Record<string, string>; available: boolean }> {
  const host = await readHostId(db)
  if (!runId) return { leader: null, host, votes: {}, available: false }
  const { data, error } = await db.from("travel_march").select("leader_character_id,leader_votes").eq("campaign_run_id", runId).maybeSingle()
  if (error) return { leader: null, host, votes: {}, available: false }
  const votes = data?.leader_votes && typeof data.leader_votes === "object" ? (data.leader_votes as Record<string, string>) : {}
  return { leader: (data?.leader_character_id as string | null) ?? null, host, votes, available: true }
}

/**
 * The campaign's host (lib/host.ts), who leads the march unless the DM names someone else
 * (lib/travel/leader.ts, whoLeads). Only a host who is still a player character counts. Best-effort:
 * a table with no host, or a read that fails, falls back to the vote.
 */
export async function readHostId(db: Db): Promise<string | null> {
  try {
    const { data } = await db.from("world_flags").select("value").eq("campaign_id", "ashes-of-prometheus").eq("key", HOST_KEY).maybeSingle()
    const host = data ? readHostValue(data.value) : null
    if (!host) return null
    const { data: c } = await db.from("characters").select("id").eq("id", host.id).eq("is_player", true).maybeSingle()
    return c?.id ? host.id : null
  } catch {
    return null
  }
}

/** The active Out of the Abyss run, where the march row lives. */
export async function activeRunId(db: Db): Promise<string | null> {
  const { data } = await db
    .from("campaign_runs")
    .select("id")
    .eq("campaign_id", "abyss")
    .in("status", ["setup", "active"])
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}
