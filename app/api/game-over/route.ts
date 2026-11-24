import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isDmRequest } from "@/lib/dm-session"
import { CAMPAIGN_ID, restartCampaign } from "@/lib/restart-campaign"
import { readSeated } from "@/lib/seats"
import { clearInvites, clearSeats, readTable, writeTable } from "@/lib/table-store"
import { headInPlay, loadSave, loadedSave, startNewSave } from "@/lib/save-store"
import { newSaveName } from "@/lib/saves"
import { WIPE_DONE_TEXT, WIPE_FLAG, wipeOutcome, wipeVerdict } from "@/lib/game-over-wipe"

// POST /api/game-over — THE GAME DIES WITH THE PARTY (Sam, 2026-11-15: "If everyone dies, then the game is deleted
// after game over. It's also a hard reset."), in Mortal Mode only since 2026-11-23: "Party wipe deletes the game in
// Mortal only and in other modes ends the games but permits you to go to an earlier save." The rule and its order are
// in lib/game-over-wipe.ts.
//
//   POST { run, characterId?, claimToken? }   from the GAME OVER card of every screen at a wiped table. The first
//                                             one does the work; the rest are told it is done.
//
// The page only asks. This route checks the shared world (walk_world: who has fallen, which seat plays which hero)
// against the table's seats, and touches nothing unless every seated hero is dead. Callers are a seated player's own
// claim or the DM, as on /api/walk-world. `run` is the run number the page played: a call for an older run is a
// screen arriving after the wipe already happened, and changes nothing.

export const dynamic = "force-dynamic"
export const maxDuration = 60

type Db = ReturnType<typeof createAdminClient>

