import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { canCarry, carriedNow, carryVerdict, syncCarried } from "@/lib/carry"
import { recordItemMove } from "@/lib/item-history"
import { floorHolderId, pickupPlan } from "@/lib/floor-holder"

// /api/walk-items — things lying on the floor of the walk (public/velkynvelve-walk).
//
// Sam, 2026-10-15: "Can we have a dagger show up in the DM menu and her be able to pick it up (in
// fact) characters should be able to pick things up and that should cost movement but equipping is
// an action."
//
// The battle board has its own floor (/api/ground-items, vtt_ground_items, keyed to board squares).
// The walk is a different surface — painted plates in plate pixels, no grid — so its floor is one
// world flag, `walk-floor`, a list of piles: { id, node, x, y, itemId, slug, name, pixel }.
// No migration. A restart clears it with every other flag.
//
//   GET ?catalog=1                → the item catalogue, for the DM's "put something down" menu
//   GET [?node=N]                 → the piles on the floor (all, or one plate's)
//   POST {action:"place"}         → DM only: a catalogue item onto a spot on a plate
//   POST {action:"remove"}        → DM only: a pile off the floor, into nobody's hands
//   POST {action:"pickup"}        → a pile off the floor into a character's inventory_items
//   POST {action:"consume"}       → one off a stack the character carries (a potion drunk, a meal eaten, a flask thrown)
//   POST {action:"drop"}          → one of the character's own items onto the floor (a thrown dagger where it landed)
//   POST {action:"give"}          → one of the character's own items into another character's inventory
//
// WHAT IT COSTS is decided on the walk, which runs the fight: picking up spends movement, equipping
// spends the action (Sam's ruling above). This route only moves the thing.
//
// Everything on this floor is a catalogue item: `place` takes an items.id, never a free name. That is
// the invariant the AI is held to ("the AI cannot invent items"), applied to the DM's hand too.

export const dynamic = "force-dynamic"

const CAMPAIGN = "ashes-of-prometheus"
const KEY = "walk-floor"

// rowId: the inventory_items row parked on the floor holder under this pile (lib/floor-holder.ts). Absent on a pile the
// DM placed and on piles from before 2026-11-10: those have no row until someone picks them up.
type Pile = { id: string; node: string; x: number; y: number; itemId: string; slug: string; name: string; pixel: string | null; at: string; rowId?: string }
type Db = ReturnType<typeof createAdminClient>

