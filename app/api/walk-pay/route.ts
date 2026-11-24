import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { syncCarried } from "@/lib/carry"
import { isCoinSlug, planPayment, type PayCoins, type PayPurse } from "@/lib/walk-pay"

// /api/walk-pay — the party pays someone on the painted map, out of everything it carries.
//
//   POST {payKey, characterIds: [...], gp, to, why, claimToken?}
//
// First use: Old Thessaly's keelboat, 100 gp (Sam, 2026-10-24; claude/Old_Thessaly_Module_2026-11-23.md). The rules are
// lib/walk-pay.ts: purses first in party order, then loose coin biggest first, change back into that hero's purse.
//
// Who may pay: the DM screen (x-dm-key), or a browser holding the claim of one of the payers (the /api/walk-xp doors).
// A payment happens once: `payKey` is written to world_flags as `paid:<payKey>` before any coin moves, so a retry or a
// double click finds it there and pays nothing. Short of the price: 409 with what the party has, and nothing written.

export const dynamic = "force-dynamic"

const CAMPAIGN = "ashes-of-prometheus"
const MAX_GP = 100000

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const payKey = typeof body.payKey === "string" ? body.payKey.trim().slice(0, 120) : ""
  const claimToken = typeof body.claimToken === "string" ? body.claimToken : ""
  const ids: string[] = Array.isArray(body.characterIds)
    ? [...new Set<string>(body.characterIds.filter((x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length < 64))].slice(0, 12)
    : []
  const gp = Math.max(0, Math.min(MAX_GP, Number(body.gp) || 0))
  const to = String(body.to ?? "someone").slice(0, 60), why = String(body.why ?? "").slice(0, 120)
  if (!payKey || !ids.length || !gp) return NextResponse.json({ error: "payKey, characterIds and gp are required" }, { status: 400 })

  const db = createAdminClient()
  if (!isDm(req)) {
    if (!claimToken) return NextResponse.json({ error: "DM or a player in the party only" }, { status: 403 })
    const { data: secrets } = await db.from("character_secrets").select("character_id, claim_token").in("character_id", ids)
    if (!(secrets ?? []).some((s) => s.claim_token && safeEquals(String(s.claim_token), claimToken)))
      return NextResponse.json({ error: "DM or a player in the party only" }, { status: 403 })
  }

  const { data: flag } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", `paid:${payKey}`).maybeSingle()
  if (flag) return NextResponse.json({ ok: true, already: true })

  // what the party carries: each purse, and every loose coin stack (inventory rows whose catalogue slug is a coin)
  const { data: chars, error: cErr } = await db.from("characters").select("id, name, sheet_currency").in("id", ids)
  if (cErr) return NextResponse.json({ error: "could not read the party" }, { status: 500 })
  const order = new Map(ids.map((id, i) => [id, i]))
  const purses: PayPurse[] = (chars ?? []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).map((c) => ({ characterId: c.id, currency: c.sheet_currency ?? {} }))
  const { data: rows } = await db.from("inventory_items").select("id, character_id, quantity, item_id").in("character_id", ids)
  const itemIds = [...new Set((rows ?? []).map((r) => r.item_id).filter(Boolean))]
  const { data: items } = itemIds.length ? await db.from("items").select("id, slug").in("id", itemIds) : { data: [] as { id: string; slug: string }[] }
  const slugOf = new Map((items ?? []).map((i) => [i.id, i.slug]))
  const coins: PayCoins[] = (rows ?? []).flatMap((r) => {
    const slug = slugOf.get(r.item_id)
    return isCoinSlug(slug) ? [{ rowId: r.id, characterId: r.character_id, slug, qty: Number(r.quantity) || 0 }] : []
  })

  const plan = planPayment(purses, coins, gp)
  if (!plan.ok) return NextResponse.json({ error: `The party has ${plan.had} gp between them; ${to} wants ${gp}.`, had: plan.had, need: gp }, { status: 409 })

  // pay once: claim the key before a coin moves
  const { data: claimed, error: fErr } = await db.from("world_flags").upsert(
    { campaign_id: CAMPAIGN, key: `paid:${payKey}`, value: { gp, to, why, payers: ids }, set_by: "walk-pay", note: `${gp} gp to ${to}${why ? ` for ${why}` : ""}` },
    { onConflict: "campaign_id,key", ignoreDuplicates: true },
  ).select("key")
  if (fErr) return NextResponse.json({ error: "could not record the payment" }, { status: 500 })
  if (!claimed || claimed.length === 0) return NextResponse.json({ ok: true, already: true })

  for (const p of plan.purses) await db.from("characters").update({ sheet_currency: p.currency, updated_at: new Date().toISOString() }).eq("id", p.characterId)
  const touched = new Set<string>()
  for (const c of plan.coins) {
    const row = (rows ?? []).find((r) => r.id === c.rowId); if (row) touched.add(row.character_id)
    if (c.qty > 0) await db.from("inventory_items").update({ quantity: c.qty }).eq("id", c.rowId)
    else await db.from("inventory_items").delete().eq("id", c.rowId)
  }
  for (const id of touched) await syncCarried(db, id)
  const names = (chars ?? []).map((c) => String(c.name).split(" ")[0]).join(", ")
  await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text: `The party (${names}) pays ${to} ${gp} gp${why ? ` for ${why}` : ""}.` })
  return NextResponse.json({ ok: true, paid: gp, had: plan.had })
}
