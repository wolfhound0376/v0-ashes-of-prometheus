import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isDmRequest } from "@/lib/dm-session"
import { FIGHT_HANDOVER_MS, FIGHT_LOST_MS, MAX_READ, cleanBody, isHeld, mayDrive, mayEndLost, openDecision, tableMissing, takeDecision, type LiveFight } from "@/lib/walk-fight"
import type { Seat } from "@/lib/walk-world"

// /api/walk-fight — ONE FIGHT for the Underwalk (lib/walk-fight.ts, tables walk_fights + walk_fight_msgs).
//
//   GET ?fight=<id>&since=<msg id>&kind=tick|in   the fight's messages after `since` (the authority reads `in`, every
//                                                 other screen reads `tick`), oldest first.
//   GET                                           the run's live fight, if any: {fight} (null when none or gone quiet).
//   POST {op:"open", plate}                       open a fight here: {auth:true, fight} if this screen now runs it,
//                                                 {auth:false, fight} if another screen already does (show theirs).
//   POST {op:"tick", fight, body}                 the authority's quarter-second: what changed and what happened.
//   POST {op:"in", fight, body}                   a seated player's input for the authority (a menu row, a click…).
//   POST {op:"end", fight, body}                  the authority's last word.
//   POST {op:"take", fight}                       a screen showing a fight whose authority has gone quiet asks to carry
//                                                 it on: {auth:true, fight} if it is now this screen's, {auth:false, why}
//                                                 if not (still ticking, not this screen's turn in the hand-over order,
//                                                 or another screen got there first). lib/walk-fight.ts takeDecision.
//   POST {op:"lost", fight}                       nobody could carry a quiet fight on: end it for every screen.
//
// Callers are known the same way as /api/walk-world: the DM door ("dm") or a seated player's own claim (their
// character id). When the tables are not there (migration unapplied) every call answers 503 with {missing:true} and
// the map runs each fight on its own screen, as before (and stops asking for a while).

export const dynamic = "force-dynamic"

const CAMPAIGN_ID = "abyss"
type Db = ReturnType<typeof createAdminClient>
const claimCache = new Map<string, { token: string; until: number }>()

async function caller(req: NextRequest, db: Db, body: Record<string, unknown>): Promise<string | null> {
  if (isDmRequest(req, normalizeCode, safeEquals)) return "dm"
  const id = typeof body.characterId === "string" ? body.characterId : ""
  const token = typeof body.claimToken === "string" ? body.claimToken : ""
  if (!id || !token) return null
  const hit = claimCache.get(id)
  if (hit && hit.token === token && hit.until > Date.now()) return id
  const { data } = await db.from("character_secrets").select("claim_token").eq("character_id", id).maybeSingle()
  if (!data || data.claim_token !== token) return null
  claimCache.set(id, { token, until: Date.now() + 10 * 60 * 1000 })
  return id
}

