import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { hasDmCookie, isDmRequest } from "@/lib/dm-session"
import { restartCampaign } from "@/lib/restart-campaign"
import { MAX_SEATS, cannotChooseFigure, cannotSit, isComplete, missingOf, type TableState } from "@/lib/table"
import { readSeated } from "@/lib/seats"
import {
  clearInvites, clearSeats, nextSeatNumber, readInvitedIds, readTable, readTableView, readinessFor, removeInvite, removeSeat,
  startIfReady, writeInvite, writeSeat, writeTable,
  type TableView,
} from "@/lib/table-store"

// /api/table — the staging table (lib/table.ts has the rules and Sam's words).
//
//   GET  ?characterId=…            the room: state, the DM's light, every seat and its light; `mine` says
//                                  whether that character holds a seat. Anyone may read it — names, lights
//                                  and what each seat is missing, nothing secret.
//   POST { action, … }
//     DM, door cookie ONLY:        open — CONTINUE the campaign: the table opens, the world is kept.
//                                  new  — NEW GAME: the campaign is reset (lib/restart-campaign.ts), then the
//                                         table opens. Sam, 2026-10-25: "starting a new game ALWAYS resets the
//                                         campaign"; both live only behind the DM door on the title screen
//                                         (lib/dm-door.ts). The older x-dm-key header can do neither.
//     DM (cookie or x-dm-key):     start · unstart · companion {characterId} · end
//                                  invite {characterId}    open a seat to one player — nobody sits without it
//                                  uninvite {characterId}  shut it again (a lobby seat they held goes too)
//                                  remove {characterId}    lobby: take the seat AND the invitation away
//                                  excuse {characterId}    live: step a player out; the chair is held for them
//                                  readmit {characterId}   live: let an excused player back in
//     player (characterId + claimToken):  sit · ready · unready · leave · figure {figure: 0..6}
//
// A player who has no invitation and no seat sees the state and their own `invited: false`, and an empty room —
// "NO player can sit at the table without me FIRST opening up the seat to them" (Sam, 2026-10-25).
//
// Every change re-checks the start condition, so the session begins the moment the last light turns green,
// whoever turned it.

export const dynamic = "force-dynamic"
export const maxDuration = 60 // `new` runs the whole campaign reset first

const DM_ACTIONS = new Set(["open", "new", "start", "unstart", "remove", "companion", "end", "invite", "uninvite", "excuse", "readmit"])
const DOOR_ACTIONS = new Set(["open", "new"]) // the DM door's own cookie only
const PLAYER_ACTIONS = new Set(["sit", "ready", "unready", "leave", "figure"])

function isDm(req: NextRequest): boolean {
  return isDmRequest(req, normalizeCode, safeEquals)
}

async function claimOk(db: ReturnType<typeof createAdminClient>, characterId: string, claimToken: string): Promise<boolean> {
  if (!characterId || !claimToken) return false
  const { data } = await db.from("character_secrets").select("claim_token").eq("character_id", characterId).maybeSingle()
  return Boolean(data && data.claim_token === claimToken)
}

type Db = ReturnType<typeof createAdminClient>

/**
 * What the room answers. `dm` sees everything plus the roster with each hero's invitation and seat; anyone else
 * sees the seats only once they hold one or have been invited to one.
 */
async function reply(db: Db, view: TableView, characterId?: string | null, extra: Record<string, unknown> = {}, dm = false) {
  const mine = characterId ? view.seats.find((s) => s.id === characterId) ?? null : null
  const invitedIds = await readInvitedIds(db)
  const invited = characterId ? invitedIds.has(characterId) : false
  const open = dm || mine != null || invited
  let roster: unknown[] | undefined
  if (dm) {
    const { data } = await db.from("characters").select("id, name, class").eq("is_player", true).is("archived_at", null).order("created_at", { ascending: true })
    roster = (data ?? []).map((c) => {
      const seat = view.seats.find((s) => s.id === c.id)
      return { id: c.id, name: c.name, cls: c.class ?? "", invited: invitedIds.has(c.id), seated: Boolean(seat), companion: Boolean(seat?.dm), away: Boolean(seat?.away) }
    })
  }
  return NextResponse.json({ ...view, seats: open ? view.seats : [], mine, invited, ...(roster ? { roster } : {}), ...extra })
}

