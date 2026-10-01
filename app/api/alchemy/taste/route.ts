// Eat It And See — tasting an ingredient to learn what it does.
//
//   GET  ?characterId=…            → every ingredient column this character knows
//   POST {characterId, itemSlug, save}
//                                  → taste one ingredient; records the reveal
//   POST {…, sandbox: true}        → rehearsal: resolve it, write NOTHING
//
// Sam's ruling (29 Sep): tasting an unknown is a DC 10 Constitution save, or
// column 1 happens to you at tier I. The reveal lands either way — see the
// long note in lib/eat-it-and-see.ts for why.
//
// A PLAYER VERB, fenced the same way /api/ground-items fences pickup and drop:
// not DM-gated, but it must name its own character and that character must
// exist. Per AGENTS.md §5 the characterId comes from the caller and is never
// read off sessions.active_character_id — that is the "one global seat" bug,
// and here it would write one player's discovery onto another's sheet.
//
// THE DICE ARE NOT ROLLED HERE. The board owns them
// (components/dice/dice-provider) and Malachar narrates the exact total and
// never re-rolls it. This route takes the total the player already rolled.
//
// SANDBOX MODE resolves the taste and returns the same payload without
// touching character_known_effects or the dialogue log. It exists because the
// only way to see what tasting timmask does was to actually feed it to a
// player and permanently teach them something — a rehearsal that cannot be
// un-rehearsed is not a rehearsal. Same reasoning as /api/sandbox's
// rehearsal map and the `sandbox=1` flag on /api/ground-items.
//
// Service role, because character_known_effects is public-read and has no
// anon write policy by design — the same conclusion the cinematic_views
// telemetry problem reached.
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { quiet, sandboxRefused } from "@/lib/alchemy-sandbox-server"
import { taste, isGrid, unknownColumns } from "@/lib/eat-it-and-see"

export const dynamic = "force-dynamic"

/** The board's log is the dialogue feed; the HUD is already subscribed. */
async function narrate(db: ReturnType<typeof createAdminClient>, text: string) {
  await db.from("dialogue").insert({ speaker: "Malachar", text, channel: "dm" })
}

export async function GET(req: NextRequest) {
  const characterId = req.nextUrl.searchParams.get("characterId")
  { const refused = sandboxRefused(req, characterId); if (refused) return refused }
  if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 })

  const db = createAdminClient()
  const { data, error } = await db
    .from("character_known_effects")
    .select("item_slug, column_index, learned_via, learned_at")
    .eq("character_id", characterId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group by ingredient so the dashboard can render "3 of 4 known" per row.
  const byItem: Record<string, { known: number[]; via: Record<number, string> }> = {}
  for (const row of data ?? []) {
    const slug = row.item_slug as string
    const col = row.column_index as number
    byItem[slug] ??= { known: [], via: {} }
    byItem[slug].known.push(col)
    byItem[slug].via[col] = row.learned_via as string
  }
  for (const v of Object.values(byItem)) v.known.sort((a, b) => a - b)

  return NextResponse.json({
    characterId,
    ingredients: Object.entries(byItem).map(([slug, v]) => ({
      itemSlug: slug,
      known: v.known,
      unknown: unknownColumns(v.known),
      learnedVia: v.via,
    })),
  })
}

export async function POST(req: NextRequest) {
  let body: { characterId?: string; itemSlug?: string; save?: number; sandbox?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 })
  }

  const { characterId, itemSlug } = body
  { const refused = sandboxRefused(req, characterId); if (refused) return refused }
  const sandbox = body.sandbox === true
  const save = Number(body.save)
  if (!characterId || !itemSlug) {
    return NextResponse.json({ error: "characterId and itemSlug required" }, { status: 400 })
  }
  if (!Number.isFinite(save)) {
    return NextResponse.json({ error: "save must be the d20 total you rolled" }, { status: 400 })
  }

  const db = createAdminClient()

  // Never .single() on a query that might match zero rows — AGENTS.md §8,
  // the bug that silently skipped every item award in production.
  const { data: character } = await db
    .from("characters").select("id, name").eq("id", characterId).maybeSingle()
  if (!character) return NextResponse.json({ error: "no such character" }, { status: 404 })

  const { data: item } = await db
    .from("items").select("slug, name, alchemy_effects").eq("slug", itemSlug).maybeSingle()
  if (!item) return NextResponse.json({ error: "no such item" }, { status: 404 })

  if (!isGrid(item.alchemy_effects)) {
    return NextResponse.json(
      { error: `${item.name} is not an alchemy ingredient`, reason: "not_an_ingredient" },
      { status: 422 },
    )
  }

  const { data: knownRows } = await db
    .from("character_known_effects")
    .select("column_index")
    .eq("character_id", characterId)
    .eq("item_slug", itemSlug)
  const known = (knownRows ?? []).map((r) => r.column_index as number)

  const firstEffect = item.alchemy_effects[0] as string
  const { data: effectRow } = await db
    .from("alchemy_effects").select("slug, name, summary, is_harmful")
    .eq("slug", firstEffect).maybeSingle()

  const result = taste({
    grid: item.alchemy_effects,
    known,
    save,
    harmful: Boolean(effectRow?.is_harmful),
  })
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 422 })

  // Rehearsal stops here: everything above is a read, everything below writes.
  if (result.revealed && !sandbox) {
    // on conflict do nothing: two browsers tasting at once must not 409.
    const { error } = await db
      .from("character_known_effects")
      .upsert(
        { character_id: characterId, item_slug: itemSlug, column_index: 1, learned_via: "taste" },
        { onConflict: "character_id,item_slug,column_index", ignoreDuplicates: true },
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!sandbox) {
    if (!quiet(characterId)) await narrate(db, `${character.name} tastes ${item.name}. ${result.summary}`)
  }

  return NextResponse.json({
    sandbox,
    character: character.name,
    item: item.name,
    itemSlug,
    effect: result.effect,
    effectName: effectRow?.name ?? result.effect,
    effectSummary: effectRow?.summary ?? null,
    harmful: Boolean(effectRow?.is_harmful),
    revealed: result.revealed,
    firstTime: result.firstTime,
    resisted: result.resisted,
    applied: result.applied,
    dc: result.dc,
    stillUnknown: unknownColumns(result.revealed ? [...known, 1] : known),
    summary: result.summary,
  })
}
