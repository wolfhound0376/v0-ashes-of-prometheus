import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { readSeated } from "@/lib/seats"
import { jorlanOnDuty, readStage } from "@/lib/stage-roster"
import { planDay, seeded, shiftAt, type CrewMember, type PlannedDetail } from "@/lib/labor"
// plain .mjs, shared with the walk page (build_walk.py /*__LABOR__*/)
import { PRISONERS, advance, choiceEffect, prisonerSlug } from "@/lib/labor-walk.mjs"

// /api/labor — Hard Labor: the work details that take the party out of the Velkynvelve slave pen.
// Design of record: project doc claude/Hard_Labor_Module_2026-10-26.md. Rules: lib/labor.ts, lib/labor-walk.mjs.
//
//   GET    today's rota for the active run, planned on first ask (deterministic per run and day, so two browsers
//          asking at once plan the same rows and the table's unique key keeps one). Answers with the party's own
//          detail and whether its shift is running now on the game clock. A party detail left over from an earlier
//          day that never ran is called off (`aborted`) — the day ended without it.
//   POST   {id, action, choice?, slug?, characterId?, claimToken?}
//          action = call | march | arrive | return | done | choice | abort | event (what happened at the station: work, redo, look, pocket, caught)
//          The DM (x-dm-key) may do anything, including calling a detail before its shift (`call` with force) and
//          `abort`. A seated player's own browser may move the detail along its steps and give its own hero's answer.
//          A step out of order — two browsers racing to march — answers 409, and only the winner drives the walk.

export const dynamic = "force-dynamic"

const CAMPAIGN_ID = "abyss"
type Db = ReturnType<typeof createAdminClient>

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

async function activeRunId(db: Db): Promise<string | null> {
  const { data: run } = await db.from("campaign_runs").select("id").eq("campaign_id", CAMPAIGN_ID).eq("status", "active").order("run_number", { ascending: false }).limit(1).maybeSingle()
  if (run?.id) return run.id as string
  const { data: pos } = await db.from("party_position").select("campaign_run_id").limit(1).maybeSingle()
  return (pos?.campaign_run_id as string | undefined) ?? null
}

async function clockNow(db: Db): Promise<{ day: number; minutes: number }> {
  const { data } = await db.from("game_clock").select("game_day, minutes_of_day").order("updated_at", { ascending: false }).limit(1).maybeSingle()
  const day = Math.max(1, Number(data?.game_day) || 1), minutes = Number(data?.minutes_of_day) || 0
  return { day, minutes }
}

const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }

/** Plans the day if it has no rows yet. Returns the day's rows. */
async function ensureDay(db: Db, runId: string, day: number, minutes: number) {
  const { data: rows } = await db.from("work_details").select("*").eq("campaign_run_id", runId).eq("day", day).order("shift")
  if (rows && rows.length) return rows

  // a party detail from an earlier day that never ran is called off: the day ended without it
  await db.from("work_details").update({ status: "aborted", updated_at: new Date().toISOString() })
    .eq("campaign_run_id", runId).lt("day", day).eq("party", true).in("status", ["scheduled", "called"])

  const [seated, stage, npcRes, past] = await Promise.all([
    readSeated(db),
    readStage(db),
    db.from("npc_encounters").select("name, hp_current").in("name", PRISONERS),
    db.from("work_details").select("area_no, crew").eq("campaign_run_id", runId).eq("party", true),
  ])
  const pcs: CrewMember[] = seated.filter((s) => !s.away).map((s) => ({ kind: "pc", id: s.id, name: s.name }))
  if (!pcs.length) return []                                // nobody at the table yet: plan the day when someone sits down
  const npcs: CrewMember[] = (npcRes.data ?? []).filter((r) => r.hp_current == null || Number(r.hp_current) > 0)
    .map((r) => ({ kind: "npc", id: prisonerSlug(r.name), name: r.name as string }))
  const timesWithParty: Record<string, number> = {}
  const areasSeen: number[] = []
  for (const r of past.data ?? []) {
    if (typeof r.area_no === "number") areasSeen.push(r.area_no)
    for (const c of (r.crew as CrewMember[]) ?? []) if (c.kind === "npc") timesWithParty[c.id] = (timesWithParty[c.id] ?? 0) + 1
  }
  const plan: PlannedDetail[] = planDay({
    day, pcs, npcs, timesWithParty, areasSeen,
    platesReady: ["lift-cliffside"],                       // Sam's plate, PR #920
    jorlanOnDuty: jorlanOnDuty(stage),
    fromShift: shiftAt(minutes),
  }, seeded(hash(`${runId}:${day}`)))
  if (plan.length) {
    await db.from("work_details").upsert(plan.map((d) => ({ campaign_run_id: runId, ...d })), { onConflict: "campaign_run_id,day,shift,task", ignoreDuplicates: true })
  }
  const { data: after } = await db.from("work_details").select("*").eq("campaign_run_id", runId).eq("day", day).order("shift")
  return after ?? []
}

