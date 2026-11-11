import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { hasDmCookie, isDmRequest } from "@/lib/dm-session"
import { CAMPAIGN_ID, restartCampaign } from "@/lib/restart-campaign"
import { MAX_SEATS, cannotChooseFigure, cannotSit, isComplete, missingOf, type TableState } from "@/lib/table"
import { readSeated } from "@/lib/seats"
import {
  clearInvites, clearSeats, nextSeatNumber, readHost, readInvitedIds, readTable, readTableView, readinessFor, removeInvite, removeSeat,
  startIfReady, writeHost, writeInvite, writeSeat, writeTable,
  type TableView,
} from "@/lib/table-store"
import { actorFor, type Actor, type Host } from "@/lib/host"
import { cleanSaveName, newSaveName } from "@/lib/saves"
import { shelveWorldInPlay, startNewSave } from "@/lib/save-store"

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
//   THE HOST (lib/host.ts; Sam, 2026-11-10: "the host can play", "whomever started the campaign is the host",
//   "only people with keys can start a campaign"). The hero named when the campaign was started is its host.
//   With that hero's claim alone (hostId + hostToken in the body) the host may do every DM action above
//   EXCEPT the reset:  open · start · unstart · companion · end · invite · uninvite · remove · excuse · readmit.
//     DM, door cookie ONLY:        new {hostId?}   as above, and names the host of the new campaign
//                                  host {hostId}   names (or changes) the host of the campaign in play
//                                  Both answer with that hero's claim token, so the browser that typed the
//                                  DM code can sit down as the host without typing three more words.
//   The host is always invited to their own table, and their Start counts as their Ready.
//   GET tells the host they are the host only when `x-claim-token` proves it (then it shows them the roster).
//
// A player who has no invitation and no seat sees the state and their own `invited: false`, and an empty room —
// "NO player can sit at the table without me FIRST opening up the seat to them" (Sam, 2026-10-25).
//
// Every change re-checks the start condition, so the session begins the moment the last light turns green,
// whoever turned it.

export const dynamic = "force-dynamic"
export const maxDuration = 60 // `new` runs the whole campaign reset first

const DM_ACTIONS = new Set(["open", "new", "host", "start", "unstart", "remove", "companion", "end", "invite", "uninvite", "excuse", "readmit"])
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
  const [invitedIds, host] = await Promise.all([readInvitedIds(db), readHost(db)])
  // The host never needs an invitation to their own table.
  const invited = characterId ? invitedIds.has(characterId) || host?.id === characterId : false
  const open = dm || mine != null || invited
  let roster: unknown[] | undefined
  if (dm) {
    const { data } = await db.from("characters").select("id, name, class").eq("is_player", true).is("archived_at", null).order("created_at", { ascending: true })
    roster = (data ?? []).map((c) => {
      const seat = view.seats.find((s) => s.id === c.id)
      return { id: c.id, name: c.name, cls: c.class ?? "", invited: invitedIds.has(c.id), seated: Boolean(seat), companion: Boolean(seat?.dm), away: Boolean(seat?.away) }
    })
  }
  // Which run of the campaign this is. Every New Game ends the run and opens the next, so a screen that loaded
  // under another run knows the world was reset under it and closes (lib/session-guard.ts wasReset).
  const { data: liveRun } = await db.from("campaign_runs").select("id").eq("campaign_id", CAMPAIGN_ID).neq("status", "ended").order("run_number", { ascending: false }).limit(1).maybeSingle()
  return NextResponse.json({ ...view, seats: open ? view.seats : [], mine, invited, host: host ? { id: host.id, name: host.name } : null, run: liveRun?.id ?? null, ...(roster ? { roster } : {}), ...extra })
}

/** Is this the campaign's host, proved by the host hero's own claim? */
async function hostProved(db: Db, host: Host | null, characterId: string, claimToken: string): Promise<boolean> {
  return Boolean(host && characterId && host.id === characterId && (await claimOk(db, characterId, claimToken)))
}

