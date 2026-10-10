import { type NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"

// /api/camp/docs — the saved state behind the two camp pages that came over
// from claude.ai artifacts (public/camp/fire, public/camp/scenes).
//
// In the artifact those pages kept a small document store. public/camp/
// claude-shim.js gives them the same calls here and sends them to this route,
// so the pages run unchanged; the documents live in `camp_docs`.
//
//   GET  ?app=&collection=[&where=&eq=][&order=&dir=asc|desc][&limit=]  → { docs: [{id, data}] }
//   GET  ?app=&collection=&id=                                         → { doc: {id, data} | null }
//   POST { app, collection, op: "set"|"update"|"add"|"delete", id?, data? } → { ok, id }
//
// WHO MAY WRITE. Rooms a player walks into ("found") are canon the moment
// they are entered, so anyone may record them. Everything else (Map maker
// layouts, playtest notes, tuning numbers) is the DM's: it needs x-dm-key to
// match DM_ACCESS_CODE when that is set, the same fail-open rule as
// /api/travel and the /join gate.

export const dynamic = "force-dynamic"

const APPS = new Set(["fire", "scenes"])
const OPEN_COLLECTIONS = new Set(["scenes/found"])
const COLLECTION = /^[a-z_]{1,40}$/
const MAX_BYTES = 200_000

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return true
  const given = req.headers.get("x-dm-key") ?? ""
  return safeEquals(normalizeCode(given), normalizeCode(required))
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

/** Only plain field names may reach a JSON path filter. */
function field(f: string | null): string | null {
  return f && /^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(f) ? f : null
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const app = q.get("app") ?? ""
  const collection = q.get("collection") ?? ""
  if (!APPS.has(app) || !COLLECTION.test(collection)) return bad("app and collection required")
  const db = createAdminClient()

  const id = q.get("id")
  if (id) {
    const { data, error } = await db
      .from("camp_docs")
      .select("doc_id,data")
      .eq("app", app)
      .eq("collection", collection)
      .eq("doc_id", id)
      .maybeSingle()
    if (error) return bad(error.message, 500)
    return NextResponse.json({ doc: data ? { id: data.doc_id, data: data.data } : null })
  }

  let query = db.from("camp_docs").select("doc_id,data").eq("app", app).eq("collection", collection)
  const where = field(q.get("where"))
  if (where) query = query.eq(`data->>${where}`, q.get("eq") ?? "")
  const order = field(q.get("order"))
  query = order
    ? query.order(`data->>${order}`, { ascending: q.get("dir") !== "desc" })
    : query.order("created_at", { ascending: true })
  const limit = Math.min(Math.max(Number(q.get("limit")) || 500, 1), 1000)
  const { data, error } = await query.limit(limit)
  if (error) return bad(error.message, 500)
  return NextResponse.json({ docs: (data ?? []).map((r) => ({ id: r.doc_id, data: r.data })) })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const app = body?.app
  const collection = body?.collection
  const op = body?.op
  if (!APPS.has(app) || typeof collection !== "string" || !COLLECTION.test(collection)) {
    return bad("app and collection required")
  }
  if (!["set", "update", "add", "delete"].includes(op)) return bad("op must be set | update | add | delete")
  if (!OPEN_COLLECTIONS.has(`${app}/${collection}`) && !isDm(req)) {
    return bad("only the DM can save this", 403)
  }

  const data = body?.data ?? {}
  if (op !== "delete") {
    if (typeof data !== "object" || Array.isArray(data) || data === null) return bad("data must be an object")
    if (JSON.stringify(data).length > MAX_BYTES) return bad("document too large", 413)
  }
  const id = op === "add" ? randomUUID() : typeof body?.id === "string" ? body.id.slice(0, 200) : ""
  if (!id) return bad("id required")

  const db = createAdminClient()
  const now = new Date().toISOString()

  if (op === "delete") {
    const { error } = await db.from("camp_docs").delete().eq("app", app).eq("collection", collection).eq("doc_id", id)
    if (error) return bad(error.message, 500)
    return NextResponse.json({ ok: true, id })
  }

  let next = data
  if (op === "update") {
    const { data: cur } = await db
      .from("camp_docs")
      .select("data")
      .eq("app", app)
      .eq("collection", collection)
      .eq("doc_id", id)
      .maybeSingle()
    if (!cur) return bad("no such document", 404)
    next = { ...(cur.data as Record<string, unknown>), ...data }
  }

  const { error } = await db
    .from("camp_docs")
    .upsert({ app, collection, doc_id: id, data: next, updated_at: now }, { onConflict: "app,collection,doc_id" })
  if (error) return bad(error.message, 500)
  return NextResponse.json({ ok: true, id })
}
