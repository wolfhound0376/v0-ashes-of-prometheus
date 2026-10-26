import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isDmRequest } from "@/lib/dm-session"
import { cannotChooseFigure, cannotSit, isComplete, missingOf, type TableState } from "@/lib/table"
import {
  clearSeats, nextSeatNumber, readTable, readTableView, readinessFor, removeSeat, startIfReady, writeSeat, writeTable,
  type TableView,
} from "@/lib/table-store"

// /api/table — the staging table (lib/table.ts has the rules and Sam's words).
//
//   GET  ?characterId=…            the room: state, the DM's light, every seat and its light; `mine` says
//                                  whether that character holds a seat. Anyone may read it — names, lights
//                                  and what each seat is missing, nothing secret.
//   POST { action, … }
//     DM (cookie or x-dm-key):     open · start · unstart · remove {characterId} · companion {characterId} · end
//     player (characterId + claimToken):  sit · ready · unready · leave · figure {figure: 0..6}
//
// Every change re-checks the start condition, so the session begins the moment the last light turns green,
// whoever turned it.

export const dynamic = "force-dynamic"

const DM_ACTIONS = new Set(["open", "start", "unstart", "remove", "companion", "end"])
const PLAYER_ACTIONS = new Set(["sit", "ready", "unready", "leave", "figure"])

function isDm(req: NextRequest): boolean {
  return isDmRequest(req, normalizeCode, safeEquals)
}

async function claimOk(db: ReturnType<typeof createAdminClient>, characterId: string, claimToken: string): Promise<boolean> {
  if (!characterId || !claimToken) return false
  const { data } = await db.from("character_secrets").select("claim_token").eq("character_id", characterId).maybeSingle()
  return Boolean(data && data.claim_token === claimToken)
}

function reply(view: TableView, characterId?: string | null, extra: Record<string, unknown> = {}) {
  const mine = characterId ? view.seats.find((s) => s.id === characterId) ?? null : null
  return NextResponse.json({ ...view, mine, ...extra })
}

export async function GET(req: NextRequest) {
  try {
    const db = createAdminClient()
    const view = await readTableView(db)
    return reply(view, req.nextUrl.searchParams.get("characterId"), { isDm: isDm(req) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = typeof body.action === "string" ? body.action : ""
  const characterId = typeof body.characterId === "string" ? body.characterId : ""
  let db: ReturnType<typeof createAdminClient>
  try { db = createAdminClient() } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }

  try {
    if (DM_ACTIONS.has(action)) {
      if (!isDm(req)) return NextResponse.json({ error: "Only the Dungeon Master can do that." }, { status: 403 })
      return await dmAction(db, action, characterId)
    }
    if (PLAYER_ACTIONS.has(action)) {
      const claimToken = typeof body.claimToken === "string" ? body.claimToken : ""
      if (!(await claimOk(db, characterId, claimToken))) return NextResponse.json({ error: "Your door code did not check out. Come in through the door again." }, { status: 403 })
      return await playerAction(db, action, characterId, body.figure)
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 })
  } catch (e) {
    console.error("[table]", action, e)
    return NextResponse.json({ error: "The table could not be changed. Try again." }, { status: 500 })
  }
}

async function dmAction(db: ReturnType<typeof createAdminClient>, action: string, characterId: string) {
  const t = await readTable(db)
  const now = new Date().toISOString()

  if (action === "open") {
    if (t.status === "live") return reply(await readTableView(db), null, { note: "The session is already live." })
    if (t.status === "closed") {
      // A new session: nobody is seated until they sit down at this table (the old seats are from the last one).
      await clearSeats(db)
      const next: TableState = { status: "lobby", dmReady: false, session: t.session + 1, openedAt: now, startedAt: null }
      await writeTable(db, next, `The DM opened the table for session ${next.session}`)
    }
    return reply(await readTableView(db))
  }

  if (action === "end") {
    // End = save: the world is already written as it was played. The table closes and the seats empty, so the
    // next session starts at the door again. A brand-new campaign is still the Restart.
    await clearSeats(db)
    await writeTable(db, { status: "closed", dmReady: false, session: t.session, openedAt: null, startedAt: null }, `The DM ended session ${t.session}`)
    return reply(await readTableView(db))
  }

  if (action === "start" || action === "unstart") {
    if (t.status !== "lobby") return NextResponse.json({ error: t.status === "live" ? "The session is already live." : "Open the table first." }, { status: 409 })
    await writeTable(db, { ...t, dmReady: action === "start" }, action === "start" ? "The DM is ready" : "The DM is not ready")
    return reply(await startIfReady(db, await readTableView(db)))
  }

  if (action === "remove") {
    if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 })
    await removeSeat(db, characterId)
    return reply(await startIfReady(db, await readTableView(db)))
  }

  if (action === "companion") {
    // Sam, 2026-10-25: the roster locks at the start for everyone, the DM included.
    if (t.status !== "lobby") return NextResponse.json({ error: t.status === "live" ? "The roster is locked once the session begins." : "Open the table first." }, { status: 409 })
    if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 })
    const view = await readTableView(db)
    if (view.seats.some((s) => s.id === characterId)) return reply(view)
    const seat = nextSeatNumber(view)
    if (seat == null) return NextResponse.json({ error: "Every seat at the table is taken." }, { status: 409 })
    const { data: ch } = await db.from("characters").select("id, name, is_player").eq("id", characterId).is("archived_at", null).maybeSingle()
    if (!ch?.is_player) return NextResponse.json({ error: "not a player character" }, { status: 404 })
    await writeSeat(db, { id: ch.id, name: ch.name, at: now, dm: true, seat, ready: true }, "dm", `${ch.name} runs as the DM's companion`)
    return reply(await startIfReady(db, await readTableView(db)))
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 })
}

