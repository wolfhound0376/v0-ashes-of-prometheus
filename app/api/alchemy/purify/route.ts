// A cleric purifies a finished potion.
//
//   POST {characterId, inventoryItemId}   → purify one flask in this character's pack
//   POST {…, sandbox: true}               → rehearsal, writes NOTHING
//
// Purify Food and Drink (SRD, 1st level, ritual): no slot, but it must be
// prepared. House rule from the approved brief: impurity drops to 0 and potency
// drops one tier (floor I). "Dirty and strong, or clean and weak." Rules in
// lib/alchemy-cleric.ts.
//
// The flask must be in the CLERIC's own pack. A party member hands the cleric
// the flask first; this route never reaches into someone else's pack
// (AGENTS.md §5, the one-global-seat lesson).
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { quiet, sandboxRefused } from "@/lib/alchemy-sandbox-server"
import { canPurify, purified, PURIFY_SPELL } from "@/lib/alchemy-cleric"
import type { RiteSheet } from "@/lib/camp-rites"
import { spendCampAction } from "@/lib/camp"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  let body: { characterId?: string; inventoryItemId?: string; sandbox?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 })
  }
  const { characterId, inventoryItemId } = body
  { const refused = sandboxRefused(req, characterId); if (refused) return refused }
  const sandbox = body.sandbox === true
  if (!characterId || !inventoryItemId) {
    return NextResponse.json({ error: "characterId and inventoryItemId required" }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: character } = await db
    .from("characters").select("id, name, class, sheet_spellcasting, rest_actions_remaining").eq("id", characterId).maybeSingle()
  if (!character) return NextResponse.json({ error: "no such character" }, { status: 404 })

  const gate = canPurify(character as unknown as RiteSheet)
  if (!gate.ok) return NextResponse.json({ error: gate.reason, reason: "not_able" }, { status: 422 })

  // A rite at camp is the cleric's camp action (Sam, 2026-10-01): it is "pray"
  // on the camp menu (lib/camp.ts), and the budget is rest_actions_remaining.
  const spend = spendCampAction(character.rest_actions_remaining as number | null, "pray")
  if (!spend.ok) return NextResponse.json({ error: `${character.name} has no camp action left this rest.`, reason: "no_camp_action" }, { status: 422 })

  const { data: row } = await db
    .from("inventory_items")
    .select("id, name, quantity, brew")
    .eq("id", inventoryItemId)
    .eq("character_id", characterId)
    .maybeSingle()
  if (!row || !row.brew || typeof row.brew !== "object") {
    return NextResponse.json({ error: "that is not a brewed potion in this character's pack" }, { status: 404 })
  }
  const brew = row.brew as { potency: number; impurity: number } & Record<string, unknown>
  if (Number(brew.impurity) === 0) {
    return NextResponse.json({ error: "it is already clean", reason: "already_clean" }, { status: 422 })
  }

  const next = purified({ potency: Number(brew.potency), impurity: Number(brew.impurity) })
  const summary =
    `${character.name} casts ${PURIFY_SPELL} as a ritual over ${row.name}. The murk clears; ` +
    (next.potency < Number(brew.potency) ? "it is clean, and weaker for it." : "it is clean.")

  if (!sandbox) {
    // A stack of identical flasks is split: only the one purified changes.
    if ((row.quantity ?? 1) > 1) {
      // The purified copy goes in first; only then does the stack shrink.
      const { data: full } = await db.from("inventory_items").select("*").eq("id", row.id).maybeSingle()
      const { id: _drop, created_at: _c, updated_at: _u, ...rest } = (full ?? {}) as Record<string, unknown>
      void _drop; void _c; void _u
      const { error: e2 } = await db.from("inventory_items").insert({ ...rest, quantity: 1, brew: { ...brew, ...next, purified: true } })
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
      const { error: e1 } = await db.from("inventory_items").update({ quantity: (row.quantity ?? 1) - 1 }).eq("id", row.id)
      if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
    } else {
      const { error } = await db.from("inventory_items").update({ brew: { ...brew, ...next, purified: true } }).eq("id", row.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const { error: e9 } = await db.from("characters").update({ rest_actions_remaining: spend.remaining }).eq("id", characterId)
    if (e9) return NextResponse.json({ error: e9.message }, { status: 500 })
    if (!quiet(characterId)) await db.from("dialogue").insert({ speaker: "Malachar", text: `${summary} (${spend.note})`, channel: "dm" })
  }

  return NextResponse.json({ sandbox, character: character.name, item: row.name, before: { potency: brew.potency, impurity: brew.impurity }, after: next, summary })
}
