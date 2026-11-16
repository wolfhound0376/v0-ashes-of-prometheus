import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { WALK_EVENT_BUCKET_MS, isWalkEventSig } from "@/lib/walk-action"

// POST /api/walk-hazard — a book hazard on a cavern plate hurt the heroes (the plate director, lib/plate-director.mjs).
//
// Sam, 2026-11-15: "build the director". A rockfall, a gas leak or a sinkhole on the painted map is rolled the same on
// every screen at the table (the dice are seeded by the run), so every screen would send the same damage. This route
// takes it ONCE: the first screen to claim the hazard's fingerprint in walk_events writes it, the rest get
// {first: false} and write nothing — the same claim /api/walk-event uses.
//
// What it writes: hp_current on each named hero's sheet, never below 0, never above hp_max. The walk keeps no hit
// points between fights (every fight starts a hero at full), so, like /api/walk-rest, the damage lands on the SHEET,
// where the dashboard, the camp and Malachar read it.
//
// Body: {sig, plate, hits: [{characterId, amount, type}], claimId?, claimToken?}. Who may call: the DM screen
// (x-dm-key) or a browser holding a seated hero's claim.

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const sig = String(body?.sig ?? "")
  if (!isWalkEventSig(sig)) return NextResponse.json({ error: "sig required" }, { status: 400 })
  const plate = String(body?.plate ?? "").slice(0, 40)
  const hits = (Array.isArray(body?.hits) ? body.hits : [])
    .map((h: Record<string, unknown>) => ({ id: String(h?.characterId ?? ""), amount: Math.floor(Number(h?.amount) || 0), type: String(h?.type ?? "").slice(0, 20) }))
    .filter((h: { id: string; amount: number }) => UUID.test(h.id) && h.amount > 0 && h.amount <= 200)
    .slice(0, 12)
  if (!hits.length) return NextResponse.json({ ok: true, first: false, written: 0 })

  const db = createAdminClient()
  if (!isDm(req)) {
    const claimId = String(body?.claimId ?? "").slice(0, 64), claimToken = typeof body?.claimToken === "string" ? body.claimToken : ""
    if (!claimId || !claimToken) return NextResponse.json({ error: "DM or a seated player only" }, { status: 403 })
    const { data: secret } = await db.from("character_secrets").select("claim_token").eq("character_id", claimId).maybeSingle()
    if (!secret?.claim_token || !safeEquals(String(secret.claim_token), claimToken)) {
      return NextResponse.json({ error: "DM or a seated player only" }, { status: 403 })
    }
  }

  // ONE write per hazard: the first screen to claim its fingerprint
  const bucket = Math.floor(Date.now() / WALK_EVENT_BUCKET_MS)
  const { data: seen } = await db.from("walk_events").select("bucket").eq("sig", sig).in("bucket", [bucket - 1, bucket]).limit(1)
  if (seen && seen.length) return NextResponse.json({ ok: true, first: false, written: 0 })
  const { data: won, error: claimErr } = await db.from("walk_events")
    .upsert({ sig, bucket, text: `hazard on ${plate}` }, { onConflict: "sig,bucket", ignoreDuplicates: true })
    .select("sig")
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })
  if (!won || !won.length) return NextResponse.json({ ok: true, first: false, written: 0 })

  const ids = [...new Set(hits.map((h: { id: string }) => h.id))]
  const { data: rows, error } = await db.from("characters").select("id,name,hp_current,hp_max").in("id", ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const out: { id: string; name: string; hp: number; hpMax: number; took: number }[] = []
  for (const r of (rows ?? []) as { id: string; name: string; hp_current: number | null; hp_max: number | null }[]) {
    const took = hits.filter((h: { id: string }) => h.id === r.id).reduce((a: number, h: { amount: number }) => a + h.amount, 0)
    const max = Number(r.hp_max) || 0, before = Math.min(Number(r.hp_current ?? max) || 0, max || Infinity)
    const hp = Math.max(0, before - took)
    const { error: wErr } = await db.from("characters").update({ hp_current: hp }).eq("id", r.id)
    if (!wErr) out.push({ id: r.id, name: r.name, hp, hpMax: max, took })
  }
  return NextResponse.json({ ok: true, first: true, written: out.length, characters: out })
}