export async function GET(req: NextRequest) {
  try {
    const db = createAdminClient()
    const view = await readTableView(db)
    const dm = isDm(req)
    return await reply(db, view, req.nextUrl.searchParams.get("characterId"), { isDm: dm }, dm)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = typeof body.action === "string" ? body.action : ""
  const characterId = typeof body.characterId === "string" ? body.characterId : ""
  let db: Db
  try { db = createAdminClient() } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }

  try {
    if (DM_ACTIONS.has(action)) {
      if (!isDm(req)) return NextResponse.json({ error: "Only the Dungeon Master can do that." }, { status: 403 })
      if (DOOR_ACTIONS.has(action) && !hasDmCookie(req)) {
        return NextResponse.json({ error: "The table opens only from the Dungeon Master's door on the title screen." }, { status: 403 })
      }
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

async function dmAction(db: Db, action: string, characterId: string) {
  const replyDm = (view: TableView, extra: Record<string, unknown> = {}) => reply(db, view, null, extra, true)
  const t = await readTable(db)
  const now = new Date().toISOString()

  if (action === "open") {
    if (t.status === "live") return replyDm(await readTableView(db), { note: "The session is already live." })
    if (t.status === "closed") {
      // A new session: nobody is seated until they sit down at this table (the old seats are from the last one).
      await clearSeats(db)
      const next: TableState = { status: "lobby", dmReady: false, session: t.session + 1, openedAt: now, startedAt: null }
      await writeTable(db, next, `The DM opened the table for session ${next.session}`)
    }
    return replyDm(await readTableView(db))
  }

  if (action === "new") {
    // A new game is a new campaign, every time (Sam, 2026-10-25). Refused while a session is live: the DM ends
    // it first, so nobody is wiped out from under their own map mid-scene.
    if (t.status === "live") return NextResponse.json({ error: "A session is live. End it before you start a new game." }, { status: 409 })
    const restart = await restartCampaign(db)
    // The restart clears every world flag, the table and its seats included. Open the new run's table only when
    // the wipe finished cleanly; a half-wiped world is not a new game.
    if (!restart.ok) return NextResponse.json({ error: "The campaign reset did not fully finish, so the table was not opened. Tell Claude before you play.", problems: restart.problems }, { status: 500 })
    const after = await readTable(db)
    await clearSeats(db)
    await writeTable(db, { status: "lobby", dmReady: false, session: after.session + 1, openedAt: now, startedAt: null }, "The DM started a new game")
    return replyDm(await readTableView(db), { newGame: true, run: (restart.report.run as { number?: number } | undefined)?.number ?? null })
  }

  if (action === "end") {
    // End = save: the world is already written as it was played. The table closes and the seats empty, so the
    // next session starts at the door again. A brand-new campaign is still the Restart.
    await clearSeats(db)
    await clearInvites(db)
    await writeTable(db, { status: "closed", dmReady: false, session: t.session, openedAt: null, startedAt: null }, `The DM ended session ${t.session}`)
    return replyDm(await readTableView(db))
  }

  if (action === "start" || action === "unstart") {
    if (t.status !== "lobby") return NextResponse.json({ error: t.status === "live" ? "The session is already live." : "Open the table first." }, { status: 409 })
    await writeTable(db, { ...t, dmReady: action === "start" }, action === "start" ? "The DM is ready" : "The DM is not ready")
    return replyDm(await startIfReady(db, await readTableView(db)))
  }

  if (action === "remove") {
    if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 })
    // Taking a hero off the table takes the invitation too, or their page would sit them straight back down.
    // To let them back in the lobby, invite them again; once the session is live use excuse/readmit.
    await removeSeat(db, characterId)
    await removeInvite(db, characterId)
    return replyDm(await startIfReady(db, await readTableView(db)))
  }

  if (action === "invite" || action === "uninvite") {
    if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 })
    if (t.status === "live") return NextResponse.json({ error: "The roster is locked once the session begins. Use Excuse and Let back in for the players already seated." }, { status: 409 })
    if (action === "uninvite") {
      const seated = (await readSeated(db)).find((x) => x.id === characterId)
      if (seated?.dm) return NextResponse.json({ error: "That is your own companion. Send it away from the roster." }, { status: 409 })
      await removeSeat(db, characterId)
      await removeInvite(db, characterId)
      return replyDm(await startIfReady(db, await readTableView(db)))
    }
    const { data: ch } = await db.from("characters").select("id, name, is_player").eq("id", characterId).is("archived_at", null).maybeSingle()
    if (!ch?.is_player) return NextResponse.json({ error: "not a player character" }, { status: 404 })
    const view = await readTableView(db)
    if (!view.seats.some((x) => x.id === ch.id) && view.seats.length >= MAX_SEATS) return NextResponse.json({ error: "Every seat at the table is taken." }, { status: 409 })
    await writeInvite(db, { id: ch.id, name: ch.name })
    return replyDm(view)
  }

  if (action === "excuse" || action === "readmit") {
    // Sam, 2026-10-25: "I can watch the players and kick them out, let them back in." The roster is locked once
    // the session begins, so an excused player keeps their chair (same seat, same figure) and only the people
    // who were seated at the start can ever come back.
    if (t.status !== "live") return NextResponse.json({ error: "Excuse and Let back in are for a live session. In the lobby, remove or invite." }, { status: 409 })
    if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 })
    const seat = (await readSeated(db)).find((x) => x.id === characterId)
    if (!seat) return NextResponse.json({ error: "That hero is not seated at this session." }, { status: 404 })
    if (seat.dm) return NextResponse.json({ error: "That is your own companion — you already control it." }, { status: 409 })
    await writeSeat(db, { ...seat, away: action === "excuse" }, "dm", `${seat.name} was ${action === "excuse" ? "excused from" : "let back into"} the session`)
    return replyDm(await readTableView(db))
  }

  if (action === "companion") {
    // Sam, 2026-10-25: the roster locks at the start for everyone, the DM included.
    if (t.status !== "lobby") return NextResponse.json({ error: t.status === "live" ? "The roster is locked once the session begins." : "Open the table first." }, { status: 409 })
    if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 })
    const view = await readTableView(db)
    if (view.seats.some((s) => s.id === characterId)) return replyDm(view)
    const seat = nextSeatNumber(view)
    if (seat == null) return NextResponse.json({ error: "Every seat at the table is taken." }, { status: 409 })
    const { data: ch } = await db.from("characters").select("id, name, is_player").eq("id", characterId).is("archived_at", null).maybeSingle()
    if (!ch?.is_player) return NextResponse.json({ error: "not a player character" }, { status: 404 })
    await writeSeat(db, { id: ch.id, name: ch.name, at: now, dm: true, seat, ready: true }, "dm", `${ch.name} runs as the DM's companion`)
    return replyDm(await startIfReady(db, await readTableView(db)))
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 })
}

