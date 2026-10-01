// Toss what you just made. Sam, 2026-10-01: "when a potion or fermented drink
// is made it should open up a sub window showing you what you made and its
// properties, asking you if you want it or toss it."
//
//   POST {characterId, inventoryItemId}  → one brewed flask (its own row)
//   POST {characterId, drinkSlug}        → one of that drink, off its stack
//
// Only a brew or a fermented drink can be tossed here, and only out of the
// caller's own pack (AGENTS.md §5). Tossing is quiet: pouring a bad batch
// out is not news, so nothing is written to the shared log.
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sandboxRefused } from "@/lib/alchemy-sandbox-server"
import { isDrinkData } from "@/lib/inebriation"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  let body: { characterId?: string; inventoryItemId?: string; drinkSlug?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 })
  }
  const { characterId } = body
  { const refused = sandboxRefused(req, characterId); if (refused) return refused }
  if (!characterId || (!body.inventoryItemId && !body.drinkSlug)) {
    return NextResponse.json({ error: "characterId and inventoryItemId or drinkSlug required" }, { status: 400 })
  }
  const db = createAdminClient()

  let row: { id: string; name: string; quantity: number | null } | null = null
  if (body.inventoryItemId) {
    const { data } = await db
      .from("inventory_items").select("id, name, quantity, brew")
      .eq("id", body.inventoryItemId).eq("character_id", characterId).maybeSingle()
    if (!data?.brew) return NextResponse.json({ error: "that is not a brew in this pack" }, { status: 404 })
    row = data
  } else {
    const { data: item } = await db.from("items").select("id, properties").eq("slug", body.drinkSlug!).maybeSingle()
    if (!item || !isDrinkData((item.properties as { drink?: unknown } | null)?.drink)) {
      return NextResponse.json({ error: "that is not a drink" }, { status: 404 })
    }
    const { data } = await db
      .from("inventory_items").select("id, name, quantity, prep, brew")
      .eq("character_id", characterId).eq("item_id", item.id)
    row = (data ?? []).find((r) => !r.prep && !r.brew && (r.quantity ?? 1) > 0) ?? null
    if (!row) return NextResponse.json({ error: "none of that drink in this pack" }, { status: 404 })
  }

  const left = (row.quantity ?? 1) - 1
  const { error } = left <= 0
    ? await db.from("inventory_items").delete().eq("id", row.id)
    : await db.from("inventory_items").update({ quantity: left }).eq("id", row.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, tossed: row.name })
}
