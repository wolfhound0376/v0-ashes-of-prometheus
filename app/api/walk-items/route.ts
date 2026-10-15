import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"

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
//
// WHAT IT COSTS is decided on the walk, which runs the fight: picking up spends movement, equipping
// spends the action (Sam's ruling above). This route only moves the thing.
//
// Everything on this floor is a catalogue item: `place` takes an items.id, never a free name. That is
// the invariant the AI is held to ("the AI cannot invent items"), applied to the DM's hand too.

export const dynamic = "force-dynamic"

const CAMPAIGN = "ashes-of-prometheus"
const KEY = "walk-floor"

type Pile = { id: string; node: string; x: number; y: number; itemId: string; slug: string; name: string; pixel: string | null; at: string }
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
      .select("id,slug,name,item_type,equippable_slot,pixel_icon_url,icon_url,description,stackable,properties")
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

    // Off the floor first, so two hands cannot take the same pile.
    const err = await writeFloor(db, piles.filter((p) => p.id !== pileId), `${who.name} picked up ${item.name}`)
    if (err) return NextResponse.json({ error: err.message }, { status: 500 })

    const { data: existing } = await db.from("inventory_items").select("id,quantity")
      .eq("character_id", characterId).eq("name", item.name).limit(1).maybeSingle()
    const { error } = existing && item.stackable
      ? await db.from("inventory_items").update({ quantity: (existing.quantity ?? 0) + 1, item_id: item.id }).eq("id", existing.id)
      : await db.from("inventory_items").insert({
          character_id: characterId, name: item.name, quantity: 1, description: item.description,
          item_type: item.item_type, icon_url: item.icon_url, item_id: item.id,
          equippable_slot: item.equippable_slot, weight: item.weight, value: item.value,
        })
    if (error) {
      await writeFloor(db, piles, `${item.name} put back: ${error.message}`)    // back on the floor rather than lost
      return NextResponse.json({ error: `Could not stow it: ${error.message}` }, { status: 500 })
    }
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
    const { error } = left > 0
      ? await db.from("inventory_items").update({ quantity: left }).eq("id", row.id)
      : await db.from("inventory_items").delete().eq("id", row.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (left <= 0) await db.from("equipment_items").delete().eq("character_id", characterId).eq("name", row.name)
    const piles = await readFloor(db)
    const pile: Pile = { id: crypto.randomUUID(), node, x: Math.round(x), y: Math.round(y), itemId: item.id, slug: item.slug, name: item.name, pixel: item.pixel_icon_url ?? null, at: new Date().toISOString() }
    const err = await writeFloor(db, [...piles, pile], `${who.name} ${body?.thrown ? "threw" : "dropped"} ${item.name}`)
    if (err) return NextResponse.json({ error: err.message }, { status: 500 })
    await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text: `${who.name}'s ${item.name} lies on the floor${body?.thrown ? " where the throw left it" : ""}.` })
    return NextResponse.json({ ok: true, pile })
  }

  return NextResponse.json({ error: "expected action place, remove, pickup, consume or drop" }, { status: 400 })
}
