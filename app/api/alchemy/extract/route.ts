// Extraction — prepare one raw ingredient so it can go into a brew.
//
//   POST {characterId, itemSlug, check, die}   → prepare one; writes the pack
//   POST {…, sandbox: true}                    → rehearsal: resolve, write NOTHING
//
// Rules in lib/extraction.ts (Sam's "Yes", 2026-10-01). This route reads the
// pack, applies the outcome, and rolls nothing: the board's dice are the
// truth, and the caller sends the TOTAL and the FACE, exactly as
// /api/alchemy/brew does.
//
// A prepared ingredient is the SAME catalogue item with instance data in
// inventory_items.prep — nothing new is minted, so the "AI cannot invent
// items" rule holds. It lives on its own row, named "Bluecap (ground)", so it
// can never stack back onto the raw ones.
//
// A PLAYER VERB, fenced like /api/alchemy/taste and /api/alchemy/brew: the
// characterId comes from the caller, never from sessions.active_character_id
// (AGENTS.md §5).
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isGrid } from "@/lib/eat-it-and-see"
import { extract, isPrep, methodOf, preparedName, METHOD_TOOL, type PrepBlob } from "@/lib/extraction"
import { preparedArt } from "@/lib/alchemy-art"

export const dynamic = "force-dynamic"

type Db = ReturnType<typeof createAdminClient>

async function narrate(db: Db, text: string) {
  await db.from("dialogue").insert({ speaker: "Malachar", text, channel: "dm" })
}

export async function POST(req: NextRequest) {
  let body: { characterId?: string; itemSlug?: string; check?: number; die?: number; sandbox?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 })
  }
  const { characterId, itemSlug } = body
  const sandbox = body.sandbox === true
  if (!characterId || !itemSlug) return NextResponse.json({ error: "characterId and itemSlug required" }, { status: 400 })

  const db = createAdminClient()
  const { data: character } = await db.from("characters").select("id, name").eq("id", characterId).maybeSingle()
  if (!character) return NextResponse.json({ error: "no such character" }, { status: 404 })

  const { data: item } = await db
    .from("items")
    .select("id, slug, name, description, item_type, weight, value, icon_url, alchemy_effects, properties")
    .eq("slug", itemSlug)
    .maybeSingle()
  if (!item) return NextResponse.json({ error: "no such item" }, { status: 404 })
  if (!isGrid(item.alchemy_effects)) {
    return NextResponse.json({ error: `${item.name} is not an alchemy ingredient`, reason: "not_an_ingredient" }, { status: 422 })
  }
  const method = methodOf(item.slug as string, item.properties)
  if (!method) {
    return NextResponse.json({ error: `nobody has said how ${item.name} is prepared`, reason: "no_method" }, { status: 422 })
  }

  const { data: rows } = await db
    .from("inventory_items")
    .select("id, name, quantity, item_id, prep")
    .eq("character_id", characterId)
  const mine = (rows ?? []).filter((r) => (r.item_id ? r.item_id === item.id : r.name === item.name))
  const raw = mine.find((r) => !r.prep && (r.quantity ?? 1) > 0)
  if (!raw) {
    return NextResponse.json({ error: `no raw ${item.name} in this pack to prepare`, reason: "not_held_raw" }, { status: 422 })
  }

  const { data: knownRows } = await db
    .from("character_known_effects")
    .select("column_index")
    .eq("character_id", characterId)
    .eq("item_slug", item.slug)
  const known = (knownRows ?? []).map((k) => k.column_index as number)

  const result = extract({ check: Number(body.check), die: Number(body.die), knownColumns: known })
  if (!result.ok) {
    return NextResponse.json({ error: "check must be the d20 total and die the face it showed (1-20)" }, { status: 400 })
  }

  const learnedEffect = result.learnColumn ? item.alchemy_effects[result.learnColumn - 1] : null
  let learned: { column: number; effect: string; name: string } | null = null
  if (learnedEffect) {
    const { data: e } = await db.from("alchemy_effects").select("slug, name").eq("slug", learnedEffect).maybeSingle()
    learned = { column: result.learnColumn!, effect: learnedEffect, name: (e?.name as string) ?? learnedEffect }
  }

  const bruised = result.outcome === "bruised"
  const name = preparedName(item.name as string, method, bruised)

  if (!sandbox) {
    // The prepared one goes in FIRST, so a refused write never costs the raw one.
    if (result.outcome !== "ruined") {
      const same = mine.find((r) => isPrep(r.prep) && r.prep.method === method && r.prep.bruised === bruised)
      if (same) {
        const { error } = await db.from("inventory_items").update({ quantity: (same.quantity ?? 1) + 1 }).eq("id", same.id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      } else {
        const prep: PrepBlob = { method, bruised, prepared_by: characterId, prepared_at: new Date().toISOString() }
        const { error } = await db.from("inventory_items").insert({
          character_id: characterId,
          name,
          quantity: 1,
          item_id: item.id,
          description: item.description,
          item_type: item.item_type,
          weight: item.weight,
          value: item.value,
          // The prepared row wears the prepared painting when Sam has approved one.
          icon_url: preparedArt(item.slug as string) ?? item.icon_url,
          prep,
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    const left = (raw.quantity ?? 1) - 1
    if (left <= 0) await db.from("inventory_items").delete().eq("id", raw.id)
    else await db.from("inventory_items").update({ quantity: left }).eq("id", raw.id)

    if (learned) {
      const { error } = await db.from("character_known_effects").upsert(
        { character_id: characterId, item_slug: item.slug, column_index: learned.column, learned_via: "extract" },
        { onConflict: "character_id,item_slug,column_index", ignoreDuplicates: true },
      )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await narrate(
      db,
      `${character.name} works ${item.name} with the ${METHOD_TOOL[method]}. ${result.summary}` +
        (learned ? ` (Learns: ${learned.name}.)` : ""),
    )
  }

  return NextResponse.json({
    sandbox,
    character: character.name,
    item: item.name,
    itemSlug: item.slug,
    method,
    tool: METHOD_TOOL[method],
    outcome: result.outcome,
    preparedName: result.outcome === "ruined" ? null : name,
    learned,
    dc: result.dc,
    summary: result.summary,
  })
}