async function playerAction(db: Db, action: string, characterId: string, figure?: unknown) {
  const t = await readTable(db)
  const view = await readTableView(db)
  const mine = view.seats.find((s) => s.id === characterId)

  if (action === "sit") {
    const invited = (await readInvitedIds(db)).has(characterId)
    // A player taking over their own DM-run companion's chair needs the invitation too.
    const why = cannotSit(t, view.seats.length, Boolean(mine && !mine.dm), invited)
    if (why) return reply(db, view, characterId, { refused: why })
    if (mine && !mine.dm) return reply(db, view, characterId)
    const seat = mine?.seat ?? nextSeatNumber(view)
    if (seat == null) return reply(db, view, characterId, { refused: "Every seat at the table is taken." })
    const { data: ch } = await db.from("characters").select("id, name").eq("id", characterId).maybeSingle()
    if (!ch) return NextResponse.json({ error: "No such character." }, { status: 404 })
    // A player sitting down in their own DM-run companion's chair takes it over.
    await writeSeat(db, { id: ch.id, name: ch.name, at: new Date().toISOString(), dm: false, seat, ready: false }, "seat", `${ch.name} sat down at the table`)
    return reply(db, await startIfReady(db, await readTableView(db)), characterId)
  }

  if (!mine) return reply(db, view, characterId, { refused: "You do not have a seat at this table." })

  if (action === "leave") {
    // Leaving is for the staging room. Once the session is live only the DM removes a hero (Sam's item 8).
    if (t.status === "live") return reply(db, view, characterId, { refused: "The session has begun. Ask the Dungeon Master to excuse you." })
    await removeSeat(db, characterId)
    return reply(db, await startIfReady(db, await readTableView(db)), characterId)
  }

  if (action === "ready" || action === "unready") {
    if (t.status !== "lobby") return reply(db, view, characterId)
    if (action === "ready") {
      const r = (await readinessFor(db, [characterId])).get(characterId)?.r
      if (!r || !isComplete(r)) return reply(db, view, characterId, { refused: `Not yet — still missing: ${r ? missingOf(r).join(", ") : "everything"}.` })
    }
    await writeSeat(db, { id: mine.id, name: mine.name, at: new Date().toISOString(), dm: false, seat: mine.seat ?? undefined, ready: action === "ready", figure: mine.figure ?? undefined }, "seat", `${mine.name} is ${action === "ready" ? "" : "not "}ready`)
    return reply(db, await startIfReady(db, await readTableView(db)), characterId)
  }

  if (action === "figure") {
    // Who you sit as at the table (Sam, 2026-10-25). Chosen in the lobby; once the session is live the room is gone.
    if (t.status !== "lobby") return reply(db, view, characterId)
    const why = cannotChooseFigure(figure, characterId, view.seats)
    if (why) return reply(db, view, characterId, { refused: why })
    await writeSeat(db, { id: mine.id, name: mine.name, at: new Date().toISOString(), dm: mine.dm, seat: mine.seat ?? undefined, ready: mine.ready, figure: figure as number }, "seat", `${mine.name} sits as player ${(figure as number) + 1}`)
    return reply(db, await readTableView(db), characterId)
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 })
}
