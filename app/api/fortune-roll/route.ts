import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { DAYS_DIE, FORTUNE_DIE, fortuneFlagKey, fortuneLine, scavengedRow } from "@/lib/scavenged"

// /api/fortune-roll — the opening fortune roll, resolved against the book's table (lib/scavenged.ts).
//
//   GET  ?characterId=…                        → { rolled: false } or { rolled: true, fortune }
//   POST { characterId, claimToken, days, d20 } → awards the row's item from the catalog, once per run
//
// The DICE are rolled in the browser on the shared 3D roller, where the table can see them (the same
// path every check and attack takes); this route only turns the two numbers into a row and the row into
// an inventory row. It trusts the numbers the way the table trusts a die on the felt — it checks they
// are a d10 and a d20, nothing more. The claim token is verified exactly as /api/chat verifies it, so
// nobody can roll for a character they do not hold.
//
// Once per run: the result is written to world_flags as `fortune:<characterId>`, and a restart clears
// every flag, so a new game rolls again. Malachar is not called from here — the dashboard hands him the
// result as a stage direction so he narrates it in his own voice. He never decides the item.

export const dynamic = "force-dynamic"

const CAMPAIGN = "ashes-of-prometheus"

export async function GET(req: Request) {
  const characterId = new URL(req.url).searchParams.get("characterId")
  if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 })
  try {
    const db = createAdminClient()
    const { data } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", fortuneFlagKey(characterId)).maybeSingle()
    return NextResponse.json(data?.value ? { rolled: true, fortune: data.value } : { rolled: false })
  } catch (e) {
    return NextResponse.json({ rolled: false, error: e instanceof Error ? e.message : "unavailable" })
  }
}

export async function POST(req: Request) {
  let body: { characterId?: string; claimToken?: string; days?: number; d20?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const { characterId, claimToken } = body
  const days = Number(body.days), d20 = Number(body.d20)
  if (!characterId || !claimToken) return NextResponse.json({ error: "characterId and claimToken required" }, { status: 400 })
  if (!Number.isInteger(days) || days < 1 || days > DAYS_DIE) return NextResponse.json({ error: `days must be a d${DAYS_DIE}` }, { status: 400 })
  if (!Number.isInteger(d20) || d20 < 1 || d20 > FORTUNE_DIE) return NextResponse.json({ error: `d20 must be a d${FORTUNE_DIE}` }, { status: 400 })

  let db
  try { db = createAdminClient() } catch { return NextResponse.json({ error: "server" }, { status: 500 }) }

  // --- the claim, as /api/chat checks it -------------------------------------
  const { data: secret } = await db.from("character_secrets").select("claim_token").eq("character_id", characterId).maybeSingle()
  if (!secret || secret.claim_token !== claimToken) return NextResponse.json({ error: "Invalid character claim" }, { status: 403 })
  const { data: ch } = await db.from("characters").select("id, name, is_player").eq("id", characterId).is("archived_at", null).maybeSingle()
  if (!ch) return NextResponse.json({ error: "Invalid character claim" }, { status: 403 })

  // --- once per run ------------------------------------------------------------
  const key = fortuneFlagKey(characterId)
  const { data: already } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", key).maybeSingle()
  if (already?.value) return NextResponse.json({ ok: true, repeated: true, fortune: already.value })

  // --- the row ------------------------------------------------------------------
  const total = days + d20
  const row = scavengedRow(total)
  if (!row) return NextResponse.json({ error: `total ${total} is off the table` }, { status: 400 })

  // --- the item, from the catalog by slug ----------------------------------------
  let awarded: { name: string; item_id: string } | null = null
  let problem: string | null = null
  if (row.slug) {
    const { data: item, error: itemErr } = await db
      .from("items")
      .select("id, name, description, item_type, icon_url, equippable_slot, weight, value")
      .eq("slug", row.slug)
      .maybeSingle()
    if (itemErr || !item) {
      // The book names it and the catalog lacks it: award nothing and say so, rather than invent a row.
      problem = `catalog has no item with slug "${row.slug}"`
      console.error("[fortune]", problem, itemErr?.message ?? "")
    } else {
      const { error: insErr } = await db.from("inventory_items").insert({
        character_id: characterId,
        name: item.name,
        quantity: 1,
        description: item.description,
        item_type: item.item_type,
        icon_url: item.icon_url,
        item_id: item.id,
        equippable_slot: item.equippable_slot,
        weight: item.weight,
        value: item.value,
      })
      if (insErr) { problem = insErr.message; console.error("[fortune] award failed:", insErr.message) }
      else awarded = { name: item.name, item_id: item.id }
    }
  }

  const fortune = { days, d20, total, text: row.text, item: awarded?.name ?? null, itemId: awarded?.item_id ?? null, at: new Date().toISOString() }
  const { error: flagErr } = await db.from("world_flags").upsert(
    { campaign_id: CAMPAIGN, key, value: fortune, set_by: "fortune-roll", note: `${ch.name}: ${row.text}` },
    { onConflict: "campaign_id,key" },
  )
  if (flagErr) console.error("[fortune] flag not written:", flagErr.message)

  // The line for the shared log, written here so every browser sees it even if the roller's own
  // announcement raced the award.
  const line = fortuneLine(ch.name, days, d20, row)
  await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text: line })

  return NextResponse.json({ ok: true, fortune, line, problem })
}