async function playerAction(db: ReturnType<typeof createAdminClient>, action: string, characterId: string, figure?: unknown) {
  const t = await readTable(db)
  const view = await readTableView(db)
  const mine = view.seats.find((s) => s.id === characterId)

  if (action === "sit") {
    const why = cannotSit(t, view.seats.length, Boolean(mine))
    if (why) return reply(view, characterId, { refused: why })
    if (mine && !mine.dm) return reply(view, characterId)
    const seat = mine?.seat ?? nextSeatNumber(view)
    if (seat == null) return reply(view, characterId, { refused: "Every seat at the table is taken." })
    const { data: ch } = await db.from("characters").select("id, name").eq("id", characterId).maybeSingle()
    if (!ch) return NextResponse.json({ error: "No such character." }, { status: 404 })
    // A player sitting down in their own DM-run companion's chair takes it over.
    await writeSeat(db, { id: ch.id, name: ch.name, at: new Date().toISOString(), dm: false, seat, ready: false }, "seat", `${ch.name} sat down at the table`)
    return reply(await startIfReady(db, await readTableView(db)), characterId)
  }

  if (!mine) return reply(view, characterId, { refused: "You do not have a seat at this table." })

  if (action === "leave") {
    // Leaving is for the staging room. Once the session is live only the DM removes a hero (Sam's item 8).
    if (t.status === "live") return reply(view, characterId, { refused: "The session has begun. Ask the Dungeon Master to excuse you." })
    await removeSeat(db, characterId)
    return reply(await startIfReady(db, await readTableView(db)), characterId)
  }

  if (action === "ready" || action === "unready") {
    if (t.status !== "lobby") return reply(view, characterId)
    if (action === "ready") {
      const r = (await readinessFor(db, [characterId])).get(characterId)?.r
      if (!r || !isComplete(r)) return reply(view, characterId, { refused: `Not yet — still missing: ${r ? missingOf(r).join(", ") : "everything"}.` })
    }
    await writeSeat(db, { id: mine.id, name: mine.name, at: new Date().toISOString(), dm: false, seat: mine.seat ?? undefined, ready: action === "ready", figure: mine.figure ?? undefined }, "seat", `${mine.name} is ${action === "ready" ? "" : "not "}ready`)
    return reply(await startIfReady(db, await readTableView(db)), characterId)
  }

  if (action === "figure") {
    // Who you sit as at the table (Sam, 2026-10-25). Chosen in the lobby; once the session is live the room is gone.
    if (t.status !== "lobby") return reply(view, characterId)
    const why = cannotChooseFigure(figure, characterId, view.seats)
    if (why) return reply(view, characterId, { refused: why })
    await writeSeat(db, { id: mine.id, name: mine.name, at: new Date().toISOString(), dm: mine.dm, seat: mine.seat ?? undefined, ready: mine.ready, figure: figure as number }, "seat", `${mine.name} sits as player ${(figure as number) + 1}`)
    return reply(await readTableView(db), characterId)
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 })
}
