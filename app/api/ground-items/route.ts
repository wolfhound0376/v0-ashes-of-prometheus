// Things on the floor: pick them up, put them down.
//
// Sam (2 Sep 2026): "We need a way to be able to pick up items (to put in
// inventory, throw, interact with) on our player UI."
//
//   GET  ?sandbox=1            → the piles still lying on the active board
//   POST {action:"pickup"}     → one pile off the floor, into a character's
//                                inventory
//   POST {action:"drop"}       → one inventory row (or part of it) onto the
//                                square the character is standing on
//   POST {action:"place"}      → DM only: a catalogue item onto any square
//   POST {action:"remove"}     → DM only: a pile off the floor, into nobody's
//                                hands (stamped, never deleted)
//
// Player verbs, like /api/combat's "move": not DM-gated, fenced hard. The
// character must have a token on the active map; the pile must be within
// arm's reach (the same square or one of the eight around it); and if a
// fight is on, it must be that character's turn, and the pickup costs what
// the SRD says it costs - the free object interaction first, the action
// after that, and nothing once both are gone (lib/ground-items).
//
// Everything that lands on the floor is a catalogue item. A row in
// inventory_items with no item_id is resolved against the catalogue by name
// before it may be dropped; if the catalogue does not know it, it stays in
// the pack. That is the invariant the AI is held to, applied to the players.
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { withinReach, interactionCost, describePile, type InteractionEconomy } from "@/lib/ground-items"

type Db = ReturnType<typeof createAdminClient>

/** The board's log is the dialogue feed; the HUD is already subscribed to it. */
async function narrate(db: Db, speaker: string, text: string) {
  await db.from("dialogue").insert({ speaker, text, channel: "dm" })
}

async function activeMap(db: Db, sandbox: boolean) {
  const { data } = await db
    .from("vtt_maps").select("id,grid_width,grid_height").eq(sandbox ? "is_sandbox" : "is_active", true).limit(1).maybeSingle()
  return data
}

