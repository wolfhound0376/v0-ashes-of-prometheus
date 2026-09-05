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
//   POST {action:"throw"}      → one inventory row onto a square some way off,
//                                for the price of an action
//   POST {action:"place"}      → DM only: a catalogue item onto any square
//   POST {action:"remove"}     → DM only: a pile off the floor, into nobody's
//                                hands (stamped, never deleted)
//
// Player verbs, like /api/combat's "move": not DM-gated, fenced hard. The
// character must have a token on the active map; the pile must be within
// arm's reach (the same square or one of the eight around it); and if a
// fight is on, it must be that character's turn.
//
// WHAT EACH VERB COSTS is Sam's ruling, not the SRD's: "picking up doesn't
// cost anything. equipping or throwing does." So pickup and drop are free -
// not even the free object interaction - and a throw spends the whole action.
// The book would charge for the second pickup in a turn; charging for bending
// down made the floor something to avoid, which is the opposite of the point.
//
// Everything that lands on the floor is a catalogue item. A row in
// inventory_items with no item_id is resolved against the catalogue by name
// before it may be dropped; if the catalogue does not know it, it stays in
// the pack. That is the invariant the AI is held to, applied to the players.
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { withinReach, describePile, handlingCost, type InteractionEconomy } from "@/lib/ground-items"
import { canThrow } from "@/lib/throwing"

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
 * Whose turn it is. Out of combat there is no turn at all, which is why this
 * answers with `inCombat` rather than a token: a party rummaging through a
 * store room is not taking turns and must not be told to wait for one.
 */
async function whoseTurn(db: Db, mapId: string) {
  const { data: combat } = await db
    .from("combat_state")
    .select("id,active_index,turn_order,turn_state")
    .eq("map_id", mapId)
    .eq("status", "active")
    .maybeSingle()
  if (!combat) return { inCombat: false as const, active: null as string | null, combat: null }
  const order = (combat.turn_order ?? []) as { token_id?: string }[]
  return {
    inCombat: true as const,
    active: order[combat.active_index ?? 0]?.token_id ?? null,
    combat,
  }
}

/**
 * The free verbs' fence: it must be your turn, and that is all it asks.
 * Nothing is spent, so there is nothing to commit and nothing to give back if
 * the write below fails.
 */
async function yourTurn(db: Db, mapId: string, tokenId: string) {
  const turn = await whoseTurn(db, mapId)
  if (turn.inCombat && turn.active !== tokenId) {
    return { ok: false as const, error: "Not your turn." }
  }
  return { ok: true as const }
}

/**
 * The action fence, for the verbs that cost one. Deliberately shaped like
 * turnFence was - a verdict now, a `commit` that only runs once the caller's
 * own write succeeded - so a throw that fails to leave the pack does not also
 * cost the turn.
 */
