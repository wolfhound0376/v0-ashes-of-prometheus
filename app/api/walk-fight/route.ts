import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isDmRequest } from "@/lib/dm-session"
import { MAX_READ, cleanBody, isHeld, mayDrive, openDecision, type LiveFight } from "@/lib/walk-fight"

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
//
// Callers are known the same way as /api/walk-world: the DM door ("dm") or a seated player's own claim (their
// character id). When the tables are not there (migration unapplied) every call answers 503 and the map runs each
// fight on its own screen, as before.

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

async function liveFight(db: Db, runId: string): Promise<LiveFight | null> {
  const { data, error } = await db.from("walk_fights").select("*").eq("campaign_run_id", runId).is("ended_at", null).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as LiveFight | null) ?? null
}

async function fightById(db: Db, id: string): Promise<LiveFight | null> {
  const { data, error } = await db.from("walk_fights").select("*").eq("id", id).maybeSingle()
  if (error) throw new Error(error.message)
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
    if (error) throw new Error(error.message)
    return NextResponse.json({ fight: f, msgs: data ?? [], now: Date.now() })
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 503 })
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
      if (d.kind === "join") return NextResponse.json({ auth: d.fight.auth_key === who, fight: d.fight, now })
      if (d.endStale) await db.from("walk_fights").update({ ended_at: new Date().toISOString() }).eq("id", d.endStale)
      // the old fights' streams are not kept: ten minutes after an end, they go
      await db.from("walk_fights").delete().eq("campaign_run_id", runId).lt("ended_at", new Date(now - 10 * 60 * 1000).toISOString())
      const { data, error } = await db.from("walk_fights").insert({ campaign_run_id: runId, plate, auth_key: who }).select("*").single()
      if (error) {
        // two screens opened at once: the unique index let one in. Show that one.
        const f = await liveFight(db, runId)
        if (f) return NextResponse.json({ auth: f.auth_key === who, fight: f, now })
        throw new Error(error.message)
      }
      return NextResponse.json({ auth: true, fight: data, now })
    }

    if (body.op === "tick" || body.op === "in" || body.op === "end") {
      const id = typeof body.fight === "string" ? body.fight : ""
      const f = id ? await fightById(db, id) : null
      if (!f || f.ended_at) return NextResponse.json({ error: "no such live fight", ended: true }, { status: 409 })
      if (body.op !== "in" && !mayDrive(f, who)) return NextResponse.json({ error: "this screen does not run the fight" }, { status: 403 })
      const c = cleanBody(body.body ?? {})
      if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 })
      const { data, error } = await db.from("walk_fight_msgs").insert({ fight_id: id, kind: body.op, by_key: who, body: c.body }).select("id").single()
      if (error) throw new Error(error.message)
      if (body.op === "tick") await db.from("walk_fights").update({ auth_seen: new Date().toISOString() }).eq("id", id)
      if (body.op === "end") await db.from("walk_fights").update({ ended_at: new Date().toISOString() }).eq("id", id)
      return NextResponse.json({ ok: true, id: data?.id, now: Date.now() })
    }

    return NextResponse.json({ error: "op must be open, tick, in or end" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 503 })
  }
}