function authorized(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return true
  return safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

async function readFloor(db: Db): Promise<Pile[]> {
  const { data } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", KEY).maybeSingle()
  const v = (data?.value ?? null) as { piles?: Pile[] } | null
  return Array.isArray(v?.piles) ? v!.piles : []
}

async function writeFloor(db: Db, piles: Pile[], note: string) {
  const { error } = await db.from("world_flags").upsert(
    { campaign_id: CAMPAIGN, key: KEY, value: { piles }, set_by: "walk", note },
    { onConflict: "campaign_id,key" },
  )
  return error
}

export async function GET(req: NextRequest) {
  const db = createAdminClient()
  if (req.nextUrl.searchParams.get("catalog") === "1") {
    const { data, error } = await db.from("items")
      .select("id,slug,name,item_type,equippable_slot,pixel_icon_url,icon_url,description,stackable,properties,rarity,weight,value,attunement,cursed,alchemy_effects")   // rarity: the walk reads "rarer than common" as a magic weapon (the bhut resists the rest)
      .order("item_type", { ascending: true }).order("name", { ascending: true })
    if (error) return NextResponse.json({ items: [], error: error.message })
    return NextResponse.json({ items: data ?? [] })
  }
  const node = req.nextUrl.searchParams.get("node")
  const piles = await readFloor(db)
  return NextResponse.json({ piles: node ? piles.filter((p) => p.node === node) : piles })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const action = String(body?.action ?? "")
  const db = createAdminClient()

  if (action === "place" || action === "remove") {
    if (!authorized(req)) return NextResponse.json({ error: "DM only" }, { status: 403 })
    const piles = await readFloor(db)
    if (action === "remove") {
      const left = piles.filter((p) => p.id !== String(body?.pileId ?? ""))
      if (left.length === piles.length) return NextResponse.json({ error: "No such pile." }, { status: 404 })
      const err = await writeFloor(db, left, "DM cleared a pile")
      if (!err) { const gone = piles.find((p) => p.id === String(body?.pileId ?? ""))   // the DM took it out of the world: its parked row goes too
        if (gone?.rowId) { const fid = await floorHolderId(db, false); if (fid) await db.from("inventory_items").delete().eq("id", gone.rowId).eq("character_id", fid) } }
      return err ? NextResponse.json({ error: err.message }, { status: 500 }) : NextResponse.json({ ok: true, piles: left })
    }
    const node = String(body?.node ?? ""), x = Number(body?.x), y = Number(body?.y)
    if (!node || !Number.isFinite(x) || !Number.isFinite(y)) return NextResponse.json({ error: "node, x and y required" }, { status: 400 })
    const { data: item } = await db.from("items").select("id,slug,name,pixel_icon_url").eq("id", String(body?.itemId ?? "")).maybeSingle()
    if (!item) return NextResponse.json({ error: "Not in the item catalogue." }, { status: 404 })
    const pile: Pile = { id: crypto.randomUUID(), node, x: Math.round(x), y: Math.round(y), itemId: item.id, slug: item.slug, name: item.name, pixel: item.pixel_icon_url ?? null, at: new Date().toISOString() }
    const next = [...piles, pile]
    const err = await writeFloor(db, next, `DM put ${item.name} down`)
    return err ? NextResponse.json({ error: err.message }, { status: 500 }) : NextResponse.json({ ok: true, pile, piles: next })
  }

  if (action === "pickup") {
    const characterId = String(body?.characterId ?? ""), pileId = String(body?.pileId ?? "")
    if (!characterId || !pileId) return NextResponse.json({ error: "characterId and pileId required" }, { status: 400 })
    const { data: who } = await db.from("characters").select("id,name").eq("id", characterId).maybeSingle()
    if (!who) return NextResponse.json({ error: "No such character." }, { status: 404 })
    const piles = await readFloor(db)
    const pile = piles.find((p) => p.id === pileId)
    if (!pile) return NextResponse.json({ error: "It is not there any more." }, { status: 409 })
    const { data: item } = await db.from("items")
      .select("id,name,description,item_type,icon_url,equippable_slot,weight,value,stackable").eq("id", pile.itemId).maybeSingle()
    if (!item) return NextResponse.json({ error: "Not in the item catalogue." }, { status: 404 })

    // carrying capacity (lib/carry.ts): refused while the thing is still on the floor
    { const v = await canCarry(db, characterId, Number(item.weight ?? 0), item.name)
      if (!v.ok) return NextResponse.json({ error: v.why, carry: v }, { status: 409 }) }

    // Off the floor first, so two hands cannot take the same pile.
    const err = await writeFloor(db, piles.filter((p) => p.id !== pileId), `${who.name} picked up ${item.name}`)
    if (err) return NextResponse.json({ error: err.message }, { status: 500 })

    const { data: existing } = await db.from("inventory_items").select("id,quantity")
      .eq("character_id", characterId).eq("name", item.name).limit(1).maybeSingle()
    // THE ROW UNDER THE PILE (lib/floor-holder.ts): a thing that was dropped is still its own row, parked on the floor
    // holder. Picking it up moves that row, so its id, condition, upgrades and history come with it.
    const fid = pile.rowId ? await floorHolderId(db, false) : null
    const parked = pile.rowId && fid ? (await db.from("inventory_items").select("id,quantity").eq("id", pile.rowId).eq("character_id", fid).maybeSingle()).data : null
    const plan = pickupPlan({ parkedRowFound: !!parked, stackable: !!item.stackable, takerHasStack: !!existing })
    let rowId: string | null = plan === "move-row" ? parked!.id : existing && item.stackable ? existing.id : null
    let error: { message: string } | null = null
    if (plan === "move-row") error = (await db.from("inventory_items").update({ character_id: characterId }).eq("id", rowId)).error
    else if (plan === "merge-into-stack") {
      error = (await db.from("inventory_items").update({ quantity: (existing!.quantity ?? 0) + (parked!.quantity ?? 1), item_id: item.id }).eq("id", rowId)).error
      if (!error) await db.from("inventory_items").delete().eq("id", parked!.id)   // the stack absorbed it
    }
    else if (rowId) error = (await db.from("inventory_items").update({ quantity: (existing!.quantity ?? 0) + 1, item_id: item.id }).eq("id", rowId)).error
    else {
      const ins = await db.from("inventory_items").insert({
          character_id: characterId, name: item.name, quantity: 1, description: item.description,
          item_type: item.item_type, icon_url: item.icon_url, item_id: item.id,
          equippable_slot: item.equippable_slot, weight: item.weight, value: item.value,
        }).select("id").maybeSingle()
      error = ins.error; rowId = (ins.data?.id as string) ?? null
    }
    if (error) {
      await writeFloor(db, piles, `${item.name} put back: ${error.message}`)    // back on the floor rather than lost
      return NextResponse.json({ error: `Could not stow it: ${error.message}` }, { status: 500 })
    }
    await syncCarried(db, characterId)
    await recordItemMove(db, { inventoryItemId: rowId, characterId, kind: "pickup", detail: { from: "the floor", node: pile.node, x: pile.x, y: pile.y, qty: 1, same_item: plan === "move-row" ? true : undefined } })
    await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text: `${who.name} picks up ${item.name}.` })
    return NextResponse.json({ ok: true, picked: item.name })
  }

  if (action === "consume") {
    // Sam, 2026-10-15: "a way while in combat and out of combat to use potions, elixers, etc." What the thing DOES is
    // worked out on the walk from the catalogue row; this only takes one off the stack the character really carries
    // and says so in the story, so Malachar knows the potion is gone.
    const characterId = String(body?.characterId ?? ""), itemKey = String(body?.itemKey ?? ""), itemName = String(body?.itemName ?? "")
    if (!characterId || (!itemKey && !itemName)) return NextResponse.json({ error: "characterId and itemKey required" }, { status: 400 })
    const { data: who } = await db.from("characters").select("id,name").eq("id", characterId).maybeSingle()
    if (!who) return NextResponse.json({ error: "No such character." }, { status: 404 })
    let q = db.from("inventory_items").select("id,name,quantity").eq("character_id", characterId)
    q = itemKey ? q.eq("item_key", itemKey) : q.eq("name", itemName)
    const { data: row } = await q.limit(1).maybeSingle()
    if (!row) return NextResponse.json({ error: "You are not carrying that." }, { status: 409 })
    const left = (row.quantity ?? 1) - 1
    const { error } = left > 0
      ? await db.from("inventory_items").update({ quantity: left }).eq("id", row.id)
      : await db.from("inventory_items").delete().eq("id", row.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const verb = String(body?.verb ?? "use")
    let text = `${who.name} ${verb === "drink" ? "drinks" : verb === "eat" ? "eats" : verb === "throw" ? "throws" : "uses"} ${row.name}.`
    if (verb === "give" && body?.targetCharacterId) {
      const { data: to } = await db.from("characters").select("name").eq("id", String(body.targetCharacterId)).maybeSingle()
      text = `${who.name} gives ${row.name} to ${to?.name ?? "an ally"}.`
    }
    await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text })
    await syncCarried(db, characterId)
    if (left > 0) await recordItemMove(db, { inventoryItemId: row.id, characterId, kind: "consume", detail: { verb, qty: 1, left } })   // a used-up row is deleted, and its history with it (see lib/item-history.ts)
    return NextResponse.json({ ok: true, left: Math.max(0, left) })
  }

  if (action === "drop") {
    // Sam, 2026-10-15: thrown weapons land on the floor. A character's own item leaves their inventory (and their hand,
    // if that was the last of it) and becomes a pile where it came to rest. Only what they carry can be dropped, and
    // the pile is the catalogue item the inventory row points at: nothing invented.
    const characterId = String(body?.characterId ?? ""), itemKey = String(body?.itemKey ?? ""), itemName = String(body?.itemName ?? "")
    const node = String(body?.node ?? ""), x = Number(body?.x), y = Number(body?.y)
    if (!characterId || (!itemKey && !itemName) || !node || !Number.isFinite(x) || !Number.isFinite(y))
      return NextResponse.json({ error: "characterId, item, node, x and y required" }, { status: 400 })
    const { data: who } = await db.from("characters").select("id,name").eq("id", characterId).maybeSingle()
    if (!who) return NextResponse.json({ error: "No such character." }, { status: 404 })
    let q = db.from("inventory_items").select("id,name,quantity,item_id").eq("character_id", characterId)
    q = itemKey ? q.eq("item_key", itemKey) : q.eq("name", itemName)
    const { data: row } = await q.limit(1).maybeSingle()
    if (!row) return NextResponse.json({ error: "You are not carrying that." }, { status: 409 })
    let item: { id: string; slug: string; name: string; pixel_icon_url: string | null } | null = null
    if (row.item_id) item = (await db.from("items").select("id,slug,name,pixel_icon_url").eq("id", row.item_id).maybeSingle()).data
    if (!item) item = (await db.from("items").select("id,slug,name,pixel_icon_url").ilike("name", row.name).limit(1).maybeSingle()).data
    if (!item) return NextResponse.json({ error: "Not in the item catalogue, so it cannot lie on the floor." }, { status: 409 })
    const left = (row.quantity ?? 1) - 1
    // THE LAST OF IT IS PARKED, NOT DELETED (lib/floor-holder.ts): the row moves to the floor holder and the pile
    // remembers it, so the same item can be picked up again. One off a bigger stack is still just a count.
    const fid = left > 0 ? null : await floorHolderId(db)
    const { error } = left > 0
      ? await db.from("inventory_items").update({ quantity: left }).eq("id", row.id)
      : fid ? await db.from("inventory_items").update({ character_id: fid }).eq("id", row.id)
      : await db.from("inventory_items").delete().eq("id", row.id)   // no holder could be made: the old behaviour
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (left <= 0) await db.from("equipment_items").delete().eq("character_id", characterId).eq("name", row.name)
    const piles = await readFloor(db)
    const pile: Pile = { id: crypto.randomUUID(), node, x: Math.round(x), y: Math.round(y), itemId: item.id, slug: item.slug, name: item.name, pixel: item.pixel_icon_url ?? null, at: new Date().toISOString(), ...(fid ? { rowId: row.id } : {}) }
    const err = await writeFloor(db, [...piles, pile], `${who.name} ${body?.thrown ? "threw" : "dropped"} ${item.name}`)
    if (err) return NextResponse.json({ error: err.message }, { status: 500 })
    await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text: `${who.name}'s ${item.name} lies on the floor${body?.thrown ? " where the throw left it" : ""}.` })
    await syncCarried(db, characterId)
    if (left > 0 || fid) await recordItemMove(db, { inventoryItemId: row.id, characterId, kind: "drop", detail: { to: "the floor", node, x: Math.round(x), y: Math.round(y), thrown: body?.thrown ? true : undefined, qty: 1, left: Math.max(0, left), by: who.name } })   // the row survives either way now
    return NextResponse.json({ ok: true, pile })
  }

  if (action === "give") {
    // Sam, 2026-11-10: "I should be able to look at my inventory items and have the option to transfer it to a list
    // of characters." One character's own item into another's inventory. Only what they carry, never more than they
    // carry, and never the piece they are wearing or holding (the walk says "take it off first"; this checks again).
    // A whole row moves as itself, so its condition, upgrades and brew go with it; part of a stack is split off.
    const characterId = String(body?.characterId ?? ""), targetId = String(body?.targetCharacterId ?? "")
    const itemKey = String(body?.itemKey ?? ""), itemName = String(body?.itemName ?? "")
    if (!characterId || !targetId || (!itemKey && !itemName)) return NextResponse.json({ error: "characterId, targetCharacterId and an item required" }, { status: 400 })
    if (characterId === targetId) return NextResponse.json({ error: "That is already yours." }, { status: 409 })
    const { data: people } = await db.from("characters").select("id,name").in("id", [characterId, targetId])
    const who = (people ?? []).find((p) => p.id === characterId), to = (people ?? []).find((p) => p.id === targetId)
    if (!who || !to) return NextResponse.json({ error: "No such character." }, { status: 404 })
    let q = db.from("inventory_items").select("*").eq("character_id", characterId)
    q = itemKey ? q.eq("item_key", itemKey) : q.eq("name", itemName)
    const { data: rows } = await q
    const row = (rows ?? [])[0]
    if (!row) return NextResponse.json({ error: "You are not carrying that." }, { status: 409 })
    const have = (rows ?? []).reduce((n, x) => n + (x.quantity ?? 1), 0)
    const want = Math.max(1, Math.min(Math.floor(Number(body?.quantity) || 1), row.quantity ?? 1))
    const { count: wornCount } = await db.from("equipment_items").select("id", { count: "exact", head: true })
      .eq("character_id", characterId).eq("name", row.name).neq("equipped", false)
    if (have - want < (wornCount ?? 0)) return NextResponse.json({ error: `Take the ${row.name} off first.` }, { status: 409 })

    // carrying capacity (lib/carry.ts) — a HERO's pack has a limit; an NPC taking what they asked for is not weighed
    { const theirsNow = await carriedNow(db, targetId)
      if (theirsNow.isPlayer) { const v = carryVerdict(theirsNow.name, theirsNow.carried, theirsNow.max, Number(row.weight ?? 0) * want, row.name, want)
        if (!v.ok) return NextResponse.json({ error: v.why, carry: v }, { status: 409 }) } }

    let stackable = false
    if (row.item_id) stackable = Boolean((await db.from("items").select("stackable").eq("id", row.item_id).maybeSingle()).data?.stackable)
    const { data: theirs } = stackable
      ? await db.from("inventory_items").select("id,quantity").eq("character_id", targetId).eq("name", row.name).limit(1).maybeSingle()
      : { data: null }
    const whole = want >= (row.quantity ?? 1)
    let error: { message: string } | null = null
    let movedRowId: string | null = null   // the row that IS the thing in the receiver's pack afterwards
    if (theirs) {
      movedRowId = theirs.id
      // into their stack first, then off the giver's: if the second step fails the thing is doubled, never lost
      error = (await db.from("inventory_items").update({ quantity: (theirs.quantity ?? 0) + want }).eq("id", theirs.id)).error
      if (!error) error = whole
        ? (await db.from("inventory_items").delete().eq("id", row.id)).error
        : (await db.from("inventory_items").update({ quantity: (row.quantity ?? 1) - want }).eq("id", row.id)).error
    } else if (whole) {
      error = (await db.from("inventory_items").update({ character_id: targetId }).eq("id", row.id)).error
      movedRowId = row.id   // the same row: its condition, upgrades and history go with it
    } else {
      const { id: _id, created_at: _c, updated_at: _u, ...copy } = row as Record<string, unknown>
      void _id; void _c; void _u
      const ins = await db.from("inventory_items").insert({ ...copy, character_id: targetId, quantity: want }).select("id").maybeSingle()
      error = ins.error; movedRowId = (ins.data?.id as string) ?? null
      if (!error) error = (await db.from("inventory_items").update({ quantity: (row.quantity ?? 1) - want }).eq("id", row.id)).error
    }
    if (error) return NextResponse.json({ error: `Could not hand it over: ${error.message}` }, { status: 500 })
    await syncCarried(db, characterId, targetId)
    await recordItemMove(db, { inventoryItemId: movedRowId, characterId: targetId, kind: "give", detail: { from: who.name, from_id: characterId, to: to.name, to_id: targetId, qty: want } })
    await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text: `${who.name} gives ${want > 1 ? `${want} × ` : ""}${row.name} to ${to.name}.` })
    return NextResponse.json({ ok: true, gave: row.name, quantity: want, to: to.name })
  }

  return NextResponse.json({ error: "expected action place, remove, pickup, consume, drop or give" }, { status: 400 })
}
