// Drinking a DRINK (beer, wine, liquor) — the inebriation ladder.
// A brewed POTION is /api/alchemy/drink; this is the other kind of bottle.
//
//   GET  ?characterId=…&inventoryItemId=…   → the DC and steps; changes nothing
//   POST {characterId, inventoryItemId, save} → drink it: one fewer, level updated
//   POST {…, sandbox: true}                  → rehearsal, writes NOTHING
//
// Rules in lib/inebriation.ts (Sam's ladder; time sobers you, an hour a level).
// Drinkable anywhere, not just at the bench (Sam, 2026-10-01). The board rolls the CON save;
// this route takes the total and never rolls.
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { quiet, sandboxRefused } from "@/lib/alchemy-sandbox-server"
import { conditionsFor, isDrinkData, quaff, LEVEL_NAME, type InebriationRecord } from "@/lib/inebriation"
import { inebriationNow } from "@/lib/inebriation-server"

export const dynamic = "force-dynamic"

type Db = ReturnType<typeof createAdminClient>

async function load(db: Db, characterId: string, inventoryItemId: string) {
  const { data: character } = await db.from("characters").select("id, name, conditions, inebriation").eq("id", characterId).maybeSingle()
  if (!character) return { error: "no such character", status: 404 as const }
  const { data: row } = await db
    .from("inventory_items").select("id, name, quantity, item_id")
    .eq("id", inventoryItemId).eq("character_id", characterId).maybeSingle()
  if (!row?.item_id) return { error: "that is not a drink in this character's pack", status: 404 as const }
  const { data: item } = await db.from("items").select("slug, name, properties").eq("id", row.item_id).maybeSingle()
  const drink = (item?.properties as { drink?: unknown } | null)?.drink
  if (!item || !isDrinkData(drink)) return { error: `${row.name} is not a drink`, status: 422 as const }
  return { character, row, item, drink }
}

export async function GET(req: NextRequest) {
  const characterId = req.nextUrl.searchParams.get("characterId")
  { const refused = sandboxRefused(req, characterId); if (refused) return refused }
  const inventoryItemId = req.nextUrl.searchParams.get("inventoryItemId")
  if (!characterId || !inventoryItemId) return NextResponse.json({ error: "characterId and inventoryItemId required" }, { status: 400 })
  const db = createAdminClient()
  const l = await load(db, characterId, inventoryItemId)
  if ("error" in l) return NextResponse.json({ error: l.error }, { status: l.status })
  const level = (await inebriationNow(db, l.character)).record.level
  return NextResponse.json({
    item: l.row.name, class: l.drink.class,
    save: { ability: "CON", dc: Number(l.drink.save_dc) },
    stepsOnFail: Number(l.drink.steps_per_drink), maxLevel: l.drink.max_level ?? 4,
    level, levelName: LEVEL_NAME[level] || "sober",
  })
}

export async function POST(req: NextRequest) {
  let body: { characterId?: string; inventoryItemId?: string; save?: number; sandbox?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 })
  }
  const { characterId, inventoryItemId } = body
  { const refused = sandboxRefused(req, characterId); if (refused) return refused }
  const sandbox = body.sandbox === true
  if (!characterId || !inventoryItemId) return NextResponse.json({ error: "characterId and inventoryItemId required" }, { status: 400 })
  const save = Number(body.save)
  if (!Number.isFinite(save)) return NextResponse.json({ error: "roll the CON save first and send the total", reason: "needs_dice" }, { status: 400 })

  const db = createAdminClient()
  const l = await load(db, characterId, inventoryItemId)
  if ("error" in l) return NextResponse.json({ error: l.error }, { status: l.status })

  // Time first: whatever has worn off since the last drink is gone before
  // this one is judged. Then the drink, and its clock starts now.
  const now = await inebriationNow(db, l.character)
  const result = quaff(now.record.level, save, l.drink)
  const record: InebriationRecord = {
    ...now.record,
    level: result.after,
    since: new Date().toISOString(),
    since_game: now.gameNow,
  }
  const next = conditionsFor(now.conditions, record)

  if (!sandbox) {
    // The level is written first; only then is the drink taken, so a refused
    // write never costs the bottle.
    const { error } = await db
      .from("characters")
      .update({ conditions: next, inebriation: record.level === 0 && !record.hangover_until ? null : record })
      .eq("id", characterId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const left = (l.row.quantity ?? 1) - 1
    const { error: e1 } =
      left <= 0
        ? await db.from("inventory_items").delete().eq("id", l.row.id)
        : await db.from("inventory_items").update({ quantity: left }).eq("id", l.row.id)
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
    if (!quiet(characterId)) await db.from("dialogue").insert({ speaker: "Malachar", text: `${l.character.name} drinks ${l.item.name}. ${result.summary}`, channel: "dm" })
  }

  return NextResponse.json({ sandbox, character: l.character.name, item: l.item.name, ...result, conditions: next })
}
