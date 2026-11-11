/**
 * The database half of lib/world-time: one "time_passes" row a real minute while the table plays. Server-only.
 *
 * Every open map polls /api/map-stage every few seconds and asks for a tick (`?tick=1`) when it is out walking — not
 * in a fight, not in a rehearsal, not with time stopped. Whichever screen asks first after a real minute has passed
 * writes the tick; the others find it already written. The last tick's time lives in world_flags `clock-tick`, and the
 * write is compare-and-set on it, so two screens asking at once cannot both count the same minute.
 *
 * Best-effort: a failed tick never breaks the poll that carried it.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { logTimeEvent } from "./time-tracking"
import { tickDue } from "./world-time"

const CAMPAIGN = "ashes-of-prometheus"
const TICK_FLAG = "clock-tick"

/** The clock's session, resolved the way /api/game-clock does: the active one, else the newest. */
async function clockSessionId(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.from("sessions").select("id,status,started_at").order("started_at", { ascending: false })
  const rows = (data ?? []) as { id: string; status: string | null }[]
  return (rows.find((s) => s.status === "active") ?? rows[0])?.id ?? null
}

/** A fight on any plate of the live run (walk_world state "fight:<plate>", or the old single fightOn). */
async function fightOn(db: SupabaseClient): Promise<boolean> {
  const { data: run } = await db.from("campaign_runs").select("id").eq("campaign_id", "abyss").eq("status", "active")
    .order("run_number", { ascending: false }).limit(1).maybeSingle()
  if (!run?.id) return false
  const { data } = await db.from("walk_world").select("state").eq("campaign_run_id", run.id).maybeSingle()
  const state = (data?.state ?? {}) as Record<string, unknown>
  return Object.entries(state).some(([k, v]) => (k === "fightOn" || k.startsWith("fight:")) && v != null)
}

/** Write the tick if one is due. Returns the game minutes it added (0 when none). */
export async function tickWorldTime(db: SupabaseClient, now = Date.now()): Promise<number> {
  try {
    const { data: flag } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", TICK_FLAG).maybeSingle()
    const lastIso = (flag?.value as { at?: string } | null)?.at ?? null
    const lastAt = lastIso ? Date.parse(lastIso) : null
    const { due, minutes } = tickDue(lastAt, now)
    if (!due) return 0
    const nextIso = new Date(now).toISOString()
    if (!flag) {
      // the first tick of a game only starts the count; ignoreDuplicates so two first screens do not fight over it
      await db.from("world_flags").upsert(
        { campaign_id: CAMPAIGN, key: TICK_FLAG, value: { at: nextIso }, set_by: "clock", note: "when game time last ticked (lib/world-time)" },
        { onConflict: "campaign_id,key", ignoreDuplicates: true },
      )
      return 0
    }
    // compare-and-set: only the screen that still sees the old time gets to write this minute
    const { data: won } = await db.from("world_flags").update({ value: { at: nextIso } })
      .eq("campaign_id", CAMPAIGN).eq("key", TICK_FLAG).eq("value->>at", lastIso as string).select("key")
    if (!won || !won.length || minutes <= 0) return 0
    if (await fightOn(db)) return 0          // the minute is spent, but a fight keeps its own time (6-second rounds)
    await logTimeEvent(db, await clockSessionId(db), { eventType: "time_passes", minutesAdvanced: minutes })
    return minutes
  } catch (e) {
    console.error("[world-time] tick failed:", e)
    return 0
  }
}