async function caller(req: NextRequest, db: Db, body: Record<string, unknown>): Promise<string | null> {
  if (isDmRequest(req, normalizeCode, safeEquals)) return "dm"
  const id = typeof body.characterId === "string" ? body.characterId : ""
  const token = typeof body.claimToken === "string" ? body.claimToken : ""
  if (!id || !token) return null
  const { data } = await db.from("character_secrets").select("claim_token").eq("character_id", id).maybeSingle()
  return data && data.claim_token === token ? id : null
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  let db: Db
  try { db = createAdminClient() } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }

  const who = await caller(req, db, body)
  if (!who) return NextResponse.json({ error: "Only someone at the table can end the game." }, { status: 403 })

  const { data: run } = await db.from("campaign_runs").select("id, run_number").eq("campaign_id", CAMPAIGN_ID).neq("status", "ended")
    .order("run_number", { ascending: false }).limit(1).maybeSingle()
  if (!run) return NextResponse.json({ error: "There is no campaign in play." }, { status: 409 })
  const asked = Number(body.run)
  if (Number.isFinite(asked) && asked > 0 && asked !== Number(run.run_number)) return NextResponse.json({ ok: true, already: true })

  // The table already closed: another screen ended this game (a campaign sent back to its last save keeps its run
  // number, so the run check above cannot tell). Nobody plays at a closed table, so there is nothing to end here.
  if ((await readTable(db)).status === "closed") return NextResponse.json({ ok: true, already: true })

  const seats = await readSeated(db)
  if (who !== "dm" && !seats.some((s) => s.id === who)) return NextResponse.json({ error: "Only someone at the table can end the game." }, { status: 403 })
  const { data: world } = await db.from("walk_world").select("state, heroes").eq("campaign_run_id", run.id).maybeSingle()
  const state = (world?.state ?? {}) as { fallen?: unknown[] }
  const verdict = wipeVerdict(seats, (world?.heroes ?? {}) as Record<string, { cid?: string }>, Array.isArray(state.fallen) ? state.fallen : [])
  if (!verdict.ok) return NextResponse.json({ error: `${verdict.why} Nothing was deleted.` }, { status: 409 })

  // One screen does the work: the flag is keyed by campaign + key, so a second claim for this run fails. (The hard
  // reset clears every world flag, this one with them; by then the run number has moved on.)
  const { error: claimErr } = await db.from("world_flags").insert({ campaign_id: CAMPAIGN_ID, key: WIPE_FLAG, value: { run: run.run_number, by: who, dead: verdict.dead }, set_by: who, note: "The whole table died" })
  if (claimErr) {
    if (claimErr.code === "23505") return NextResponse.json({ ok: true, already: true })
    return NextResponse.json({ error: claimErr.message }, { status: 500 })
  }

  // The save in play goes. Read it before the reset (the reset does not touch the shelf, but this is the order Sam
  // stated: the game is deleted, and then the world starts over).
  const doomed = await loadedSave(db)
  const session = (await readTable(db)).session

  // NOT MORTAL (Sam, 2026-11-23): nothing is deleted. The table closes and empties, then the campaign goes back to its
  // last save — the world as it was at the last End — with every checkpoint kept, so the host can play on from there
  // or Rewind further from Load Game. campaign_load does not save the dead world first: it is the save in play itself.
  const head = doomed && doomed !== "missing" ? await headInPlay(db) : null
  if (head && wipeOutcome(head) === "back") {
    await clearSeats(db)
    await clearInvites(db)
    await writeTable(db, { status: "closed", dmReady: false, session, openedAt: null, startedAt: null, code: null }, "The whole party died: back to the last save")
    const back = await loadSave(db, head.id)
    if (!back.ok) {
      // The dead world must never be written over the campaign: an End with this save still in play would do just
      // that. Take it out of play; Load in the book still puts the last save back.
      await db.from("campaign_saves").update({ is_loaded: false }).eq("id", head.id)
      return NextResponse.json({ ok: true, outcome: "back", kept: head.name, dead: verdict.dead, message: WIPE_DONE_TEXT.back,
        note: `The table closed, but the last save could not be put back by itself (${back.missing ? "saved games are switched off" : back.error}). Load "${head.name}" from Load Game.` })
    }
    return NextResponse.json({ ok: true, outcome: "back", kept: head.name, dead: verdict.dead, message: WIPE_DONE_TEXT.back })
  }

  const restart = await restartCampaign(db)
  if (!restart.ok) {
    // The save is kept when the reset does not finish: a half-wiped world must still be recoverable from the shelf.
    await db.from("world_flags").delete().eq("campaign_id", CAMPAIGN_ID).eq("key", WIPE_FLAG)
    return NextResponse.json({ error: `The hard reset did not fully finish, so the save was kept. Tell Claude this step failed: ${restart.problems.join("; ")}.`, problems: restart.problems }, { status: 500 })
  }

  let deleted: string | null = null, note: string | null = null
  if (doomed && doomed !== "missing") {
    // The whole campaign goes, its checkpoints with it (lib/save-book.ts; Sam, 2026-11-15: "the game is deleted"), so
    // nothing of the dead world is left on the Load Game shelf to rewind into.
    let { error } = await db.from("campaign_saves").delete().or(`id.eq.${doomed.id},campaign_id.eq.${doomed.id}`)
    // Before the checkpoints migration there is no campaign_id: the save alone goes, as it always did.
    if (error?.code === "42703") ({ error } = await db.from("campaign_saves").delete().eq("id", doomed.id))
    if (error) note = `The world was reset, but the old save could not be deleted: ${error.message}`
    else deleted = doomed.name
  }

  // Everyone back to the table: the seats empty and the table closes, so every open screen leaves the game
  // (lib/session-guard.ts). The fresh world goes on the shelf as the save in play, for the host to open.
  await clearSeats(db)
  await clearInvites(db)
  await writeTable(db, { status: "closed", dmReady: false, session, openedAt: null, startedAt: null }, "The whole party died: game over")
  const fresh = await startNewSave(db, newSaveName())
  if (!fresh.ok && !fresh.missing) note = [note, `The new game could not be put on the shelf: ${fresh.error}`].filter(Boolean).join(" ")

  return NextResponse.json({ ok: true, outcome: "delete", message: WIPE_DONE_TEXT.delete, deleted, dead: verdict.dead, run: (restart.report.run as { number?: number } | undefined)?.number ?? null, ...(note ? { note } : {}) })
}
