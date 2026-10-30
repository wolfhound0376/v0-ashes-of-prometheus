// POST /api/walk-check — a settled Underwalk roll reaching the ledger.
//
// The map's rolls never counted for anything (lib/walk-check-record.ts has the
// find). This route is the one that makes them count: the bridge posts the
// action key and what the dice did, and the earned-proficiency ledger gets the
// same ResolvedCheck Malachar's tag path and the exploration path produce.
//
// WHAT THIS ROUTE DOES NOT DO, deliberately:
//   - it does not decide the DC. The DC is WALK_ACTIONS', server-side, closed
//     (lib/walk-roll.ts). The body cannot carry one.
//   - it does not decide success. recordCheck does, under the homebrew rules.
//   - it does not tell the client anything about the tally. The response is
//     {ok} plus, when a path crossed, the skill that was awarded — which the
//     table has just watched happen anyway. No count, no path, no "3 of 8":
//     the tally stays hidden (Sam, 2026-09-26).
//
// Service-role only, like every other writer: skill_progress has RLS on with
// no policies.

import { createAdminClient } from "@/lib/supabase/admin"
import { applyResolvedCheck } from "@/lib/skill-progress-apply"
import { walkResolvedCheck } from "@/lib/walk-check-record"
import { isWalkActionKey } from "@/lib/walk-roll"
import { readGameClock } from "@/lib/time-tracking"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 })
  }

  const b = (body ?? {}) as Record<string, unknown>
  const characterId = typeof b.characterId === "string" ? b.characterId : ""
  const action = b.action
  const natural = Number(b.natural)
  const total = Number(b.total)

  if (!UUID.test(characterId)) return Response.json({ error: "characterId required" }, { status: 400 })
  if (!isWalkActionKey(action)) return Response.json({ error: "unknown action" }, { status: 400 })
  if (!Number.isInteger(natural) || natural < 1 || natural > 20) {
    return Response.json({ error: "natural must be a d20 face" }, { status: 400 })
  }
  if (!Number.isInteger(total) || total < -20 || total > 60) {
    return Response.json({ error: "total out of range" }, { status: 400 })
  }

  const admin = createAdminClient()

  // The campaign day comes from the clock, never from the client: freshness
  // ("one success per stake per campaign day") is only honest if the day is.
  // game_clock is one row per session and its day column has been spelled more
  // than one way, so this goes through the shared reader rather than selecting
  // a column name by hand. Active session picked the same way the chat route
  // picks it (app/api/chat/route.ts): newest started_at with status 'active',
  // else the newest row at all.
  let campaignDay = 1
  {
    const { data: sess } = await admin
      .from("sessions")
      .select("id, status, started_at")
      .order("started_at", { ascending: false })
    const rows = (sess ?? []) as { id: string; status: string | null }[]
    const sessionId = (rows.find((s) => s.status === "active") ?? rows[0] ?? null)?.id ?? null
    const clock = await readGameClock(admin, sessionId)
    if (clock) campaignDay = clock.day
  }

  const check = walkResolvedCheck({
    characterId,
    action,
    natural,
    total,
    campaignDay: Number.isFinite(campaignDay) && campaignDay >= 0 ? campaignDay : 1,
  })

  // A tool or bare ability check: nothing to count, and that is not an error.
  if (!check) return Response.json({ ok: true, counted: false })

  try {
    const outcome = await applyResolvedCheck(admin, check)
    if (!outcome) return Response.json({ ok: true, counted: false })
    if (outcome.skipped.length) {
      console.log(`[walk-check] ${check.skill} not counted: ${outcome.skipped.join(", ")}`)
    }
    return Response.json({
      ok: true,
      counted: outcome.appended.length > 0,
      awarded: outcome.award ? check.skill : null,
    })
  } catch (e) {
    // A roll that is already shown on the map must never fail because the
    // hidden tally could not be written. Log it and let the game go on.
    console.error("[walk-check] ledger write failed:", e instanceof Error ? e.message : e)
    return Response.json({ ok: false, counted: false }, { status: 200 })
  }
}
