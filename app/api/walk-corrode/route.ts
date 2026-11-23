import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { WALK_EVENT_BUCKET_MS, isWalkEventSig } from "@/lib/walk-action"
import { CORRODE_RULES, corrodeArmor, corrodeWeapon, corrosionNote } from "@/lib/corrode.mjs"

// POST /api/walk-corrode — the gray ooze ate some of a hero's metal (lib/corrode.mjs: SRD 5.1, Corrode Metal; Pseudopod).
//
// Sam, 2026-11-23: "go corrode" — "Corrode Metal exactly as the SRD writes it". The painted map decides WHEN a blow
// corrodes (corrosionFor, the same file); this route writes it ONCE, on the actual inventory row:
//   - an item_events row, kind "corrode", whose detail.total is the item's running penalty after this hit (the ledger:
//     /api/equipment reads the latest total back to the map);
//   - inventory_items.condition_note says it in words; at -5 damage (a weapon) or AC 10 (armour) the item's condition
//     becomes "destroyed" (the repair module's last rung, lib/repair.ts) and it comes off the doll.
// The penalty is the SRD's own number, kept beside the repair rungs, not mapped onto them: a "damaged" rung carries its
// own -1, and stacking the two would double the book's penalty. It is permanent (the SRD's word); no repair lifts it.
//
// Body: {sig, plate, hits: [{characterId, itemKey?, name, part: "weapon"|"armor"}]}; DM screen or a seated hero's claim,
// like /api/walk-hazard. The first screen to claim the blow's fingerprint writes; the rest get {first: false}.

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

type Hit = { characterId: string; itemKey: string; name: string; part: "weapon" | "armor" }
type Row = { id: string; name: string; item_key: string | null; condition: string | null; items: { properties?: Record<string, unknown> | null } | null }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const sig = String(body?.sig ?? "")
  if (!isWalkEventSig(sig)) return NextResponse.json({ error: "sig required" }, { status: 400 })
  const plate = String(body?.plate ?? "").slice(0, 40)
  const hits: Hit[] = (Array.isArray(body?.hits) ? body.hits : [])
    .map((h: Record<string, unknown>) => ({
      characterId: String(h?.characterId ?? ""), itemKey: String(h?.itemKey ?? "").slice(0, 80),
      name: String(h?.name ?? "").slice(0, 80), part: h?.part === "armor" ? "armor" : "weapon",
    }))
    .filter((h: Hit) => UUID.test(h.characterId) && (h.itemKey || h.name))
    .slice(0, 6)
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

  // ONE write per blow: the first screen to claim its fingerprint
  const bucket = Math.floor(Date.now() / WALK_EVENT_BUCKET_MS)
  const { data: seen } = await db.from("walk_events").select("bucket").eq("sig", sig).in("bucket", [bucket - 1, bucket]).limit(1)
  if (seen && seen.length) return NextResponse.json({ ok: true, first: false, written: 0 })
  const { data: won, error: claimErr } = await db.from("walk_events")
    .upsert({ sig, bucket, text: `corrode on ${plate}` }, { onConflict: "sig,bucket", ignoreDuplicates: true })
    .select("sig")
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })
  if (!won || !won.length) return NextResponse.json({ ok: true, first: false, written: 0 })

  const out: { characterId: string; name: string; part: string; total: number; ac?: number; destroyed: boolean }[] = []
  for (const h of hits) {
    let q = db.from("inventory_items").select("id,name,item_key,condition,items(properties)").eq("character_id", h.characterId).is("confiscated_from", null)
    q = h.itemKey ? q.eq("item_key", h.itemKey) : q.ilike("name", h.name)
    const { data: rows } = await q.limit(1)
    const row = ((rows ?? [])[0] ?? null) as Row | null
    if (!row || row.condition === "destroyed") continue
    const { data: last } = await db.from("item_events").select("detail").eq("inventory_item_id", row.id).eq("kind", "corrode")
      .order("occurred_at", { ascending: false }).limit(1)
    const before = Number((last?.[0]?.detail as { total?: number } | undefined)?.total ?? 0) || 0
    const props = (row.items?.properties ?? {}) as { base_ac?: number }
    const r = h.part === "armor" ? corrodeArmor(Number(props.base_ac) || 11, before) : { ...corrodeWeapon(before), ac: undefined }
    const to = r.destroyed ? "destroyed" : (row.condition ?? "pristine")
    const { error: evErr } = await db.from("item_events").insert({
      inventory_item_id: row.id, character_id: h.characterId, kind: "corrode",
      from_condition: row.condition ?? "pristine", to_condition: to,
      detail: { part: h.part, total: r.total, ac: r.ac ?? null, destroyed: r.destroyed, by: "gray-ooze", plate, rule: CORRODE_RULES.source },
    })
    if (evErr) continue
    await db.from("inventory_items").update({ condition: to, condition_note: corrosionNote(h.part, r.total, r.destroyed) }).eq("id", row.id)
    if (r.destroyed && row.item_key) {
      await db.from("equipment_items").update({ equipped: false }).eq("character_id", h.characterId).eq("item_key", row.item_key)
    }
    out.push({ characterId: h.characterId, name: row.name, part: h.part, total: r.total, ac: r.ac, destroyed: r.destroyed })
  }
  return NextResponse.json({ ok: true, first: true, written: out.length, items: out })
}
