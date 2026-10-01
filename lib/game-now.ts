// "Now" on the game clock, in absolute minutes (game_day × 1440 + minutes_of_day),
// from the most recently updated game_clock row. Null when no clock is running,
// and callers then fall back to real time. Server-only (service role: game_clock
// has RLS on and no policies).
import type { createAdminClient } from "@/lib/supabase/admin"

export async function gameNowMinutes(db: ReturnType<typeof createAdminClient>): Promise<number | null> {
  try {
    const { data } = await db
      .from("game_clock").select("game_day, minutes_of_day").order("updated_at", { ascending: false }).limit(1).maybeSingle()
    if (!data) return null
    const day = Number(data.game_day), mins = Number(data.minutes_of_day)
    return Number.isFinite(day) && Number.isFinite(mins) ? day * 1440 + mins : null
  } catch {
    return null
  }
}
