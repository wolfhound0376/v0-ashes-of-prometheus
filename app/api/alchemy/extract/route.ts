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
import { quiet, sandboxRefused } from "@/lib/alchemy-sandbox-server"
import { isGrid } from "@/lib/eat-it-and-see"
import { extract, isPrep, methodOf, preparedName, METHOD_TOOL, type PrepBlob } from "@/lib/extraction"
import { preparedArt } from "@/lib/alchemy-art"
import { spendCampAction } from "@/lib/camp"

export const dynamic = "force-dynamic"

type Db = ReturnType<typeof createAdminClient>

async function narrate(db: Db, text: string) {
  await db.from("dialogue").insert({ speaker: "Malachar", text, channel: "dm" })
}

type Entry = { itemSlug: string; check: number; die: number }
type Failure = { error: string; reason?: string; status: number }

/** One ingredient through the rule. Writes nothing in sandbox. */
async function prepareOne(db: Db, characterId: string, characterName: string, entry: Entry, sandbox: boolean) {
  const itemSlug = entry.itemSlug
  const { data: item } = await db
    .from("items")
    .select("id, slug, name, description, item_type, weight, value, icon_url, alchemy_effects, properties")
    .eq("slug", itemSlug)
    .maybeSingle()
  if (!item) return { error: "no such item", status: 404 }
  if (!isGrid(item.alchemy_effects)) {
    return { error: `${item.name} is not an alchemy ingredient`, reason: "not_an_ingredient", status: 422 }
  }
  const method = methodOf(item.slug as string, item.properties)
  if (!method) {
    return { error: `nobody has said how ${item.name} is prepared`, reason: "no_method", status: 422 }
  }

  const { data: rows } = await db
    .from("inventory_items")
    .select("id, name, quantity, item_id, prep")
    .eq("character_id", characterId)
  const mine = (rows ?? []).filter((r) => (r.item_id ? r.item_id === item.id : r.name === item.name))
  const raw = mine.find((r) => !r.prep && (r.quantity ?? 1) > 0)
  if (!raw) {
    return { error: `no raw ${item.name} in this pack to prepare`, reason: "not_held_raw", status: 422 }
  }

  const { data: knownRows } = await db
    .from("character_known_effects")
    .select("column_index")
    .eq("character_id", characterId)
    .eq("item_slug", item.slug)
  const known = (knownRows ?? []).map((k) => k.column_index as number)

  const result = extract({ check: Number(entry.check), die: Number(entry.die), knownColumns: known })
  if (!result.ok) {
    return { error: "check must be the d20 total and die the face it showed (1-20)", status: 400 }
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
        if (error) return { error: error.message, status: 500 }
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
        if (error) return { error: error.message, status: 500 }
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
      if (error) return { error: error.message, status: 500 }
    }

    if (!quiet(characterId)) await narrate(
      db,
      `${characterName} works ${item.name} with the ${METHOD_TOOL[method]}. ${result.summary}` +
        (learned ? ` (Learns: ${learned.name}.)` : ""),
    )
  }

  return {
    ok: true as const,
    item: item.name,
    itemSlug: item.slug,
    method,
    tool: METHOD_TOOL[method],
    outcome: result.outcome,
    preparedName: result.outcome === "ruined" ? null : name,
    learned,
    dc: result.dc,
    summary: result.summary,
  }
}

/** Up to three raw ingredients in one sitting — one camp action for the lot
 *  (Sam, 2026-10-01: extraction costs a camp action. One action PER
 *  INGREDIENT would make a two-ingredient brew cost a whole rest's budget
 *  before the brew itself, so a sitting prepares up to three). Each one is
 *  still its own roll. */
export const MAX_PER_SITTING = 3

export async function POST(req: NextRequest) {
  let body: { characterId?: string; itemSlug?: string; check?: number; die?: number; items?: unknown; sandbox?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 })
  }
  const { characterId } = body
  { const refused = sandboxRefused(req, characterId); if (refused) return refused }
  const sandbox = body.sandbox === true
  const entries: Entry[] = Array.isArray(body.items)
    ? (body.items as Entry[]).filter((e) => e && typeof e.itemSlug === "string")
    : body.itemSlug ? [{ itemSlug: body.itemSlug, check: Number(body.check), die: Number(body.die) }] : []
  if (!characterId || entries.length === 0) {
    return NextResponse.json({ error: "characterId and 1-3 items ({itemSlug, check, die}) required" }, { status: 400 })
  }
  if (entries.length > MAX_PER_SITTING) {
    return NextResponse.json({ error: `a sitting prepares at most ${MAX_PER_SITTING}` }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: character } = await db.from("characters").select("id, name, rest_actions_remaining").eq("id", characterId).maybeSingle()
  if (!character) return NextResponse.json({ error: "no such character" }, { status: 404 })

  // The sitting is a camp action ("brew" on the camp menu, lib/camp.ts).
  const spend = spendCampAction(character.rest_actions_remaining as number | null, "brew")
  if (!spend.ok) {
    return NextResponse.json({ error: `${character.name} has no camp action left this rest.`, reason: "no_camp_action" }, { status: 422 })
  }

  const results: Array<Awaited<ReturnType<typeof prepareOne>>> = []
  for (const e of entries) results.push(await prepareOne(db, characterId, character.name as string, e, sandbox))
  const done = results.filter((r): r is Extract<typeof r, { ok: true }> => "ok" in r)
  const failed = results.filter((r): r is Failure => !("ok" in r))

  // Nothing went on the bench at all: no action spent.
  if (done.length === 0) {
    const f = failed[0]
    return NextResponse.json({ error: f.error, reason: f.reason ?? null, results }, { status: f.status })
  }
  if (!sandbox) {
    const { error } = await db.from("characters").update({ rest_actions_remaining: spend.remaining }).eq("id", characterId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    sandbox,
    character: character.name,
    campAction: spend.note,
    results,
    // The single-ingredient shape, for callers that sent one.
    ...(entries.length === 1 && "ok" in results[0] ? results[0] : {}),
    summary: done.map((d) => `${d.item}: ${d.summary}`).join(" "),
  })
}
