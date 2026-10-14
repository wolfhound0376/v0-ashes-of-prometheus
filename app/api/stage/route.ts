import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { FOLLOWED_MODES, type StageRecord } from "@/lib/stage"

// POST /api/stage — write the table's shared stage record (rule 4 of the stage transitions:
// "the table moves together"). One row: the active session's `stage` jsonb column
// (migrations/sessions_stage.sql). Best-effort by contract: a missing column or a missing
// session answers {synced:false} and the browser that moved carries on alone.

export async function POST(req: Request) {
  let body: Partial<StageRecord>
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const mode = body.mode
  if (!mode || !FOLLOWED_MODES.has(mode)) return NextResponse.json({ synced: false, reason: "mode not shared" })
  const rec: StageRecord = {
    mode,
    by: String(body.by ?? "").slice(0, 32),
    at: new Date().toISOString(),
    caption: typeof body.caption === "string" ? body.caption.slice(0, 400) : undefined,
  }
  try {
    const admin = createAdminClient()
    const { data: sess } = await admin.from("sessions").select("id,status,started_at").order("started_at", { ascending: false }).limit(20)
    const row = (sess ?? []).find((s) => s.status === "active") ?? (sess ?? [])[0]
    if (!row) return NextResponse.json({ synced: false, reason: "no session" })
    const { error } = await admin.from("sessions").update({ stage: rec }).eq("id", row.id)
    if (error) return NextResponse.json({ synced: false, reason: error.message })
    return NextResponse.json({ synced: true })
  } catch (e) {
    return NextResponse.json({ synced: false, reason: e instanceof Error ? e.message : "failed" })
  }
}
