// A cleric consecrates a brewing base.
//
//   POST {characterId, kind: "blessed-water" | "holy-water"}  → make one
//   POST {…, sandbox: true}                                   → rehearsal, writes NOTHING
//
// Rules in lib/alchemy-cleric.ts:
//   blessed water: a glass vial and the cleric's camp action (HOMEBREW)
//   holy water: a glass vial, one 25 gp measure of powdered silver and a
//     1st-level slot (PHB p.151)
//
// The new flask goes in FIRST, then the costs are taken, so a refused write
// never costs the cleric anything. A PLAYER VERB, fenced like the other alchemy
// routes: the characterId is the caller's own (AGENTS.md §5).
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  BLESSED_WATER_SLUG, HOLY_WATER_SLUG, HOLY_WATER_SLOT_LEVEL, POWDERED_SILVER_SLUG, VIAL_SLUG,
  canBless, canMakeHolyWater, spendSlot,
} from "@/lib/alchemy-cleric"
import { catalogRow, count, giveOne, plainHeld, takeOne } from "@/lib/alchemy-pack-ops"
import type { RiteSheet } from "@/lib/camp-rites"
import { spendCampAction } from "@/lib/camp"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  let body: { characterId?: string; kind?: string; sandbox?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 })
  }
  const { characterId, kind } = body
  const sandbox = body.sandbox === true
  if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 })
  if (kind !== BLESSED_WATER_SLUG && kind !== HOLY_WATER_SLUG) {
    return NextResponse.json({ error: `kind must be ${BLESSED_WATER_SLUG} or ${HOLY_WATER_SLUG}` }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: character } = await db
    .from("characters").select("id, name, class, sheet_spellcasting, rest_actions_remaining").eq("id", characterId).maybeSingle()
  if (!character) return NextResponse.json({ error: "no such character" }, { status: 404 })
  const sheet = character as unknown as RiteSheet

  const [vial, silver, product] = await Promise.all([
    catalogRow(db, VIAL_SLUG), catalogRow(db, POWDERED_SILVER_SLUG), catalogRow(db, kind),
  ])
  if (!vial || !product || (kind === HOLY_WATER_SLUG && !silver)) {
    return NextResponse.json({ error: "the catalogue is missing a row this needs", reason: "no_catalog_row" }, { status: 503 })
  }
  const vials = await plainHeld(db, characterId, vial)
  const silvers = silver ? await plainHeld(db, characterId, silver) : []
  const holdings = { vials: count(vials), silver: count(silvers) }

  const gate = kind === BLESSED_WATER_SLUG ? canBless(sheet, holdings) : canMakeHolyWater(sheet, holdings)
  if (!gate.ok) return NextResponse.json({ error: gate.reason, reason: "not_able" }, { status: 422 })

  // A rite at camp is the cleric's camp action (Sam, 2026-10-01): it is "pray"
  // on the camp menu (lib/camp.ts), and the budget is rest_actions_remaining.
  const spend = spendCampAction(character.rest_actions_remaining as number | null, "pray")
  if (!spend.ok) return NextResponse.json({ error: `${character.name} has no camp action left this rest.`, reason: "no_camp_action" }, { status: 422 })

  const summary =
    kind === BLESSED_WATER_SLUG
      ? `${character.name} prays over a vial of water. It is blessed.`
      : `${character.name} spends an hour, a measure of powdered silver and a 1st-level slot on the rite. Holy water.`

  if (!sandbox) {
    const err = await giveOne(db, characterId, product)
    if (err) return NextResponse.json({ error: err }, { status: 500 })
    const e1 = await takeOne(db, vials[0])
    if (e1) return NextResponse.json({ error: e1 }, { status: 500 })
    if (kind === HOLY_WATER_SLUG) {
      const e2 = await takeOne(db, silvers[0])
      if (e2) return NextResponse.json({ error: e2 }, { status: 500 })
      const sc = (character.sheet_spellcasting ?? {}) as { slots?: Record<string, { max?: number; used?: number }> }
      const slot = gate.ok && "slot" in gate ? (gate.slot as number) : HOLY_WATER_SLOT_LEVEL
      const { error } = await db.from("characters").update({ sheet_spellcasting: spendSlot(sc, slot) }).eq("id", characterId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const { error: e9 } = await db.from("characters").update({ rest_actions_remaining: spend.remaining }).eq("id", characterId)
    if (e9) return NextResponse.json({ error: e9.message }, { status: 500 })
    await db.from("dialogue").insert({ speaker: "Malachar", text: `${summary} (${spend.note})`, channel: "dm" })
  }

  return NextResponse.json({ sandbox, character: character.name, made: product.name, kind, summary })
}
