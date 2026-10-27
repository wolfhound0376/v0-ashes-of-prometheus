import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { CONFISCATION_STASH_NAME } from "@/lib/confiscation"
import { BOOK_CONTAINERS, BODY_KIT, POCKETS, PEN_KEY_SLUG, isValuable, parseContainer, type LootEntry } from "@/lib/walk-loot"

// /api/walk-loot — what is in Velkynvelve's chests, on its dead and in its guards' pockets (see lib/walk-loot.ts).
//
//   GET  ?container=ID          → what is there now. ID: ilvara-chest | shoor-chest | barracks-west | barracks-east |
//                                  body:<slug>:<which> | pocket:<slug>
//   GET  ?stash=1               → DM: every confiscated item and who (if anyone) the DM has handed it to
//   POST {action:"take", characterId, container, slug | rowId}  → into that character's inventory_items
//   POST {action:"carry", rowId, slug | null}                     → DM: hand a confiscated item to a drow, or back
//
// What has been taken is one world flag, `walk-loot`: {taken: {container: {slug: n}}, carry: {rowId: slug}}.
// No migration for the mechanism. migrations/walk_loot_catalog.sql adds the five catalogue rows the book names that
// the catalogue did not have (headdress, moonstone, silver coin, common clothes, the slave pen key); until it is pasted in, those show
// as "not in the catalogue yet" and cannot be taken.

export const dynamic = "force-dynamic"

const CAMPAIGN = "ashes-of-prometheus"
const KEY = "walk-loot"
type Db = ReturnType<typeof createAdminClient>
type State = { taken: Record<string, Record<string, number>>; carry: Record<string, string> }
type Item = { id: string; slug: string; name: string; item_type: string; rarity: string | null; icon_url: string | null; pixel_icon_url: string | null; description: string | null; equippable_slot: string | null; weight: number | null; value: number | null; stackable: boolean }

function authorized(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return true
  return safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}
async function readState(db: Db): Promise<State> {
  const { data } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", KEY).maybeSingle()
  const v = (data?.value ?? {}) as Partial<State>
  return { taken: v.taken ?? {}, carry: v.carry ?? {} }
}
async function writeState(db: Db, s: State, note: string) {
  const { error } = await db.from("world_flags").upsert({ campaign_id: CAMPAIGN, key: KEY, value: s, set_by: "walk", note }, { onConflict: "campaign_id,key" })
  return error
}
async function stashId(db: Db): Promise<string | null> {
  const { data } = await db.from("characters").select("id").eq("name", CONFISCATION_STASH_NAME).order("created_at", { ascending: true }).limit(1).maybeSingle()
  return (data?.id as string) ?? null
}
const ITEM_COLS = "id,slug,name,item_type,rarity,icon_url,pixel_icon_url,description,equippable_slot,weight,value,stackable"
async function itemsBySlug(db: Db, slugs: string[]): Promise<Map<string, Item>> {
  if (!slugs.length) return new Map()
  const { data } = await db.from("items").select(ITEM_COLS).in("slug", [...new Set(slugs)])
  return new Map(((data ?? []) as Item[]).map((i) => [i.slug, i]))
}
type StashRow = { id: string; name: string; quantity: number | null; item_type: string | null; icon_url: string | null; items: { item_type: string; rarity: string | null; pixel_icon_url: string | null; equippable_slot?: string | null; icon_url: string | null } | null; owner: { name: string } | null }
async function stashRows(db: Db, sid: string): Promise<StashRow[]> {
  const { data } = await db.from("inventory_items")
    .select("id,name,quantity,item_type,icon_url,items(item_type,rarity,pixel_icon_url,icon_url,equippable_slot),owner:characters!inventory_items_confiscated_from_fkey(name)")
    .eq("character_id", sid).order("name")
  return (data ?? []) as unknown as StashRow[]
}