/** The same gate /api/combat keeps: the DM's key, or an open table with none set. */
function authorized(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return true
  return safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

export async function GET(req: NextRequest) {
  const db = createAdminClient()
  const sandbox = req.nextUrl.searchParams.get("sandbox") === "1"
  const map = await activeMap(db, sandbox)
  if (!map) return NextResponse.json({ items: [] })
  const { data } = await db
    .from("vtt_ground_items")
    .select("id,map_id,item_id,name,quantity,grid_x,grid_y,dropped_by")
    .eq("map_id", map.id)
    .is("picked_up_at", null)
  return NextResponse.json({ items: data ?? [] })
}

/**
 * The turn fence, shared by both verbs. Out of combat there is no turn and
 * nothing to spend. In combat it must be this character's turn, and the
 * interaction is paid for here - written back only once the caller's own
 * write has succeeded, so a refused pickup does not cost a turn.
 */
async function turnFence(db: Db, mapId: string, tokenId: string, what: string) {
  const { data: combat } = await db
    .from("combat_state")
    .select("id,active_index,turn_order,turn_state")
    .eq("map_id", mapId)
    .eq("status", "active")
    .maybeSingle()
  if (!combat) return { ok: true as const, commit: async () => {}, cost: null }
  const order = (combat.turn_order ?? []) as { token_id?: string }[]
  const active = order[combat.active_index ?? 0]?.token_id
  if (active !== tokenId) return { ok: false as const, error: "Not your turn." }
  const econ = (combat.turn_state ?? {}) as InteractionEconomy
  const verdict = interactionCost(econ, what)
  if (!verdict.ok) return { ok: false as const, error: verdict.reason }
  return {
    ok: true as const,
    cost: verdict.cost,
    commit: async () => {
      await db.from("combat_state")
        .update({ turn_state: { ...(combat.turn_state as object ?? {}), ...verdict.next }, updated_at: new Date().toISOString() })
        .eq("id", combat.id)
    },
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const action = body?.action as string | undefined
  if (action !== "pickup" && action !== "drop" && action !== "place" && action !== "remove") {
    return NextResponse.json({ error: "expected { action: 'pickup'|'drop'|'place'|'remove' }" }, { status: 400 })
  }

  if (action === "place" || action === "remove") {
    // THE DM'S HANDS. Sam: "we need a way to pick up objects on the
    // battlefield" — and until now the only object on any battlefield was
    // the one shard the migration seeded. This is how the rest get there:
    // the DM picks a catalogue item and a square. Nothing invented lies on
    // the board, so the item must exist in `items`; the DM key is the fence,
    // the same one that starts a fight. No turn economy — the world does not
    // spend actions.
    if (!authorized(req)) return NextResponse.json({ error: "DM only" }, { status: 403 })
    const db = createAdminClient()
    const map = await activeMap(db, body?.sandbox === true)
    if (!map) return NextResponse.json({ error: "no active battle map" }, { status: 409 })

    if (action === "remove") {
      const groundId = String(body?.ground_item_id ?? "")
      if (!groundId) return NextResponse.json({ error: "ground_item_id required" }, { status: 400 })
      // Rows are never deleted by play: the pile is stamped as gone with
      // nobody's name on it, the way a pickup stamps it with someone's.
      const { data: gone } = await db
        .from("vtt_ground_items")
        .update({ picked_up_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", groundId).eq("map_id", map.id).is("picked_up_at", null)
        .select("name,quantity").maybeSingle()
      if (!gone) return NextResponse.json({ error: "That is not on this floor." }, { status: 404 })
      return NextResponse.json({ ok: true, line: `${describePile(gone.name, gone.quantity ?? 1)} is gone from the floor.` })
    }

    const itemId = String(body?.item_id ?? "")
    const gx = Number(body?.gx)
    const gy = Number(body?.gy)
    const quantity = Math.max(1, Math.floor(Number(body?.quantity ?? 1)) || 1)
    if (!itemId) return NextResponse.json({ error: "item_id required" }, { status: 400 })
    if (!Number.isInteger(gx) || !Number.isInteger(gy) || gx < 0 || gy < 0 || gx >= (map.grid_width ?? 0) || gy >= (map.grid_height ?? 0)) {
      return NextResponse.json({ error: "that square is off the board" }, { status: 400 })
    }
    const { data: item } = await db.from("items").select("id,name").eq("id", itemId).maybeSingle()
    if (!item) return NextResponse.json({ error: "The catalogue has no such item." }, { status: 404 })
    const { error: putDown } = await db.from("vtt_ground_items").insert({
      map_id: map.id,
      item_id: item.id,
      name: item.name,
      quantity,
      grid_x: gx,
      grid_y: gy,
      // Null dropped_by: the world put it there.
      dropped_by: null,
    })
    if (putDown) return NextResponse.json({ error: `Could not set it down: ${putDown.message}` }, { status: 500 })
    const line = `${describePile(item.name, quantity)} lies on the floor.`
    await narrate(db, "DM", line)
    return NextResponse.json({ ok: true, line, item: item.name, quantity })
  }

  const characterId = String(body?.character_id ?? "")
  if (!characterId) return NextResponse.json({ error: "character_id required" }, { status: 400 })

  const db = createAdminClient()
  const map = await activeMap(db, body?.sandbox === true)
  if (!map) return NextResponse.json({ error: "no active battle map" }, { status: 409 })

  // The hand doing the reaching: this character's own miniature, on this board.
  const { data: token } = await db
    .from("vtt_tokens")
    .select("id,label,grid_x,grid_y")
    .eq("map_id", map.id)
    .eq("character_id", characterId)
    .limit(1)
    .maybeSingle()
  if (!token) return NextResponse.json({ error: "That character is not on this board." }, { status: 404 })
  const { data: who } = await db.from("characters").select("name").eq("id", characterId).maybeSingle()
  const name = (who?.name as string | undefined) ?? token.label ?? "Someone"
  const me = { x: token.grid_x ?? 0, y: token.grid_y ?? 0 }
  const stamp = new Date().toISOString()

  if (action === "pickup") {
    const groundId = String(body?.ground_item_id ?? "")
    if (!groundId) return NextResponse.json({ error: "ground_item_id required" }, { status: 400 })
    const { data: pile } = await db
      .from("vtt_ground_items")
      .select("id,item_id,name,quantity,grid_x,grid_y,picked_up_at")
      .eq("id", groundId)
      .eq("map_id", map.id)
      .maybeSingle()
    if (!pile || pile.picked_up_at) {
      return NextResponse.json({ error: "There is nothing there any more." }, { status: 404 })
    }
    if (!withinReach(me, { x: pile.grid_x, y: pile.grid_y })) {
      return NextResponse.json({ error: `The ${pile.name} is out of reach — move next to it first.` }, { status: 409 })
    }
    const fence = await turnFence(db, map.id, token.id, `the ${pile.name}`)
    if (!fence.ok) return NextResponse.json({ error: fence.error }, { status: 409 })

    // What the catalogue says it is; the inventory row copies the facts that
    // the dashboard reads off the row itself.
    const { data: item } = await db
      .from("items")
      .select("id,name,description,item_type,equippable_slot,weight,value,icon_url,stackable")
      .eq("id", pile.item_id)
      .maybeSingle()
    if (!item) return NextResponse.json({ error: "That item is not in the catalogue." }, { status: 409 })

    // Taken atomically: the stamp lands only if nobody else got there first.
    const { data: taken } = await db
      .from("vtt_ground_items")
      .update({ picked_up_by: characterId, picked_up_at: stamp, updated_at: stamp })
      .eq("id", pile.id)
      .is("picked_up_at", null)
      .select("id")
    if (!taken?.length) return NextResponse.json({ error: "Someone else's hand got there first." }, { status: 409 })

    const { data: existing } = await db
      .from("inventory_items")
      .select("id,quantity")
      .eq("character_id", characterId)
      .eq("name", item.name)
      .maybeSingle()
    if (existing && item.stackable) {
      await db.from("inventory_items")
        .update({ quantity: (existing.quantity ?? 0) + pile.quantity, item_id: item.id })
        .eq("id", existing.id)
    } else {
      const { error } = await db.from("inventory_items").insert({
        character_id: characterId,
        name: item.name,
        quantity: pile.quantity,
        description: item.description,
        item_type: item.item_type,
        icon_url: item.icon_url,
        item_id: item.id,
        equippable_slot: item.equippable_slot,
        weight: item.weight,
        value: item.value,
      })
      if (error) {
        // Put it back on the floor rather than lose it between the tables.
        await db.from("vtt_ground_items")
          .update({ picked_up_by: null, picked_up_at: null, updated_at: stamp })
          .eq("id", pile.id)
        return NextResponse.json({ error: `Could not stow it: ${error.message}` }, { status: 500 })
      }
    }
    await fence.commit()

    const pileText = describePile(item.name, pile.quantity)
    const line =
      fence.cost === "action"
        ? `${name} uses their action to pick up ${pileText}.`
        : `${name} picks up ${pileText}.`
    await narrate(db, name, line)
    return NextResponse.json({ ok: true, line, cost: fence.cost, item: item.name, quantity: pile.quantity })
  }

  // DROP: from the pack to the square underfoot.
  const invId = String(body?.inventory_item_id ?? "")
  if (!invId) return NextResponse.json({ error: "inventory_item_id required" }, { status: 400 })
  const wanted = Math.max(1, Math.floor(Number(body?.quantity ?? 1)) || 1)
  const { data: row } = await db
    .from("inventory_items")
    .select("id,name,quantity,item_id")
    .eq("id", invId)
    .eq("character_id", characterId)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: "That is not in this character's pack." }, { status: 404 })
  const have = row.quantity ?? 1
  const qty = Math.min(wanted, have)

  // The catalogue must know it. A row that arrived without its link is
  // resolved by exact name, then alias; a name the catalogue has never heard
  // of stays in the pack, because nothing invented may lie on the board.
  let itemId = row.item_id as string | null
  let itemName = row.name as string
  if (!itemId) {
    const { data: byName } = await db.from("items").select("id,name").ilike("name", row.name).limit(1).maybeSingle()
    const hit = byName ?? (await db.from("items").select("id,name").contains("aliases", [String(row.name).toLowerCase()]).limit(1).maybeSingle()).data
    if (!hit) {
      return NextResponse.json({ error: `The ${row.name} is not in the catalogue and cannot be placed on the board.` }, { status: 409 })
    }
    itemId = hit.id
    itemName = hit.name
  }

  const fence = await turnFence(db, map.id, token.id, `the ${itemName}`)
  if (!fence.ok) return NextResponse.json({ error: fence.error }, { status: 409 })

  const { error: putDown } = await db.from("vtt_ground_items").insert({
    map_id: map.id,
    item_id: itemId,
    name: itemName,
    quantity: qty,
    grid_x: me.x,
    grid_y: me.y,
    dropped_by: characterId,
  })
  if (putDown) return NextResponse.json({ error: `Could not set it down: ${putDown.message}` }, { status: 500 })

  if (qty >= have) {
    await db.from("inventory_items").delete().eq("id", row.id)
  } else {
    await db.from("inventory_items").update({ quantity: have - qty }).eq("id", row.id)
  }
  await fence.commit()

  const pileText = describePile(itemName, qty)
  const line =
    fence.cost === "action"
      ? `${name} uses their action to set down ${pileText}.`
      : `${name} sets down ${pileText}.`
  await narrate(db, name, line)
  return NextResponse.json({ ok: true, line, cost: fence.cost, item: itemName, quantity: qty })
}