async function activeRunId(db: Db): Promise<string | null> {
  const { data } = await db.from("campaign_runs").select("id").eq("campaign_id", CAMPAIGN_ID).neq("status", "ended")
    .order("run_number", { ascending: false }).limit(1).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

// the error with its code kept, so "the table is not there" (PGRST205) can be told from a passing failure
const fail = (e: { code?: string; message: string }) => new Error(`${e.code ? e.code + " " : ""}${e.message}`)
const down = (e: unknown) => {
  const error = String(e instanceof Error ? e.message : e)
  return NextResponse.json(tableMissing(error) ? { error, missing: true } : { error }, { status: 503 })
}

// Who is connected, and in which chair: One World's own seats (the heartbeat keeps them), for the hand-over order.
async function seatsOf(db: Db, runId: string | undefined): Promise<Record<string, Seat>> {
  if (!runId) return {}
  const { data } = await db.from("walk_world").select("seats").eq("campaign_run_id", runId).maybeSingle()
  return ((data?.seats as Record<string, Seat> | undefined) ?? {})
}

async function liveFight(db: Db, runId: string): Promise<LiveFight | null> {
  const { data, error } = await db.from("walk_fights").select("*").eq("campaign_run_id", runId).is("ended_at", null).maybeSingle()
  if (error) throw fail(error)
  return (data as LiveFight | null) ?? null
}

async function fightById(db: Db, id: string): Promise<LiveFight | null> {
  const { data, error } = await db.from("walk_fights").select("*").eq("id", id).maybeSingle()
  if (error) throw fail(error)
  return (data as LiveFight | null) ?? null
}

export async function GET(req: NextRequest) {
  try {
    const db = createAdminClient()
    const sp = req.nextUrl.searchParams
    const id = sp.get("fight")
    if (!id) {
      const runId = await activeRunId(db)
      if (!runId) return NextResponse.json({ fight: null, now: Date.now() })
      const f = await liveFight(db, runId)
      return NextResponse.json({ fight: isHeld(f, Date.now()) ? f : null, now: Date.now() })
    }
    const since = Math.max(0, Number(sp.get("since")) || 0)
    const kind = sp.get("kind") === "in" ? "in" : "tick"
    const f = await fightById(db, id)
    const { data, error } = await db.from("walk_fight_msgs").select("id, kind, by_key, body")
      .eq("fight_id", id).gt("id", since).in("kind", kind === "in" ? ["in"] : ["tick", "end"]).order("id", { ascending: true }).limit(MAX_READ)
    if (error) throw fail(error)
    return NextResponse.json({ fight: f, msgs: data ?? [], now: Date.now() })
  } catch (e) {
    return down(e)
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const db = createAdminClient()
    const who = await caller(req, db, body)
    if (!who) return NextResponse.json({ error: "DM key or your own claim required" }, { status: 403 })

    if (body.op === "open") {
      const runId = await activeRunId(db)
      if (!runId) return NextResponse.json({ error: "no active run" }, { status: 404 })
      const plate = String(body.plate ?? "").slice(0, 24)
      const now = Date.now()
      const d = openDecision(await liveFight(db, runId), now)
      // `joined`: the fight was already there. A screen whose own key runs it (it reloaded, and came back with no
      // fight in hand) must show it and wait for the hand-over, not start a second fight under the same name.
      if (d.kind === "join") return NextResponse.json({ auth: d.fight.auth_key === who, joined: true, fight: d.fight, now })
      if (d.endStale) await db.from("walk_fights").update({ ended_at: new Date().toISOString() }).eq("id", d.endStale)
      // the old fights' streams are not kept: ten minutes after an end, they go
      await db.from("walk_fights").delete().eq("campaign_run_id", runId).lt("ended_at", new Date(now - 10 * 60 * 1000).toISOString())
      const { data, error } = await db.from("walk_fights").insert({ campaign_run_id: runId, plate, auth_key: who }).select("*").single()
      if (error) {
        // two screens opened at once: the unique index let one in. Show that one.
        const f = await liveFight(db, runId)
        if (f) return NextResponse.json({ auth: f.auth_key === who, joined: true, fight: f, now })
        throw fail(error)
      }
      return NextResponse.json({ auth: true, fight: data, now })
    }

    if (body.op === "tick" || body.op === "in" || body.op === "end") {
      const id = typeof body.fight === "string" ? body.fight : ""
      const f = id ? await fightById(db, id) : null
      if (!f || f.ended_at) return NextResponse.json({ error: "no such live fight", ended: true }, { status: 409 })
      // `moved`: the fight was handed on while this screen was away; it shows it from now on
      if (body.op !== "in" && !mayDrive(f, who)) return NextResponse.json({ error: "this screen does not run the fight", moved: true, fight: f }, { status: 403 })
      const c = cleanBody(body.body ?? {})
      if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 })
      const { data, error } = await db.from("walk_fight_msgs").insert({ fight_id: id, kind: body.op, by_key: who, body: c.body }).select("id").single()
      if (error) throw fail(error)
      if (body.op === "tick") await db.from("walk_fights").update({ auth_seen: new Date().toISOString() }).eq("id", id).eq("auth_key", who)
      if (body.op === "end") await db.from("walk_fights").update({ ended_at: new Date().toISOString() }).eq("id", id)
      return NextResponse.json({ ok: true, id: data?.id, now: Date.now() })
    }

    // THE HAND-OVER. Decided here, never in a browser: only a fight gone quiet, only in One World's order, and the row
    // changes hands with a compare-and-set (still the old authority, still quiet), so of two screens asking at once
    // exactly one gets it.
    if (body.op === "take") {
      const id = typeof body.fight === "string" ? body.fight : ""
      const f = id ? await fightById(db, id) : null
      if (!f || f.ended_at) return NextResponse.json({ error: "no such live fight", ended: true }, { status: 409 })
      const now = Date.now()
      const d = takeDecision(f, who, await seatsOf(db, f.campaign_run_id), now)
      if (!d.ok) return NextResponse.json({ auth: false, why: d.why, waitMs: d.waitMs, fight: f, now })
      const { data, error } = await db.from("walk_fights").update({ auth_key: who, auth_seen: new Date(now).toISOString() })
        .eq("id", id).is("ended_at", null).eq("auth_key", f.auth_key).lt("auth_seen", new Date(now - FIGHT_HANDOVER_MS).toISOString()).select("*")
      if (error) throw fail(error)
      if (!data || !data.length) return NextResponse.json({ auth: false, why: "taken", waitMs: 0, fight: await fightById(db, id), now })
      return NextResponse.json({ auth: true, from: f.auth_key, fight: data[0], now })
    }

    if (body.op === "lost") {
      const id = typeof body.fight === "string" ? body.fight : ""
      const f = id ? await fightById(db, id) : null
      if (!f || f.ended_at) return NextResponse.json({ ok: true, ended: true, now: Date.now() })
      const now = Date.now()
      if (!mayEndLost(f, now)) return NextResponse.json({ ok: false, error: "the fight is still held", now }, { status: 409 })
      const { data, error } = await db.from("walk_fights").update({ ended_at: new Date(now).toISOString() })
        .eq("id", id).is("ended_at", null).lt("auth_seen", new Date(now - FIGHT_LOST_MS).toISOString()).select("id")
      if (error) throw fail(error)
      if (data && data.length) await db.from("walk_fight_msgs").insert({ fight_id: id, kind: "end", by_key: who, body: { lost: true } })
      return NextResponse.json({ ok: !!(data && data.length), now })
    }

    return NextResponse.json({ error: "op must be open, tick, in, end, take or lost" }, { status: 400 })
  } catch (e) {
    return down(e)
  }
}