// one row of what a container holds, as the walk shows it
// `slot`: the catalogue's equippable slot, or null. On a living mark the map offers only slot-less things to a
// pickpocket — a weapon, armour or a ring is worn or wielded, not in a pocket (Sam, 2026-10-27: "NOT equipped").
type Shown = { kind: "book" | "stash"; slug?: string; rowId?: string; name: string; qty: number; note?: string; owner?: string | null; pixel: string | null; icon: string | null; missing?: boolean; slot?: string | null }

async function contents(db: Db, id: string, s: State): Promise<{ title: string; source: string; rows: Shown[] } | null> {
  const c = parseContainer(id); if (!c) return null
  const book: LootEntry[] = c.kind === "book" ? BOOK_CONTAINERS[id].entries : c.kind === "body" ? BODY_KIT[c.slug!] ?? [] : POCKETS[c.slug!] ?? []
  const cat = await itemsBySlug(db, book.map((e) => e.slug))
  const taken = s.taken[c.key] ?? {}
  const penKeyGone = Object.entries(s.taken).some(([k, v]) => k.startsWith("pocket:") && (v[PEN_KEY_SLUG] ?? 0) > 0)
  const rows: Shown[] = []
  for (const e of book){
    const left = e.qty - (taken[e.slug] ?? 0)
    if (left <= 0 || (c.kind === "pocket" && e.slug === PEN_KEY_SLUG && penKeyGone)) continue
    const it = cat.get(e.slug)
    rows.push({ kind: "book", slug: e.slug, name: it?.name ?? e.slug.replace(/-/g, " "), qty: left, note: e.note, pixel: it?.pixel_icon_url ?? null, icon: it?.icon_url ?? null, missing: !it, slot: it?.equippable_slot ?? null })
  }
  const sid = await stashId(db)
  if (sid){
    const all = await stashRows(db, sid)
    for (const r of all){
      const carriedBy = s.carry[r.id]
      const type = r.items?.item_type ?? r.item_type, val = isValuable(r.name, type, r.items?.rarity)
      const here = c.kind === "book" ? (!carriedBy && BOOK_CONTAINERS[id].stash === (val ? "valuables" : "gear")) : carriedBy === c.slug
      if (!here) continue
      rows.push({ kind: "stash", rowId: r.id, name: r.name, qty: r.quantity ?? 1, owner: r.owner?.name ?? null, pixel: r.items?.pixel_icon_url ?? null, icon: r.items?.icon_url ?? r.icon_url ?? null, slot: r.items?.equippable_slot ?? null })
    }
  }
  const title = c.kind === "book" ? BOOK_CONTAINERS[id].title : c.kind === "body" ? "The body" : POCKETS[c.slug!] ? "The guard's belt and pockets" : "A belt and pockets"
  const source = c.kind === "book" ? BOOK_CONTAINERS[id].source : c.kind === "body" ? (BODY_KIT[c.slug!] ? "A drow warrior's kit, OotA ch.1 area 2." : "Only what the DM handed them.") : "OotA ch.1, Acquisitions: \"lift a key to the slave pen from a guard\"."
  return { title, source, rows }
}