/** The hero the DM code named as host: must be a live player character. Returns it with its claim token. */
async function hostHero(db: Db, hostId: string): Promise<{ id: string; name: string; claimToken: string | null } | null> {
  const { data: ch } = await db.from("characters").select("id, name, is_player").eq("id", hostId).is("archived_at", null).maybeSingle()
  if (!ch?.is_player) return null
  const { data: secret } = await db.from("character_secrets").select("claim_token").eq("character_id", ch.id).maybeSingle()
  return { id: ch.id, name: ch.name, claimToken: (secret?.claim_token as string | undefined) ?? null }
}

export async function GET(req: NextRequest) {
  try {
    const db = createAdminClient()
    const view = await readTableView(db)
    const dm = isDm(req)
    const characterId = req.nextUrl.searchParams.get("characterId")
    const isHost = characterId ? await hostProved(db, await readHost(db), characterId, req.headers.get("x-claim-token") ?? "") : false
    return await reply(db, view, characterId, { isDm: dm, isHost }, dm || isHost)
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
      const hostId = typeof body.hostId === "string" ? body.hostId : ""
      const hostToken = typeof body.hostToken === "string" ? body.hostToken : ""
      const host = await readHost(db)
      const who = actorFor(action, { dm: isDm(req), dmCookie: hasDmCookie(req), host: await hostProved(db, host, hostId, hostToken) })
      if ("refused" in who) return NextResponse.json({ error: who.refused }, { status: 403 })
      return await dmAction(db, action, characterId, who.actor, host, hostId, cleanSaveName(body.saveName))
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

async function dmAction(db: Db, action: string, characterId: string, actor: Actor, host: Host | null, hostId: string, saveName: string | null = null) {
  // The host is also a player at this table, so their answer carries their own seat (`mine`); the DM's does not.
  const replyDm = (view: TableView, extra: Record<string, unknown> = {}) =>
    actor === "host" && host ? reply(db, view, host.id, { isHost: true, ...extra }, true) : reply(db, view, null, extra, true)
  const t = await readTable(db)
  const now = new Date().toISOString()
  const by = actor === "host" && host ? host.name || "The host" : "The DM"

  if (action === "host") {
    // Name (or change) who hosts the campaign in play. DM code only (lib/host.ts).
    const hero = await hostHero(db, hostId)
    if (!hero) return NextResponse.json({ error: "Choose a player character to host as." }, { status: 404 })
    await writeHost(db, hero)
    return reply(db, await readTableView(db), null, { hostClaim: hero.claimToken ? { characterId: hero.id, claimToken: hero.claimToken } : null }, true)
  }

  if (action === "open") {
    if (t.status === "live") return replyDm(await readTableView(db), { note: "The session is already live." })
    if (t.status === "closed") {
      // A new session: nobody is seated until they sit down at this table (the old seats are from the last one).
      await clearSeats(db)
      const next: TableState = { status: "lobby", dmReady: false, session: t.session + 1, openedAt: now, startedAt: null }
      await writeTable(db, next, `${by} opened the table for session ${next.session}`)
    }
    return replyDm(await readTableView(db))
  }

  if (action === "new") {
    // A new game is a new campaign, every time (Sam, 2026-10-25). It used to be refused while a session was
    // live. Sam, 2026-11-10: a reset "should clear everything. Close out all instances of the game everywhere
    // even DM screens, and let you enter the table clean" — so a live session no longer blocks it: the reset
    // ends that session itself (the seats and the table go with the world flags), and every open screen, the
    // DM's included, sees the run change and closes (lib/session-guard.ts wasReset).
    // Whoever starts the campaign is its host (Sam, 2026-11-10). Checked BEFORE the reset, so a bad pick
    // never costs a campaign.
    const newHost = hostId ? await hostHero(db, hostId) : null
    if (hostId && !newHost) return NextResponse.json({ error: "Choose a player character to host as. Nothing was reset." }, { status: 404 })
    // SAVED GAMES (Sam, 2026-11-10, ruling 1: "New Game keeps the old world on the shelf"). The world in play is
    // saved first; if that save fails, nothing is reset. Before the saves migration is applied this is skipped
    // and New Game resets exactly as it always did (lib/save-store.ts).
    const shelved = await shelveWorldInPlay(db, "Before the new game")
    if (!shelved.ok && !shelved.missing) return NextResponse.json({ error: `The game in play could not be saved, so nothing was reset. ${shelved.error}` }, { status: 500 })
    const restart = await restartCampaign(db)
    // The restart clears every world flag, the table and its seats included. Open the new run's table only when
    // the wipe finished cleanly; a half-wiped world is not a new game.
    if (!restart.ok) return NextResponse.json({ error: `The campaign reset did not fully finish, so the table was not opened. Tell Claude this step failed: ${restart.problems.join("; ")}.`, problems: restart.problems }, { status: 500 })
    const after = await readTable(db)
    await clearSeats(db)
    await writeTable(db, { status: "lobby", dmReady: false, session: after.session + 1, openedAt: now, startedAt: null }, "The DM started a new game")
    // The reset wiped the old host with every other flag; the new campaign's host is whoever started it.
    if (newHost) await writeHost(db, newHost)
    // The fresh world is a new save, and the one in play (with its own host and party — ruling 3).
    const fresh = shelved.ok ? await startNewSave(db, saveName ?? newSaveName()) : null
    return replyDm(await readTableView(db), {
      ...(fresh && !fresh.ok && !fresh.missing ? { note: `The new game started, but it could not be put on the shelf: ${fresh.error}` } : {}),
      newGame: true, run: (restart.report.run as { number?: number } | undefined)?.number ?? null,
      hostClaim: newHost?.claimToken ? { characterId: newHost.id, claimToken: newHost.claimToken } : null,
    })
  }

  if (action === "end") {
    // End = save: the world is already written as it was played. The table closes and the seats empty, so the
    // next session starts at the door again. A brand-new campaign is still the Restart.
    // SAVED GAMES: the save in play is written now, before the seats empty, so it remembers who was at the table.
    // A failed save never stops the End — the world is still exactly as it was played — but it is reported.
    const saved = await shelveWorldInPlay(db, "Out of the Abyss")
    await clearSeats(db)
    await clearInvites(db)
    await writeTable(db, { status: "closed", dmReady: false, session: t.session, openedAt: null, startedAt: null }, `${by} ended session ${t.session}`)
    return replyDm(await readTableView(db), !saved.ok && !saved.missing ? { note: `The session ended, but the save could not be written: ${saved.error}` } : {})
  }

  if (action === "start" || action === "unstart") {
    if (t.status !== "lobby") return NextResponse.json({ error: t.status === "live" ? "The session is already live." : "Open the table first." }, { status: 409 })
    // The host's Start is also their Ready: one press, not two. A host whose hero still lacks something
    // (a red light) is told what, and nothing starts.
    if (action === "start" && actor === "host" && host) {
      const seat = (await readSeated(db)).find((x) => x.id === host.id)
      if (seat && !seat.dm && !seat.ready) {
        const r = (await readinessFor(db, [host.id])).get(host.id)?.r
        if (!r || !isComplete(r)) return NextResponse.json({ error: `Not yet — your own hero is still missing: ${r ? missingOf(r).join(", ") : "everything"}.` }, { status: 409 })
        await writeSeat(db, { ...seat, ready: true }, "seat", `${seat.name} is ready`)
      }
    }
    await writeTable(db, { ...t, dmReady: action === "start" }, action === "start" ? `${by} is ready` : `${by} is not ready`)
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
    // The host is always invited to their own table (lib/host.ts).
    const invited = (await readInvitedIds(db)).has(characterId) || (await readHost(db))?.id === characterId
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
