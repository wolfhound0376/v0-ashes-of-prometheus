import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { readSeated } from "@/lib/seats"
import { logTimeEvent, readGameClock } from "@/lib/time-tracking"
import { shiftChangesBetween } from "@/lib/world-time"
import { minutesToNextWatch } from "@/lib/wait-watch"
import { jorlanOnDuty, readStage } from "@/lib/stage-roster"

// /api/walk-wait — the prisoners wait out the watch (Sam, 2026-11-12: "Wait for the next watch button option is
// good").
//
//   POST {claimToken?}
//
// The painted map gathers everyone's agreement and then asks once. This moves the game clock to the next change of
// the watch (lib/wait-watch finds it from lib/world-time's own schedule) as one `time_passes` entry. logTimeEvent
// counts the change it crosses on the stage, exactly as it does when the clock gets there by itself, so Jorlan's
// arrival, the shakedown and the caravan clock all see it.
//
// The short rest that goes with the wait is NOT taken here: the map calls /api/walk-rest straight after, so there is
// still only one place that spends Hit Dice.
//
// Who may call it: the DM screen (x-dm-key) or a browser holding the claim of a seated player, the same two doors
// /api/walk-rest uses. If the DM has stopped time the clock does not move, and this says so.

export const dynamic = "force-dynamic"

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

async function clockSessionId(db: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const { data } = await db.from("sessions").select("id,status,started_at").order("started_at", { ascending: false })
  const rows = (data ?? []) as { id: string; status: string | null }[]
  return (rows.find((s) => s.status === "active") ?? rows[0])?.id ?? null
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const claimToken = typeof body.claimToken === "string" ? body.claimToken : ""
  const db = createAdminClient()

  if (!isDm(req)) {
    const seatedIds = (await readSeated(db)).filter((s) => !s.away).map((s) => s.id)
    if (!claimToken || !seatedIds.length) return NextResponse.json({ error: "DM or a seated player only" }, { status: 403 })
    const { data: secrets } = await db.from("character_secrets").select("character_id, claim_token").in("character_id", seatedIds)
    const ok = (secrets ?? []).some((s) => s.claim_token && safeEquals(String(s.claim_token), claimToken))
    if (!ok) return NextResponse.json({ error: "DM or a seated player only" }, { status: 403 })
  }

  const sessionId = await clockSessionId(db)
  const before = await readGameClock(db, sessionId)
  if (!before) return NextResponse.json({ error: "the game clock could not be read" }, { status: 500 })
  const minutes = minutesToNextWatch(before, shiftChangesBetween)
  if (minutes == null) return NextResponse.json({ error: "the watch does not change" }, { status: 409 })

  const rotationsBefore = (await readStage(db)).rotations ?? 0
  await logTimeEvent(db, sessionId, { eventType: "time_passes", minutesAdvanced: minutes })
  const after = await readGameClock(db, sessionId)
  if (!after || (after.day === before.day && after.minutesOfDay === before.minutesOfDay)) {
    return NextResponse.json({ error: "Time is stopped. The DM has to start it before anyone can wait." }, { status: 409 })
  }
  const stage = await readStage(db)
  await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text: `*The prisoners wait out the watch: ${Math.floor(minutes / 60)} h ${minutes % 60} min pass and the guard changes.*` }).then(() => {}, () => {})
  return NextResponse.json({
    ok: true, minutes,
    rotations: stage.rotations ?? 0, changed: (stage.rotations ?? 0) - rotationsBefore,
    jorlanOnDuty: jorlanOnDuty(stage), watch: stage.watch ?? null,
  })
}
