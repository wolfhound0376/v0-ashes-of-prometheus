// The camp crafting menu for one character (camp doc §16).
//
// Sam (27 Sep 2026): "When you choose crafting in camp there should be a list
// (Alchemy, Construct, Artifice). Options available light up if you have the
// proficiency and items."
//
//   GET ?characterId=<uuid>  → { menu: { alchemy, construct, artifice } }
//
// Read-only. Every recipe is a catalog item carrying `properties.craft`, so
// the menu can never offer something the catalog does not hold. Whether an
// option lights up is lib/camp `craftMenu`, pure and tested; this route only
// gathers the rows: the recipes, the character's tool proficiencies and coin
// purse, what they carry, and the facilities of the node the party is on.
//
// Nothing here is secret — proficiencies, purse and pack are already on the
// sheet the player sees — so the read is not claim-gated. It uses the service
// role only because inventory and the travel graph are not all anon-readable.

import { createAdminClient } from "@/lib/supabase/admin"
import { craftMenu, type CarriedItem, type CraftMenuRecipeRow } from "@/lib/camp"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(req: Request) {
  const characterId = new URL(req.url).searchParams.get("characterId")
  if (!characterId || !UUID.test(characterId)) {
    return Response.json({ error: "characterId required" }, { status: 400 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (error) {
    console.error("[craft-menu] admin client unavailable:", error)
    return Response.json({ error: "server_unavailable" }, { status: 500 })
  }

  const { data: character, error: charError } = await admin
    .from("characters")
    .select("id, sheet_proficiencies, sheet_currency")
    .eq("id", characterId)
    .is("archived_at", null)
    .maybeSingle()
  if (charError) {
    console.error("[craft-menu] character:", charError.message)
    return Response.json({ error: "read_failed" }, { status: 500 })
  }
  if (!character) return Response.json({ error: "not_found" }, { status: 404 })

  const [{ data: recipes }, { data: pack }, { data: pos }] = await Promise.all([
    admin.from("items").select("id, slug, name, value, properties").not("properties->craft", "is", null),
    admin.from("inventory_items").select("name, quantity, items(slug)").eq("character_id", characterId),
    admin.from("party_position").select("node_id").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ])

  let facilities: string[] = []
  if (pos?.node_id) {
    const { data: node } = await admin.from("travel_nodes").select("metadata").eq("id", pos.node_id).maybeSingle()
    const f = (node?.metadata as { facilities?: unknown } | null)?.facilities
    if (Array.isArray(f)) facilities = f.filter((x): x is string => typeof x === "string")
  }

  const carried: CarriedItem[] = (pack ?? []).map((r: { name: string; quantity: number | null; items: { slug: string | null } | { slug: string | null }[] | null }) => {
    const linked = Array.isArray(r.items) ? r.items[0] : r.items
    return { name: r.name, quantity: r.quantity, slug: linked?.slug ?? null }
  })
  const tools = (character.sheet_proficiencies as { tools?: unknown } | null)?.tools

  const menu = craftMenu({
    recipes: (recipes ?? []) as CraftMenuRecipeRow[],
    proficiencies: Array.isArray(tools) ? tools.filter((t): t is string => typeof t === "string") : [],
    carried,
    currency: character.sheet_currency,
    facilities,
  })
  return Response.json({ menu })
}