async function spendAction(db: Db, mapId: string, tokenId: string, what: string) {
  const turn = await whoseTurn(db, mapId)
  // Out of combat an action is not a scarce thing. Throw away.
  if (!turn.inCombat || !turn.combat) return { ok: true as const, cost: null, commit: async () => {} }
  if (turn.active !== tokenId) return { ok: false as const, error: "Not your turn." }
  const econ = (turn.combat.turn_state ?? {}) as InteractionEconomy
  if (econ.action) {
    return { ok: false as const, error: `Your action is already spent — no throwing ${what} this turn.` }
  }
  return {
    ok: true as const,
    cost: "action" as const,
    commit: async () => {
      await db.from("combat_state")
        .update({
          turn_state: { ...(turn.combat!.turn_state as object ?? {}), action: true },
          updated_at: new Date().toISOString(),
        })
        .eq("id", turn.combat!.id)
    },
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const action = body?.action as string | undefined
  if (action !== "pickup" && action !== "drop" && action !== "throw" && action !== "place" && action !== "remove") {
    return NextResponse.json({ error: "expected { action: 'pickup'|'drop'|'throw'|'place'|'remove' }" }, { status: 400 })
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
    // PICKING UP COSTS NOTHING. Sam's ruling: "picking up doesn't cost
    // anything. equipping or throwing does." No interaction, no action -
    // handlingCost("pickup") says "none" and this is the code that honours it.
    // Reach is still checked above, and in a fight it must still be your turn,
    // because a fight is turns; but bending down is not one of them.
    const gate = await yourTurn(db, map.id, token.id)
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 409 })

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
    const pileText = describePile(item.name, pile.quantity)
    const line = `${name} picks up ${pileText}.`
    await narrate(db, name, line)
    return NextResponse.json({
      ok: true, line, cost: handlingCost("pickup"), item: item.name, quantity: pile.quantity,
    })
  }

  // DROP and THROW: both take a row out of the pack and make it a pile. The
  // only differences are where the pile lands and what the turn pays for it.
  const invId = String(body?.inventory_item_id ?? "")
  if (!invId) return NextResponse.json({ error: "inventory_item_id required" }, { status: 400 })
  const wanted = Math.max(1, Math.floor(Number(body?.quantity ?? 1)) || 1)
  const { data: row } = await db
    .from("inventory_items")
    .select("id,name,quantity,item_id,weight")
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

  // WHERE IT LANDS. A drop is underfoot; a throw is a square you name, and
  // the arm has a limit. Everything about that limit lives in lib/throwing so
  // the board can grey out the squares the server would refuse.
  let where = me
  let cost: "none" | "action" = "none"
  let commit = async () => {}
  let verb = "sets down"
  let far = false

  if (action === "throw") {
    const gx = Number(body?.gx)
    const gy = Number(body?.gy)
    if (!Number.isInteger(gx) || !Number.isInteger(gy) || gx < 0 || gy < 0 || gx >= (map.grid_width ?? 0) || gy >= (map.grid_height ?? 0)) {
      return NextResponse.json({ error: "that square is off the board" }, { status: 400 })
    }
    const verdict = canThrow({ from: me, to: { x: gx, y: gy }, name: itemName, weightLb: row.weight as number | null })
    if (!verdict.ok) {
      return NextResponse.json({ error: `The ${itemName} won't make it: ${verdict.reason}.` }, { status: 409 })
    }
    // A throw is an action, and the fence is asked BEFORE the item leaves the
    // pack but committed after, so a failed insert costs nothing.
    const fence = await spendAction(db, map.id, token.id, `the ${itemName}`)
    if (!fence.ok) return NextResponse.json({ error: fence.error }, { status: 409 })
    where = { x: gx, y: gy }
    cost = fence.cost === "action" ? "action" : "none"
    commit = fence.commit
    verb = "throws"
    far = verdict.longRange
  } else {
    // Dropping is free in the book and free at this table.
    const gate = await yourTurn(db, map.id, token.id)
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 409 })
  }

  const { error: putDown } = await db.from("vtt_ground_items").insert({
    map_id: map.id,
    item_id: itemId,
    name: itemName,
    quantity: qty,
    grid_x: where.x,
    grid_y: where.y,
    dropped_by: characterId,
  })
  if (putDown) return NextResponse.json({ error: `Could not set it down: ${putDown.message}` }, { status: 500 })

  if (qty >= have) {
    await db.from("inventory_items").delete().eq("id", row.id)
  } else {
    await db.from("inventory_items").update({ quantity: have - qty }).eq("id", row.id)
  }
  await commit()

  const pileText = describePile(itemName, qty)
  const line =
    action === "throw"
      ? `${name} ${verb} ${pileText}${far ? " — a long throw" : ""}, and it lands ${where.x === me.x && where.y === me.y ? "at their feet" : `on (${where.x}, ${where.y})`}.`
      : `${name} ${verb} ${pileText}.`
  await narrate(db, name, line)
  return NextResponse.json({ ok: true, line, cost, item: itemName, quantity: qty, gx: where.x, gy: where.y })
}
