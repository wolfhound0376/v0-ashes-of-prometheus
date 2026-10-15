import { createAdminClient } from "@/lib/supabase/admin"
import { readGameClock } from "@/lib/time-tracking"
import { absoluteMinutes } from "@/lib/long-rest"
import { bardState, grantInspiration, heldInspiration, spendInspiration } from "@/lib/bardic-inspiration"

// /api/bardic — Bardic Inspiration, stored (lib/bardic-inspiration owns the rule).
//
//   GET  ?who=Scott,Ront,Fifi%20of%20Copperas%20Cove
//        → { now, characters: [{ id, name, bard: {die,max,used,left} | null, held: {die,from_name} | null }] }
//   POST { action: "grant", bard: <ref>, target: <ref>, distanceFt? }
//   POST { action: "spend", who: <ref>, face? }
//
// A <ref> is a character id or a name, so the painted map can name an NPC
// (Ront, Eldeth) the same way it names a player. Any character row can hold a
// die: the storage does not care whether the holder is a PC.
//
// Writes go through the service-role client because `characters` has no anon
// UPDATE policy for these columns.

export const dynamic = "force-dynamic"

const COLS = "id,name,class,level,cha_modifier,hp_current,sheet_resources,archived_at"
type Row = {
  id: string; name: string; class: string | null; level: number | null; cha_modifier: number | null
  hp_current: number | null; sheet_resources: unknown; archived_at: string | null
}

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)

async function nowMinutes(admin: ReturnType<typeof createAdminClient>): Promise<number | null> {
  const { data: sess } = await admin.from("sessions").select("id, status, started_at").order("started_at", { ascending: false })
  const rows = (sess ?? []) as { id: string; status: string | null }[]
  const sessionId = (rows.find((s) => s.status === "active") ?? rows[0])?.id ?? null
  const clock = await readGameClock(admin, sessionId)
  return clock ? absoluteMinutes(clock.day, clock.minutesOfDay) : null
}

async function find(admin: ReturnType<typeof createAdminClient>, ref: unknown): Promise<Row | null> {
  const r = typeof ref === "string" ? ref.trim() : ""
  if (!r) return null
  const q = () => admin.from("characters").select(COLS).is("archived_at", null)
  if (isUuid(r)) {
    const { data } = await q().eq("id", r).limit(1)
    return ((data ?? []) as Row[])[0] ?? null
  }
  const lit = r.replace(/[\\%_]/g, (m) => "\\" + m)
  let { data } = await q().ilike("name", lit).limit(2)
  // The map calls her "Eldeth"; the row is "Eldeth Feldrun". First name only
  // when the full name found nobody.
  if (!data?.length) ({ data } = await q().ilike("name", `${lit} %`).limit(2))
  const rows = (data ?? []) as Row[]
  // Two live rows with one name is a real ambiguity (the stale "Kenta" twin);
  // refuse it rather than inspire the wrong one.
  return rows.length === 1 ? rows[0] : null
}

function view(c: Row, now: number | null) {
  const s = bardState(c)
  const h = heldInspiration(c.sheet_resources, now)
  return {
    id: c.id, name: c.name,
    bard: s.isBard ? { die: s.die, max: s.max, used: s.used, left: s.left } : null,
    held: h ? { die: h.die, from_name: h.from_name } : null,
  }
}

function admin() {
  try { return createAdminClient() } catch (e) { console.error("[bardic] admin client unavailable:", e); return null }
}

export async function GET(req: Request) {
  const db = admin()
  if (!db) return Response.json({ error: "server_unavailable" }, { status: 500 })
  const who = (new URL(req.url).searchParams.get("who") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20)
  const now = await nowMinutes(db)
  const out = []
  for (const w of who) { const c = await find(db, w); if (c) out.push(view(c, now)) }
  return Response.json({ now, characters: out })
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return Response.json({ ok: false, reason: "invalid_json" }, { status: 400 }) }
  const db = admin()
  if (!db) return Response.json({ ok: false, reason: "server_unavailable" }, { status: 500 })
  const now = await nowMinutes(db)

  if (body.action === "grant") {
    const [bard, target] = [await find(db, body.bard), await find(db, body.target)]
    if (!bard || !target) return Response.json({ ok: false, reason: "Could not find exactly one character for each name." }, { status: 404 })
    if ((target.hp_current ?? 1) <= 0) return Response.json({ ok: false, reason: `${target.name} is down and cannot hear the song.` }, { status: 409 })
    const distanceFt = typeof body.distanceFt === "number" && isFinite(body.distanceFt) ? body.distanceFt : null
    const g = grantInspiration({ bard, target, distanceFt, now })
    if (!g.ok) return Response.json(g, { status: 409 })
    // Bard first: if the second write fails, a use is spent with no die given,
    // which a long rest fixes — never a free die with no use spent.
    const a = await db.from("characters").update({ sheet_resources: g.bardResources }).eq("id", bard.id)
    if (a.error) return Response.json({ ok: false, reason: a.error.message }, { status: 500 })
    const b = await db.from("characters").update({ sheet_resources: g.targetResources }).eq("id", target.id)
    if (b.error) return Response.json({ ok: false, reason: b.error.message }, { status: 500 })
    return Response.json({ ok: true, die: g.die, left: g.left, note: g.note })
  }

  if (body.action === "spend") {
    const c = await find(db, body.who)
    if (!c) return Response.json({ ok: false, reason: "Could not find exactly one character by that name." }, { status: 404 })
    const s = spendInspiration(c, now, { face: typeof body.face === "number" ? body.face : null })
    if (!s.ok) return Response.json(s, { status: 409 })
    const { error } = await db.from("characters").update({ sheet_resources: s.resources }).eq("id", c.id)
    if (error) return Response.json({ ok: false, reason: error.message }, { status: 500 })
    return Response.json({ ok: true, die: s.die, face: s.face, note: s.note })
  }

  return Response.json({ ok: false, reason: "unknown_action" }, { status: 400 })
}
