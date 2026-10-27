import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isDmRequest } from "@/lib/dm-session"
import { readSeated, unseatCharacter } from "@/lib/seats"
import { nextSeatNumber, readTable, readTableView, startIfReady, writeSeat } from "@/lib/table-store"
import { decideSeat, exceptionWarning } from "@/lib/roster-exception"

// /api/seat — the DM's hand on the seats (lib/seats.ts).
//
//   GET                      → who is seated this run (anyone may ask; the map shows it anyway)
//   POST   { characterId } or { name } → seat a player character as a DM-RUN COMPANION (x-dm-key)
//          + { override: true } while LIVE → the DM's exception for a canon hero (lib/roster-exception.ts)
//   DELETE ?characterId=…    → send a companion away (x-dm-key); a player's own seat is left alone
//
// A player's seat is never taken here — that happens when their claim is verified. The DM gate is
// the same one /api/world-flags uses; unset, it is open, so a missing env var never locks Sam out.

export const dynamic = "force-dynamic"

// The DM's session cookie (/dm, lib/dm-session.ts) or the older x-dm-key header. With no DM code
// set the route stays OPEN, as before, so a missing env var never locks Sam out of his own game.
function authorized(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return true
  return isDmRequest(req, normalizeCode, safeEquals)
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
  // The roster locks when the session begins, for the DM too (Sam, 2026-10-25): a companion is seated at
  // the staging table before the start, like everyone else (lib/table.ts). One exception (Sam, 2026-10-26): a
  // canon hero may still be brought in while live, once the DM confirms the warning (`override: true`).
  const table = await readTable(db)
  const decision = decideSeat(table.status, ch.id, body.override === true)
  if (!decision.ok) {
    return NextResponse.json({
      error: decision.error, code: decision.code, canOverride: decision.canOverride, name: ch.name,
      ...(decision.canOverride ? { warning: exceptionWarning(ch.name) } : {}),
    }, { status: decision.status })
  }
  const view = await readTableView(db)
  if (!view.seats.some((s) => s.id === ch.id)) {
    const seat = nextSeatNumber(view)
    if (seat == null) return NextResponse.json({ error: "Every seat at the table is taken." }, { status: 409 })
    const note = decision.exception ? `${ch.name} brought in mid-session by the DM (roster exception)` : `${ch.name} runs as the DM's companion`
    await writeSeat(db, { id: ch.id, name: ch.name, at: new Date().toISOString(), dm: true, seat, ready: true }, "dm", note)
    if (!decision.exception) await startIfReady(db, await readTableView(db))   // live already: nothing to start
  }
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
