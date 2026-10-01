// The alchemy SANDBOX — the DM's practice character (lib/alchemy-sandbox.ts).
//
//   POST {action: "restock", class?: "Wizard"|"Cleric", knowAll?: boolean}
//        → (re)creates the Sandbox Alchemist and gives it a full pack, every
//          rune mark, every recipe, two camp actions, sober, unhurt. Brewed
//          flasks and anything learned are wiped. knowAll also teaches every
//          ingredient's four effects, for testing combinations rather than
//          discovery.
//   POST {action: "refill"} → two camp actions again, nothing else touched.
//   POST {action: "ensure"} → restock only if the character does not exist yet.
//
// DM-GATED (x-dm-key). Writes only the practice character's own rows; never
// the dialogue log, never a real character.
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { dmAuthorized } from "@/lib/alchemy-sandbox-server"
import {
  SANDBOX_CHARACTER_ID, SANDBOX_CAMP_ACTIONS, STOCK_BASE_SLUGS, isSandboxClass, sandboxSheet, stockRows, type CatalogRow,
} from "@/lib/alchemy-sandbox"
import { isGrid } from "@/lib/eat-it-and-see"
import { preparedArt } from "@/lib/alchemy-art"
import { RUNE_SCHOOLS } from "@/lib/alchemy-runes"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  if (!dmAuthorized(req)) return NextResponse.json({ error: "the alchemy sandbox is the DM's" }, { status: 403 })
  let body: { action?: string; class?: unknown; knowAll?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 })
  }
  const db = createAdminClient()
  const id = SANDBOX_CHARACTER_ID

  if (body.action === "refill") {
    const { error } = await db.from("characters").update({ rest_actions_remaining: SANDBOX_CAMP_ACTIONS }).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, campActions: SANDBOX_CAMP_ACTIONS })
  }
  // "ensure": make the practice character the first time; leave it alone after.
  if (body.action === "ensure") {
    const { data: there } = await db.from("characters").select("id").eq("id", id).maybeSingle()
    if (there) return NextResponse.json({ ok: true, characterId: id, created: false })
  } else if (body.action !== "restock") {
    return NextResponse.json({ error: "action must be ensure, restock or refill" }, { status: 400 })
  }

  // Keep the class it already has unless a new one was asked for.
  const { data: existing } = await db.from("characters").select("class").eq("id", id).maybeSingle()
  const cls = isSandboxClass(body.class) ? body.class : isSandboxClass(existing?.class) ? existing.class : "Wizard"
  const { error: upErr } = await db.from("characters").upsert(sandboxSheet(cls), { onConflict: "id" })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // A clean slate: pack, learned effects, marks, recipes.
  for (const t of ["inventory_items", "character_known_effects", "character_known_runes", "character_known_recipes"] as const) {
    const { error } = await db.from(t).delete().eq("character_id", id)
    if (error) return NextResponse.json({ error: `${t}: ${error.message}` }, { status: 500 })
  }

  const cols = "id, slug, name, description, item_type, weight, value, icon_url, alchemy_effects, properties"
  const [{ data: grid }, { data: drinks }, { data: bases }, { data: recipes }] = await Promise.all([
    db.from("items").select(cols).not("alchemy_effects", "is", null),
    db.from("items").select(cols).not("properties->drink", "is", null),
    db.from("items").select(cols).in("slug", STOCK_BASE_SLUGS),
    db.from("items").select("slug, properties").not("properties->recipe", "is", null),
  ])
  const catalog = [...(grid ?? []), ...(drinks ?? []), ...(bases ?? [])] as CatalogRow[]
  const seen = new Set<string>()
  const rows = stockRows(catalog.filter((c) => !seen.has(c.slug) && seen.add(c.slug)), preparedArt)
  const { error: invErr } = await db.from("inventory_items").insert(rows)
  if (invErr) return NextResponse.json({ error: `inventory: ${invErr.message}` }, { status: 500 })

  // Every mark, so every school's sigil can be seen on the vessel.
  const { error: runeErr } = await db
    .from("character_known_runes")
    .insert(RUNE_SCHOOLS.map((school) => ({ character_id: id, school, learned_via: "dm" })))
  if (runeErr) return NextResponse.json({ error: `runes: ${runeErr.message}` }, { status: 500 })

  // Every recipe the catalogue holds that names its ingredients.
  const recipeSlugs = (recipes ?? [])
    .filter((r) => {
      const ing = (r.properties as { recipe?: { ingredients?: unknown } } | null)?.recipe?.ingredients
      return Array.isArray(ing) && ing.length >= 2
    })
    .map((r) => r.slug as string)
  if (recipeSlugs.length) {
    const { error } = await db
      .from("character_known_recipes")
      .insert(recipeSlugs.map((recipe_slug) => ({ character_id: id, recipe_slug, learned_via: "dm" })))
    if (error) return NextResponse.json({ error: `recipes: ${error.message}` }, { status: 500 })
  }

  let known = 0
  if (body.knowAll === true) {
    const all = (grid ?? []).filter((g) => isGrid(g.alchemy_effects)).flatMap((g) =>
      [1, 2, 3, 4].map((column_index) => ({ character_id: id, item_slug: g.slug as string, column_index, learned_via: "dm" })),
    )
    const { error } = await db.from("character_known_effects").insert(all)
    if (error) return NextResponse.json({ error: `effects: ${error.message}` }, { status: 500 })
    known = all.length
  }

  return NextResponse.json({
    ok: true, characterId: id, class: cls, items: rows.length, runes: RUNE_SCHOOLS.length,
    recipes: recipeSlugs.length, knownEffects: known, campActions: SANDBOX_CAMP_ACTIONS,
  })
}
