import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ensureKnacks } from "@/lib/item-knack-rows"

// ============================================================================
// /api/item-knack — "what is this copy's own bonus?"
//
//   POST { character_id, inventory_item_id } → { stats_bonus: {...} | null }
//
// The dashboard's doll writes the worn row itself, from the browser, and
// cannot see inventory_items.stats_bonus through the view it reads. It asks
// here just before it equips, so a cloak put on from the dashboard carries
// the same knack as one put on from the map (/api/equipment). Asking also
// rolls any knack that has not been rolled yet (lib/item-knack-rows.ts).
//
// It only ever answers about a row that character is carrying.
// ============================================================================

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const characterId = String(body?.character_id ?? "")
  const rowId = String(body?.inventory_item_id ?? "")
  if (!characterId || !rowId) return NextResponse.json({ error: "character_id and inventory_item_id required" }, { status: 400 })
  const knacks = await ensureKnacks(createAdminClient(), characterId)
  return NextResponse.json({ stats_bonus: knacks.get(rowId) ?? null })
}