export async function GET(req: NextRequest) {
  const db = createAdminClient(), s = await readState(db)
  if (req.nextUrl.searchParams.get("stash") === "1"){
    if (!authorized(req)) return NextResponse.json({ error: "DM only" }, { status: 403 })
    const sid = await stashId(db); if (!sid) return NextResponse.json({ rows: [] })
    const rows = (await stashRows(db, sid)).map((r) => ({ rowId: r.id, name: r.name, qty: r.quantity ?? 1, owner: r.owner?.name ?? null, carriedBy: s.carry[r.id] ?? null,
      where: s.carry[r.id] ? `on ${s.carry[r.id]}` : isValuable(r.name, r.items?.item_type ?? r.item_type, r.items?.rarity) ? "Ilvara's chest" : "Shoor's chest" }))
    return NextResponse.json({ rows })
  }
  const id = req.nextUrl.searchParams.get("container") ?? ""
  const out = await contents(db, id, s)
  return out ? NextResponse.json(out) : NextResponse.json({ error: "No such container." }, { status: 404 })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const action = String(body?.action ?? "")
  const db = createAdminClient(), s = await readState(db)

  if (action === "carry"){
    if (!authorized(req)) return NextResponse.json({ error: "DM only" }, { status: 403 })
    const rowId = String(body?.rowId ?? ""), slug = body?.slug ? String(body.slug) : null
    if (!rowId) return NextResponse.json({ error: "rowId required" }, { status: 400 })
    if (slug) s.carry[rowId] = slug; else delete s.carry[rowId]
    const err = await writeState(db, s, slug ? `DM handed a confiscated item to ${slug}` : "DM put a confiscated item back")
    return err ? NextResponse.json({ error: err.message }, { status: 500 }) : NextResponse.json({ ok: true, carry: s.carry })
  }

  if (action !== "take") return NextResponse.json({ error: "expected action take or carry" }, { status: 400 })
  const characterId = String(body?.characterId ?? ""), container = String(body?.container ?? "")
  const c = parseContainer(container)
  if (!characterId || !c) return NextResponse.json({ error: "characterId and container required" }, { status: 400 })
  const { data: who } = await db.from("characters").select("id,name").eq("id", characterId).maybeSingle()
  if (!who) return NextResponse.json({ error: "No such character." }, { status: 404 })
  const now = await contents(db, container, s); if (!now) return NextResponse.json({ error: "No such container." }, { status: 404 })
  const where = now.title === "The body" ? "a body" : now.title.replace(/^(The|A) /, (m) => m.toLowerCase())

  // a confiscated item: the row moves to the taker, and it is no longer anybody's confiscated property
  if (body?.rowId){
    const row = now.rows.find((r) => r.kind === "stash" && r.rowId === String(body.rowId))
    if (!row) return NextResponse.json({ error: "It is not there any more." }, { status: 409 })
    const sid = await stashId(db)
    const { error } = await db.from("inventory_items").update({ character_id: characterId, confiscated_from: null }).eq("id", row.rowId!).eq("character_id", sid!)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    delete s.carry[row.rowId!]; await writeState(db, s, `${who.name} took ${row.name}`)
    await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text: `${who.name} takes ${row.qty > 1 ? row.qty + " × " : ""}${row.name}${row.owner && row.owner !== who.name ? ` (${row.owner}'s)` : ""} from ${where}.` })
    return NextResponse.json({ ok: true, took: row.name, qty: row.qty })
  }

  // a book item: a catalogue row, the whole stack that is left
  const slug = String(body?.slug ?? "")
  const row = now.rows.find((r) => r.kind === "book" && r.slug === slug)
  if (!row) return NextResponse.json({ error: "It is not there any more." }, { status: 409 })
  const it = (await itemsBySlug(db, [slug])).get(slug)
  if (!it) return NextResponse.json({ error: `${row.name} is not in the item catalogue yet, so it cannot be taken.` }, { status: 409 })
  ;(s.taken[c.key] ??= {})[slug] = (s.taken[c.key][slug] ?? 0) + row.qty
  const err = await writeState(db, s, `${who.name} took ${it.name}`)
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })
  const { data: existing } = await db.from("inventory_items").select("id,quantity").eq("character_id", characterId).eq("item_id", it.id).is("confiscated_from", null).limit(1).maybeSingle()
  const { error } = existing && it.stackable
    ? await db.from("inventory_items").update({ quantity: (existing.quantity ?? 0) + row.qty }).eq("id", existing.id)
    : await db.from("inventory_items").insert({ character_id: characterId, name: it.name, quantity: row.qty, description: it.description, item_type: it.item_type, icon_url: it.icon_url,
        item_id: it.id, equippable_slot: it.equippable_slot, weight: it.weight, value: it.value })
  if (error){ s.taken[c.key][slug] -= row.qty; await writeState(db, s, `${it.name} put back: ${error.message}`); return NextResponse.json({ error: `Could not stow it: ${error.message}` }, { status: 500 }) }
  await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text: `${who.name} takes ${row.qty > 1 ? row.qty + " × " : ""}${it.name} from ${where}.` })
  return NextResponse.json({ ok: true, took: it.name, qty: row.qty })
}