export async function GET() {
  try {
    const db = createAdminClient()
    const runId = await activeRunId(db)
    if (!runId) return NextResponse.json({ detail: null, error: "no active run" })
    const { day, minutes } = await clockNow(db)
    const rows = await ensureDay(db, runId, day, minutes)
    const shift = shiftAt(minutes)
    // the party's detail: today's, or one still out from an earlier day (a shift that runs past midnight)
    let detail = rows.find((r) => r.party) ?? null
    const { data: out } = await db.from("work_details").select("*").eq("campaign_run_id", runId).eq("party", true)
      .in("status", ["called", "escorting", "working", "returning"]).order("day", { ascending: false }).limit(1).maybeSingle()
    if (out) detail = out
    return NextResponse.json({ detail, due: !!detail && detail.status === "scheduled" && detail.day === day && detail.shift === shift, day, shift, minutes, others: rows.filter((r) => !r.party).length })
  } catch (e) {
    return NextResponse.json({ detail: null, error: String(e) }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === "string" ? body.id : ""
  const action = typeof body.action === "string" ? body.action : ""
  if (!id || !action) return NextResponse.json({ error: "id and action required" }, { status: 400 })

  const db = createAdminClient()
  const dm = isDm(req)
  let playerId: string | null = null
  if (!dm) {
    const characterId = typeof body.characterId === "string" ? body.characterId : ""
    const claimToken = typeof body.claimToken === "string" ? body.claimToken : ""
    if (!characterId || !claimToken) return NextResponse.json({ error: "DM key or your own claim required" }, { status: 403 })
    const { data: secret } = await db.from("character_secrets").select("claim_token").eq("character_id", characterId).maybeSingle()
    if (!secret || secret.claim_token !== claimToken) return NextResponse.json({ error: "not your character" }, { status: 403 })
    playerId = characterId
  }

  const { data: row } = await db.from("work_details").select("*").eq("id", id).maybeSingle()
  if (!row) return NextResponse.json({ error: "no such detail" }, { status: 404 })
  const now = new Date().toISOString()
  const events = Array.isArray(row.events) ? [...row.events] : []

  if (action === "choice") {
    const choice = ["go", "drag", "refuse"].includes(body.choice) ? body.choice : "go"
    const slug = typeof body.slug === "string" ? body.slug.slice(0, 40) : ""
    if (!dm && !(row.crew as CrewMember[]).some((c) => c.kind === "pc" && c.id === playerId)) return NextResponse.json({ error: "your hero is not on this detail" }, { status: 403 })
    if (events.some((e) => e.kind === "choice" && e.slug === slug)) return NextResponse.json({ detail: row, already: true })
    events.push({ at: now, kind: "choice", slug, choice, by: dm ? "dm" : playerId })
    if (choiceEffect(choice).warning) events.push({ at: now, kind: "warning", slug, cause: "refuse-work" })   // strike 1 [SAM]
    const { data } = await db.from("work_details").update({ events, updated_at: now }).eq("id", id).select("*").maybeSingle()
    return NextResponse.json({ detail: data })
  }

  if (action === "event") {
    // what happened at the station (PR 3): the work, a redo, a look, a pocket (and how close it was), a catch.
    // The record PR 4's search-on-suspicion reads; nothing here changes the detail's step.
    const kind = ["work", "redo", "look", "pocket", "caught"].includes(body.kind) ? body.kind : null
    if (!kind) return NextResponse.json({ error: "unknown event" }, { status: 400 })
    if (row.status !== "working") return NextResponse.json({ error: "the detail is not at work" }, { status: 409 })
    if (!dm && !(row.crew as CrewMember[]).some((c) => c.kind === "pc" && c.id === playerId)) return NextResponse.json({ error: "your hero is not on this detail" }, { status: 403 })
    const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined)
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined)
    events.push({
      at: now, kind, by: dm ? "dm" : playerId, slug: clip(body.slug, 40), item: clip(body.item, 60), success: typeof body.success === "boolean" ? body.success : undefined,
      total: num(body.total), dc: num(body.dc), margin: num(body.margin), close: typeof body.close === "boolean" ? body.close : undefined,
    })
    const { data } = await db.from("work_details").update({ events: events.slice(-200), updated_at: now }).eq("id", id).select("*").maybeSingle()
    return NextResponse.json({ detail: data })
  }

  if (action === "abort" && !dm) return NextResponse.json({ error: "only the DM may call a detail off" }, { status: 403 })
  if (action === "call" && !dm) {
    // a player's browser may only call a detail whose shift is running now
    const { day, minutes } = await clockNow(db)
    if (row.day !== day || row.shift !== shiftAt(minutes)) return NextResponse.json({ error: "not this shift" }, { status: 409 })
  }
  const next = advance(row.status, action)
  if (!next) return NextResponse.json({ error: `cannot ${action} a ${row.status} detail`, detail: row }, { status: 409 })
  events.push({ at: now, kind: "step", action, from: row.status, to: next, by: dm ? "dm" : playerId })
  // conditional on the status we read: of two browsers racing to march, one wins
  const { data, error } = await db.from("work_details").update({ status: next, events, updated_at: now }).eq("id", id).eq("status", row.status).select("*").maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "someone else moved it first" }, { status: 409 })
  return NextResponse.json({ detail: data })
}
