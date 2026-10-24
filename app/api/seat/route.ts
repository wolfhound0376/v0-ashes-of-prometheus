import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { readSeated, seatCharacter, unseatCharacter } from "@/lib/seats"

// /api/seat — the DM's hand on the seats (lib/seats.ts).
//
//   GET                      → who is seated this run (anyone may ask; the map shows it anyway)
//   POST   { characterId } or { name } → seat a player character as a DM-RUN COMPANION (x-dm-key)
//   DELETE ?characterId=…    → send a companion away (x-dm-key); a player's own seat is left alone
//
// A player's seat is never taken here — that happens when their claim is verified. The DM gate is
// the same one /api/world-flags uses; unset, it is open, so a missing env var never locks Sam out.

export const dynamic = "force-dynamic"

function authorized(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return true
  return safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

// `roster` is every player character in the game (names and classes only — nothing a player at the table
// could not already see on the map), so the DM tools can bring in anyone, a hero made at the Forge included
// (Sam, 2026-10-23: "I should also be able to add characters on to the map from DM tools").
export async function GET() {
  try {
    const db = createAdminClient()
    const [seated, { data }] = await Promise.all([
      readSeated(db),
      db.from("characters").select("id, name, class").eq("is_player", true).is("archived_at", null).order("created_at", { ascending: true }),
    ])
    const roster = (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string, cls: (c.class as string | null) ?? "" }))
    return NextResponse.json({ seated, roster })
  } catch (e) {
    return NextResponse.json({ seated: [], roster: [], error: String(e) })
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "DM only" }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const characterId = typeof body.characterId === "string" ? body.characterId : ""
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!characterId && !name) return NextResponse.json({ error: "characterId or name required" }, { status: 400 })
  const db = createAdminClient()
  const q = db.from("characters").select("id, name, is_player").is("archived_at", null).eq("is_player", true)
  const { data: ch } = await (characterId ? q.eq("id", characterId) : q.ilike("name", name)).limit(1).maybeSingle()
  if (!ch || !ch.is_player) return NextResponse.json({ error: "not a player character" }, { status: 404 })
  await seatCharacter(db, { id: ch.id, name: ch.name }, { dm: true })
  return NextResponse.json({ ok: true, seated: await readSeated(db) })
}

export async function DELETE(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "DM only" }, { status: 403 })
  const characterId = req.nextUrl.searchParams.get("characterId")?.trim()
  if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 })
  const db = createAdminClient()
  const seat = (await readSeated(db)).find((s) => s.id === characterId)
  if (seat && !seat.dm) return NextResponse.json({ error: "that seat belongs to a player" }, { status: 409 })
  await unseatCharacter(db, characterId)
  return NextResponse.json({ ok: true, seated: await readSeated(db) })
}
