import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isDmRequest } from "@/lib/dm-session"

// /api/playtest-notes — the DM's notes to Claude, written while playing.
//
// Sam, 2026-11-13: "Is there a way for me to play test the game and give you cues on what to fix as I do it?" -> "go".
// On the painted map the DM presses F9, types one line and plays on. The page sends the line with a picture of the
// stage and the game's state at that moment (plate, mode, who stands where, the fight, the last log lines, the page's
// own errors). Claude reads the open notes later, fixes them, and marks each one done with what fixed it.
//
//   POST  {note, plate, area, state, shot?}   save one note (shot: a data:image/jpeg URL; stored in vtt-assets/playtest/)
//   GET   ?status=open|done|all               list notes, newest first (no state, to keep it light; ?id= for one in full)
//   PATCH {id, status, resolution}            mark a note done (or open again), with what fixed it
//
// DM only, every method. The table (playtest_notes) has RLS on and no policies: only this route's service role reads it.

export const dynamic = "force-dynamic"

const BUCKET = "vtt-assets"
const MAX_SHOT = 3_000_000 // characters of base64: a 1280-wide JPEG is far below this
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n)
const dm = (req: NextRequest) => isDmRequest(req, normalizeCode, safeEquals)
const shotUrl = (path: string | null) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}` : null

export async function POST(req: NextRequest) {
  if (!dm(req)) return NextResponse.json({ error: "DM only" }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const note = clip(body.note, 600)
  if (!note) return NextResponse.json({ error: "note is required" }, { status: 400 })
  const db = createAdminClient()

  const { data: row, error } = await db
    .from("playtest_notes")
    .insert({ note, plate: clip(body.plate, 40) || null, area: clip(body.area, 120) || null, state: body.state ?? null })
    .select("id")
    .single()
  if (error || !row) return NextResponse.json({ error: error?.message || "could not save" }, { status: 500 })

  // the picture is best-effort: a note without one is still a note
  const shot = typeof body.shot === "string" ? body.shot : ""
  const m = /^data:image\/jpeg;base64,(.+)$/.exec(shot)
  if (m && m[1].length <= MAX_SHOT) {
    const path = `playtest/${row.id}.jpg`
    const up = await db.storage.from(BUCKET).upload(path, Buffer.from(m[1], "base64"), { contentType: "image/jpeg", upsert: true })
    if (!up.error) await db.from("playtest_notes").update({ shot_path: path }).eq("id", row.id)
  }

  const { count } = await db.from("playtest_notes").select("id", { count: "exact", head: true }).eq("status", "open")
  return NextResponse.json({ ok: true, id: row.id, count: count ?? null })
}

export async function GET(req: NextRequest) {
  if (!dm(req)) return NextResponse.json({ error: "DM only" }, { status: 403 })
  const db = createAdminClient()
  const id = req.nextUrl.searchParams.get("id")
  if (id) {
    const { data } = await db.from("playtest_notes").select("*").eq("id", id).maybeSingle()
    return NextResponse.json({ note: data ? { ...data, shot_url: shotUrl(data.shot_path) } : null })
  }
  const status = req.nextUrl.searchParams.get("status") || "open"
  let q = db.from("playtest_notes").select("id, created_at, note, plate, area, shot_path, status, resolution").order("created_at", { ascending: false }).limit(200)
  if (status !== "all") q = q.eq("status", status)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notes: (data ?? []).map((n) => ({ ...n, shot_url: shotUrl(n.shot_path) })) })
}

export async function PATCH(req: NextRequest) {
  if (!dm(req)) return NextResponse.json({ error: "DM only" }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const id = clip(body.id, 64)
  const status = body.status === "open" ? "open" : "done"
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })
  const db = createAdminClient()
  const { error } = await db.from("playtest_notes").update({ status, resolution: clip(body.resolution, 600) || null }).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
