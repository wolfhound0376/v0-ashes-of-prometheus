// Making a drink at the bench.
//
//   POST {characterId, drinkSlug}   → make one; uses up what it is made from
//   POST {…, sandbox: true}         → rehearsal, writes NOTHING
//
// Rules in lib/drink-making.ts. The drink goes in FIRST, then what it was made
// from is taken, so a refused write never costs anything. Ingredients must be
// PREPARED (lib/extraction.ts) — clean ones before bruised; another drink in
// the recipe (communion wine ← mushroom wine) is used as it is.
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { quiet, sandboxRefused } from "@/lib/alchemy-sandbox-server"
import { canMake, STILL_SLUG } from "@/lib/drink-making"
import { isDrinkData } from "@/lib/inebriation"
import { isPrep } from "@/lib/extraction"
import { catalogRow, giveOne, takeOne, type PackRow } from "@/lib/alchemy-pack-ops"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  let body: { characterId?: string; drinkSlug?: string; sandbox?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 })
  }
  const { characterId, drinkSlug } = body
  { const refused = sandboxRefused(req, characterId); if (refused) return refused }
  const sandbox = body.sandbox === true
  if (!characterId || !drinkSlug) return NextResponse.json({ error: "characterId and drinkSlug required" }, { status: 400 })

  const db = createAdminClient()
  const { data: character } = await db.from("characters").select("id, name, class").eq("id", characterId).maybeSingle()
  if (!character) return NextResponse.json({ error: "no such character" }, { status: 404 })

  const product = await catalogRow(db, drinkSlug)
  const { data: productProps } = await db.from("items").select("properties").eq("slug", drinkSlug).maybeSingle()
  const drink = (productProps?.properties as { drink?: unknown } | null)?.drink
  if (!product || !isDrinkData(drink)) return NextResponse.json({ error: "no such drink" }, { status: 404 })

  const { data: rows } = await db
    .from("inventory_items").select("id, name, quantity, item_id, prep, brew").eq("character_id", characterId)
  const pack = (rows ?? []) as PackRow[]

  // What each made_from entry can draw on.
  const sources = new Map<string, PackRow[]>()
  for (const slug of drink.made_from ?? []) {
    const item = await catalogRow(db, slug)
    if (!item) continue
    const { data: ip } = await db.from("items").select("alchemy_effects").eq("slug", slug).maybeSingle()
    const isIngredient = Array.isArray(ip?.alchemy_effects)
    const mine = pack.filter((r) => r.item_id === item.id && !r.brew && (r.quantity ?? 1) > 0)
    const usable = isIngredient
      ? mine.filter((r) => isPrep(r.prep)).sort((a, b) => Number(isPrep(a.prep) && a.prep.bruised) - Number(isPrep(b.prep) && b.prep.bruised))
      : mine.filter((r) => !r.prep)
    sources.set(slug, usable)
  }
  const still = await catalogRow(db, STILL_SLUG)
  const hasStill = !!still && pack.some((r) => r.item_id === still.id && (r.quantity ?? 1) > 0)
  const have = Object.fromEntries([...sources].map(([k, v]) => [k, v.reduce((n, r) => n + (r.quantity ?? 1), 0)]))

  const gate = canMake(product.name, drink, { character, have, hasStill })
  if (!gate.ok) return NextResponse.json({ error: gate.reason, reason: "cannot_make" }, { status: 422 })

  const summary = `${character.name} makes ${product.name}.`
  if (!sandbox) {
    const err = await giveOne(db, characterId, product)
    if (err) return NextResponse.json({ error: err }, { status: 500 })
    for (const slug of drink.made_from ?? []) {
      const row = sources.get(slug)?.[0]
      if (row) {
        const e = await takeOne(db, row)
        if (e) return NextResponse.json({ error: e }, { status: 500 })
      }
    }
    if (!quiet(characterId)) await db.from("dialogue").insert({ speaker: "Malachar", text: summary, channel: "dm" })
  }
  return NextResponse.json({
    sandbox, character: character.name, made: product.name, summary,
    // For the "what you made" window (Sam, 2026-10-01): what it is, and enough to toss one.
    drink: {
      slug: drinkSlug, name: product.name, class: String(drink.class), dc: Number(drink.save_dc), steps: Number(drink.steps_per_drink),
      description: (product as { description?: string | null }).description ?? null,
    },
  })
}
