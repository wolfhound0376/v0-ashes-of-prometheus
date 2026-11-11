import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { canEquip, interactionsFor, type EquippedRow } from "@/lib/equipped"
import { interactionCost, type InteractionEconomy } from "@/lib/ground-items"
import { packWeight } from "@/lib/carry"
import { MOVEMENT_KINDS, provenanceLine, type HistoryLine } from "@/lib/item-history"

// ============================================================================
// /api/equipment — putting something in your hand, and taking it out again.
//
// Sam: "Doll sheet should ... permit me to equip the dagger or unequip it.
// These do take an action though."
//
//   GET  ?character_id=  → the doll, and what in the pack could fill it
//   POST { action: "equip" | "unequip", character_id, slot, item_key? }
//
// WHAT IT COSTS. The SRD gives one free object interaction a turn — "draw or
// sheathe a sword" is the book's own example — and a second costs the Use an
// Object action. So the first change on a turn is free and the second spends
// the action, which is very slightly kinder than Sam's "these do take an
// action" and considerably more correct.
//
// It is also the IDENTICAL rule /api/ground-items applies to picking things
// up, through the identical function. Two different answers to "reach for a
// thing" is precisely the drift this codebase keeps having to undo, so there
// is one answer and both routes ask it.
//
// A SWAP IS TWO INTERACTIONS — sheathing one weapon and drawing another — so
// it costs the free interaction AND the action. That is what stops a
// character re-arming freely mid-fight and is what makes the doll a decision.
//
// OUT OF COMBAT THERE IS NO ECONOMY. Nobody is counting interactions while
// the party walks a corridor, so the cost is only charged when a fight is
// running and it is this character's turn.
// ============================================================================

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const characterId = req.nextUrl.searchParams.get("character_id")
  if (!characterId) return NextResponse.json({ error: "character_id required" }, { status: 400 })
  const db = createAdminClient()
  const [doll, pack, who] = await Promise.all([
    db.from("equipment_items").select("id,slot,item_key,name,icon_url,equipped").eq("character_id", characterId),
    db.from("inventory_items")
      .select("id,name,item_key,item_type,equippable_slot,icon_url,quantity,description,weight,confiscated_from,items(item_type,properties,equippable_slot,weight)")
      .eq("character_id", characterId),
    db.from("characters").select("weight_max").eq("id", characterId).maybeSingle(),
  ])
  // carry: what the pack weighs and the limit (lib/carry.ts) — the inventory sheet shows it
  const rows = pack.data ?? []
  // where each thing came from, in one line (lib/item-history.ts). Best effort: no history, no line.
  const lines = new Map<string, HistoryLine[]>()
  if (rows.length) {
    const { data: ev } = await db.from("item_events").select("inventory_item_id,kind,detail,occurred_at").in("inventory_item_id", rows.map((r) => r.id)).in("kind", [...MOVEMENT_KINDS])
    for (const e of (ev ?? []) as (HistoryLine & { inventory_item_id: string })[]) (lines.get(e.inventory_item_id) ?? lines.set(e.inventory_item_id, []).get(e.inventory_item_id)!).push(e)
  }
  const carried = rows.map((r) => ({ ...r, origin: provenanceLine(lines.get(r.id) ?? []) }))
  const carry = { carried: packWeight(carried.filter((r) => !r.confiscated_from)), max: who.data?.weight_max != null && Number(who.data.weight_max) > 0 ? Number(who.data.weight_max) : null }
  return NextResponse.json({ equipped: doll.data ?? [], carried, carry })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const action = String(body?.action ?? "")
  if (!["equip", "unequip"].includes(action)) {
    return NextResponse.json({ error: "expected action equip or unequip" }, { status: 400 })
  }
  const characterId = String(body?.character_id ?? "")
  const slot = String(body?.slot ?? "")
  if (!characterId || !slot) {
    return NextResponse.json({ error: "character_id and slot required" }, { status: 400 })
  }

  const db = createAdminClient()
  const stamp = new Date().toISOString()

  const { data: dollRows } = await db
    .from("equipment_items").select("id,slot,item_key,name,equipped").eq("character_id", characterId)
  const doll = (dollRows ?? []) as (EquippedRow & { id: string })[]

  // ---- what it will cost, before anything is written ----------------------
  //
  // Read the fight first so a refusal costs nothing: a character who cannot
  // afford to swap weapons must not end up half-swapped.
  const { data: map } = await db.from("vtt_maps").select("id").eq("is_active", true).limit(1).maybeSingle()
  type Fight = { id: string; turn_order: unknown; active_index: number; turn_state: unknown }
  let combat: Fight | null = null
  if (map) {
    const { data } = await db.from("combat_state")
      .select("id,turn_order,active_index,turn_state").eq("map_id", map.id).eq("status", "active").maybeSingle()
    combat = (data ?? null) as Fight | null
  }
  const order = (combat?.turn_order ?? []) as { token_id?: string }[]
  const activeToken = order[combat?.active_index ?? 0]?.token_id ?? null
  let mine = false
  if (activeToken) {
    const { data: tok } = await db.from("vtt_tokens").select("character_id").eq("id", activeToken).maybeSingle()
    mine = tok?.character_id === characterId
  }

  // ---- unequip ------------------------------------------------------------
  if (action === "unequip") {
    const row = doll.find((d) => d.slot === slot && d.equipped !== false)
    if (!row) return NextResponse.json({ error: `Nothing is in your ${slot.replace("_", " ")}.` }, { status: 409 })
    const spend = await charge(1)
    if (!spend.ok) return NextResponse.json({ error: spend.reason }, { status: 409 })
    const { error } = await db.from("equipment_items").delete().eq("id", row.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, unequipped: row.name, cost: spend.cost })
  }

  // ---- equip --------------------------------------------------------------
  const itemKey = String(body?.item_key ?? "")
  if (!itemKey) return NextResponse.json({ error: "item_key required to equip" }, { status: 400 })

  const { data: carried } = await db.from("inventory_items")
    .select("id,name,item_key,item_type,equippable_slot,icon_url,items(equippable_slot,item_type,properties)")
    .eq("character_id", characterId).eq("item_key", itemKey).limit(1).maybeSingle()
  if (!carried) {
    // You cannot draw what you are not carrying. The pack is the gate, and it
    // is checked HERE rather than trusted from the client.
    return NextResponse.json({ error: "You are not carrying that." }, { status: 409 })
  }

  const verdict = canEquip({
    item: carried as Parameters<typeof canEquip>[0]["item"],
    slot,
    doll,
  })
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 409 })

  const spend = await charge(interactionsFor(verdict))
  if (!spend.ok) return NextResponse.json({ error: spend.reason }, { status: 409 })

  // A slot holds one thing: whatever was there comes off first.
  if (verdict.replacing) {
    const old = doll.find((d) => d.slot === slot && d.equipped !== false)
    if (old) await db.from("equipment_items").delete().eq("id", old.id)
  }
  const { error } = await db.from("equipment_items").insert({
    character_id: characterId, slot, item_key: carried.item_key, name: carried.name,
    icon_url: carried.icon_url, equipped: true, updated_at: stamp,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true, equipped: carried.name, slot,
    replaced: verdict.replacing, cost: spend.cost,
  })

  /**
   * Spend `n` object interactions, or refuse.
   *
   * Out of combat, or on somebody else's turn, nothing is charged — there is
   * no economy to spend from and refusing would stop a party re-arming
   * between fights.
   */
  async function charge(n: number): Promise<{ ok: true; cost: string } | { ok: false; reason: string }> {
    if (!combat || !mine) return { ok: true, cost: "free" }
    let econ = (combat.turn_state ?? {}) as InteractionEconomy
    const paid: string[] = []
    for (let i = 0; i < n; i++) {
      const v = interactionCost(econ, "your gear")
      if (!v.ok) return { ok: false, reason: v.reason }
      econ = v.next
      paid.push(v.cost)
    }
    await db.from("combat_state")
      .update({ turn_state: econ, updated_at: stamp })
      .eq("id", combat.id)
    return { ok: true, cost: paid.includes("action") ? "action" : "free" }
  }
}
