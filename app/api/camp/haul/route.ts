import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isHaulIn, matchCharacter, planHaul, poolAfter, shortName, type CatalogRow } from "@/lib/camp-haul"

// /api/camp/haul — the party's real food and packs, for Camp at the Fire.
//
//   GET  → { supplies, pool_exists, characters: [{id, name, short}],
//            packs: { <character id>: { <item slug>: quantity } } }
//          What the camp page should start from instead of `supplies = 20`
//          and a sample pack. Anyone may read: players see their own packs on
//          the dashboard already.
//   POST { who, mode, supplies_delta, items: [{slug, quantity}], note? }
//        → { ok, supplies, added: [{slug, quantity}], rejected: [...], flags }
//          A field trip's haul (forage / hunt / explore / wild) or a rest's
//          charge lands on `party_supplies` and the character's
//          `inventory_items`. Every slug must be a catalog row; the rest is
//          reported back as rejected, never written (lib/camp-haul.ts).
//
// WHO MAY WRITE. The same fail-open DM-key rule as /api/camp/docs and
// /api/travel: x-dm-key must match DM_ACCESS_CODE when that is set. The camp
// page already sends the key the browser keeps.

export const dynamic = "force-dynamic"

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return true
  const given = req.headers.get("x-dm-key") ?? ""
  return safeEquals(normalizeCode(given), normalizeCode(required))
}

const CHAR_COLS = "id,name"

async function players(db: ReturnType<typeof createAdminClient>) {
  const { data } = await db.from("characters").select(CHAR_COLS).eq("is_player", true).is("archived_at", null).order("name")
  return (data ?? []) as { id: string; name: string }[]
}

export async function GET() {
  const db = createAdminClient()
  const pcs = await players(db)
  const ids = pcs.map((c) => c.id)
  const [{ data: pool }, { data: inv }] = await Promise.all([
    db.from("party_supplies").select("id,supplies").limit(1).maybeSingle(),
    ids.length
      ? db.from("inventory_items").select("character_id,quantity,item_key,item_id").in("character_id", ids).is("confiscated_from", null)
      : Promise.resolve({ data: [] as { character_id: string; quantity: number | null; item_key: string | null; item_id: string | null }[] }),
  ])
  // Slugs come from items.slug; item_key is a copy some rows carry.
  const rows = (inv ?? []) as { character_id: string; quantity: number | null; item_key: string | null; item_id: string | null }[]
  const needSlug = [...new Set(rows.filter((r) => !r.item_key && r.item_id).map((r) => r.item_id as string))]
  const slugOf = new Map<string, string>()
  if (needSlug.length) {
    const { data: its } = await db.from("items").select("id,slug").in("id", needSlug)
    for (const it of (its ?? []) as { id: string; slug: string }[]) slugOf.set(it.id, it.slug)
  }
  const packs: Record<string, Record<string, number>> = {}
  for (const r of rows) {
    const slug = r.item_key ?? (r.item_id ? slugOf.get(r.item_id) : null)
    if (!slug) continue
    const p = (packs[r.character_id] ??= {})
    p[slug] = (p[slug] ?? 0) + Math.max(0, Number(r.quantity ?? 1))
  }
  return NextResponse.json({
    supplies: Math.max(0, Number(pool?.supplies ?? 0)),
    pool_exists: !!pool,
    characters: pcs.map((c) => ({ id: c.id, name: c.name, short: shortName(c.name) })),
    packs,
  })
}

export async function POST(req: NextRequest) {
  if (!isDm(req)) return NextResponse.json({ error: "unauthorized" }, { status: 403 })
  const raw = await req.json().catch(() => null)
  const whoIn = raw && typeof raw.who === "string" ? (raw.who as string) : null
  if (!whoIn || !isHaulIn(raw)) {
    return NextResponse.json({ error: "expected { who, mode, supplies_delta, items: [{slug, quantity}] }" }, { status: 400 })
  }
  const body = raw
  const db = createAdminClient()
  const pcs = await players(db)
  const who = matchCharacter(whoIn, pcs)
  if (!who) return NextResponse.json({ error: `no single player character matches "${whoIn}"` }, { status: 404 })

  const slugs = [...new Set(body.items.map((i) => String(i.slug ?? "").trim().toLowerCase()))].filter(Boolean)
  const { data: cat } = slugs.length
    ? await db.from("items").select("id,slug,name,item_type,weight,value,description").in("slug", slugs)
    : { data: [] as CatalogRow[] }
  const plan = planHaul(body, (cat ?? []) as CatalogRow[])
  const now = new Date().toISOString()

  // FOOD → the pool. Created on first use if the campaign has none yet,
  // keyed to the active run (party_supplies.campaign_id has no FK).
  let supplies = 0
  if (plan.supplies_delta !== 0) {
    const { data: pool } = await db.from("party_supplies").select("id,supplies").limit(1).maybeSingle()
    supplies = poolAfter(pool?.supplies, plan.supplies_delta)
    if (pool) {
      const { error } = await db.from("party_supplies").update({ supplies, updated_at: now }).eq("id", pool.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { data: run } = await db.from("campaign_runs").select("id").eq("campaign_id", "abyss").in("status", ["setup", "active"]).limit(1).maybeSingle()
      const { error } = await db.from("party_supplies").insert({ campaign_id: run?.id ?? null, supplies, updated_at: now })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      plan.flags.push("party_supplies had no row; one was created.")
    }
  } else {
    const { data: pool } = await db.from("party_supplies").select("supplies").limit(1).maybeSingle()
    supplies = Math.max(0, Number(pool?.supplies ?? 0))
  }

  // ITEMS → the character's pack. A stack grows; otherwise a new row carrying
  // the catalog's own name, type, weight and value (same shape as the chat
  // route's addCraftedToPack).
  const added: { slug: string; quantity: number }[] = []
  for (const { item, quantity } of plan.items) {
    const { data: stack } = await db
      .from("inventory_items")
      .select("id,quantity")
      .eq("character_id", who.id)
      .eq("item_id", item.id)
      .is("confiscated_from", null)
      .limit(1)
      .maybeSingle()
    const { error } = stack
      ? await db.from("inventory_items").update({ quantity: Number(stack.quantity ?? 1) + quantity, updated_at: now }).eq("id", stack.id)
      : await db.from("inventory_items").insert({
          character_id: who.id,
          item_id: item.id,
          item_key: item.slug,
          name: item.name,
          quantity,
          item_type: item.item_type ?? "misc",
          weight: item.weight ?? 0,
          value: item.value ?? 0,
          description: item.description,
        })
    if (error) plan.flags.push(`${item.slug}: not written (${error.message}).`)
    else added.push({ slug: item.slug, quantity })
  }

  return NextResponse.json({ ok: true, who: { id: who.id, name: who.name }, mode: body.mode, supplies, added, rejected: plan.rejected, flags: plan.flags })
}
