import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { WALK_EVENT_BUCKET_MS, isWalkEventSig } from "@/lib/walk-action"

// POST /api/walk-event — "is this map event mine to tell Malachar?"
//
// Sam, 2026-10-27: "Build all of it" — the automatic events on the painted map (a guard spots a sneak, combat opens,
// Jorlan speaks at the bars, Ilvara or the surgeon speaks first) never reached Malachar. They run in every browser at
// the table, so each screen asks here first: the first to claim an event's fingerprint in its window gets
// {first: true} and sends it on (components/walk/walk-roll-bridge.tsx); everyone else gets {first: false} and drops it.
//
// The window is the server's clock, not the browser's: `bucket` = now / WALK_EVENT_BUCKET_MS, and a claim also checks
// the bucket before, so two screens either side of a boundary still count as one event.
//
// Who may claim: the DM screen (x-dm-key), or a browser holding a seated hero's claim. A screen with neither (a
// spectator) never speaks for the table. Table walk_events (supabase/migrations/20261027010000_walk_events.sql),
// service role only.

export const dynamic = "force-dynamic"

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const sig = String(body?.sig ?? "")
  if (!isWalkEventSig(sig)) return NextResponse.json({ error: "sig required" }, { status: 400 })
  const text = String(body?.text ?? "").slice(0, 2000)

  const db = createAdminClient()
  if (!isDm(req)) {
    const claimId = String(body?.claimId ?? "").slice(0, 64), claimToken = typeof body?.claimToken === "string" ? body.claimToken : ""
    if (!claimId || !claimToken) return NextResponse.json({ error: "DM or a seated player only" }, { status: 403 })
    const { data: secret } = await db.from("character_secrets").select("claim_token").eq("character_id", claimId).maybeSingle()
    if (!secret?.claim_token || !safeEquals(String(secret.claim_token), claimToken)) {
      return NextResponse.json({ error: "DM or a seated player only" }, { status: 403 })
    }
  }

  const bucket = Math.floor(Date.now() / WALK_EVENT_BUCKET_MS)
  const { data: seen, error: readErr } = await db.from("walk_events").select("bucket").eq("sig", sig).in("bucket", [bucket - 1, bucket]).limit(1)
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (seen && seen.length) return NextResponse.json({ ok: true, first: false })

  // the primary key (sig, bucket) settles two claims in the same instant: one insert lands, the other returns nothing
  const { data: won, error } = await db.from("walk_events")
    .upsert({ sig, bucket, text }, { onConflict: "sig,bucket", ignoreDuplicates: true })
    .select("sig")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, first: Boolean(won && won.length) })
}
