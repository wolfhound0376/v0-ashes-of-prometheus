import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { restartCampaign } from "@/lib/restart-campaign"
import { newSaveName } from "@/lib/saves"
import { shelveWorldInPlay, startNewSave } from "@/lib/save-store"

// POST /api/restart-campaign — the real "start over" button (the DM's red button at /table).
// The wipe itself lives in lib/restart-campaign.ts, shared with /api/table's `new` — the DM door's
// New game (Sam, 2026-10-25: "starting a new game ALWAYS resets the campaign"). That file carries
// the full record of what is wiped, what survives and why.
//
// AUTHORIZATION: x-dm-key must carry DM_ACCESS_CODE. FAIL CLOSED: with the env var unset the route
// refuses everyone (Sam's order, 2026-08-20).

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: Request) {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return Response.json({ ok: false, reason: "forbidden" }, { status: 403 })
  const supplied = req.headers.get("x-dm-key") || ""
  if (!supplied || !safeEquals(normalizeCode(supplied), normalizeCode(required))) {
    return Response.json({ ok: false, reason: "forbidden" }, { status: 403 })
  }
  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[restart] admin client unavailable:", e)
    return Response.json({ ok: false, reason: "server" }, { status: 500 })
  }
  // SAVED GAMES (Sam, 2026-11-10, ruling 1): the world in play goes on the shelf before it is wiped, and the fresh
  // world becomes a new save. A failed save stops the wipe. Skipped until the saves migration is applied.
  const shelved = await shelveWorldInPlay(admin, "Before the new game")
  if (!shelved.ok && !shelved.missing) return Response.json({ ok: false, reason: "save", problems: [`The game in play could not be saved, so nothing was reset: ${shelved.error}`] }, { status: 500 })
  const result = await restartCampaign(admin)
  if (result.ok && shelved.ok) await startNewSave(admin, newSaveName())
  return Response.json(result, { status: 200 })
}
