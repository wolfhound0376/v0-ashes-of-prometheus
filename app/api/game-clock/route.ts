import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { readGameClock, describeTimeOfDay, formatClockTime } from "@/lib/time-tracking"

// /api/game-clock — DM-ONLY read of the world clock for the active session.
//
//   GET → { day, clockTime, timeOfDay, exchangesSinceAdvance, advanceThreshold }
//
// Players must NEVER see the day number, the exact time, or the exchange
// counter, so this route is gated exactly like the other DM panels: x-dm-key
// must carry DM_ACCESS_CODE when that env var is set (fail-open when unset,
// same house rule as /api/cinematics and /api/asset-media). It reads the
// RLS-locked time tables with the service-role client only.

export const dynamic = "force-dynamic"

function authorized(request: NextRequest): boolean {
  const dmCode = process.env.DM_ACCESS_CODE
  if (!dmCode) return true
  const supplied = normalizeCode(request.headers.get("x-dm-key"))
  return !!supplied && safeEquals(supplied, normalizeCode(dmCode))
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not authorized" }, { status: 403 })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[game-clock] admin client unavailable:", e)
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  // Resolve the active session the same way /api/chat does: prefer status
  // 'active', else the most recently started one.
  const { data: sess } = await admin
    .from("sessions")
    .select("id, status, started_at")
    .order("started_at", { ascending: false })
  const rows = (sess ?? []) as { id: string; status: string | null }[]
  const activeSessionId = (rows.find((s) => s.status === "active") ?? rows[0])?.id ?? null

  if (!activeSessionId) return NextResponse.json({ clock: null })

  const clock = await readGameClock(admin, activeSessionId)
  if (!clock) return NextResponse.json({ clock: null })

  return NextResponse.json({
    clock: {
      day: clock.day,
      clockTime: formatClockTime(clock.minutesOfDay),
      timeOfDay: describeTimeOfDay(clock.minutesOfDay),
      exchangesSinceAdvance: clock.exchangesSinceAdvance,
      advanceThreshold: clock.advanceThreshold,
    },
  })
}
