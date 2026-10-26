import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { restartCampaign } from "@/lib/restart-campaign"

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
  return Response.json(await restartCampaign(admin), { status: 200 })
}
