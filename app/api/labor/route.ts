import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { readSeated } from "@/lib/seats"
import { jorlanOnDuty, readStage } from "@/lib/stage-roster"
import { SHIFT_STARTS, disobey, firstWorkShift, planDay, seeded, shiftAt, suspicionReasons, type CrewMember, type PlannedDetail, type PocketResult } from "@/lib/labor"
import { CONFISCATION_STASH_NAME } from "@/lib/confiscation"
// plain .mjs, shared with the walk page (build_walk.py /*__LABOR__*/)
import { PRISONERS, advance, arrivalStep, choiceEffect, prisonerSlug, shiftOver, shiftTimeout, tooBigToHide } from "@/lib/labor-walk.mjs"
// The Quota (Sam, 2026-11-16: "Ok incorporate this into the game"): the work-detail minigame, rolled here
import * as QUOTA from "@/lib/quota.mjs"
import { skill as sheetSkill } from "@/lib/walk-sheet"
import { catalogRow, giveOne } from "@/lib/alchemy-pack-ops"
import { logTimeEvent } from "@/lib/time-tracking"
import { WATCH_STARTS } from "@/lib/world-time"

// /api/labor — Hard Labor: the work details that take the party out of the Velkynvelve slave pen.
// Design of record: project doc claude/Hard_Labor_Module_2026-10-26.md. Rules: lib/labor.ts, lib/labor-walk.mjs.
//
//   GET    today's rota for the active run, planned on first ask (deterministic per run and day, so two browsers
//          asking at once plan the same rows and the table's unique key keeps one). Answers with the party's own
//          detail and whether its shift is running now on the game clock. A party detail left over from an earlier
//          day that never ran is called off (`aborted`) — the day ended without it. A detail working for more than one
//          game hour, or 15 real minutes (the backstop), is marked overdue (`overdue: true`: the map that may finish the shift walks them home), and called
//          off if no map has started home a minute later (lib/labor-walk.mjs shiftTimeout; Sam, 2026-10-26).
//   POST   {id, action, choice?, slug?, characterId?, claimToken?}
//          action = call | march | arrive | return | done | choice | abort | event (what happened at the station: work, redo, look, pocket, caught, searched)
//                   | disobey (warning, then Malachar's d20: defused / volleys) | search (suspicion from the record) | confiscate (to the stash)
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

/** The game clock as it read at a real moment (time_log), for a detail that reached 'working' before steps were stamped. */
async function clockAt(db: Db, at: string | undefined): Promise<{ day: number; minutes: number } | null> {
  if (!at) return null
  const { data } = await db.from("time_log").select("game_day_after, minutes_of_day_after").lte("created_at", at)
    .order("created_at", { ascending: false }).limit(1).maybeSingle()
  return data ? { day: Math.max(1, Number(data.game_day_after) || 1), minutes: Number(data.minutes_of_day_after) || 0 } : null
}

/**
 * Where the game clock stood when this run began (the party reached the pen): the time_log entry at or before the run's
 * started_at; failing that, the first entry after it wound back by the minutes it advanced; failing that, no time has
 * passed since the run began, so the clock now IS the start. Feeds the first-detail wait (lib/labor firstWorkShift).
 */
async function runStartClock(db: Db, runId: string): Promise<{ day: number; minutes: number }> {
  const { data: run } = await db.from("campaign_runs").select("started_at, created_at").eq("id", runId).maybeSingle()
  const at = (run?.started_at ?? run?.created_at) as string | undefined
  const before = await clockAt(db, at)
  if (before) return before
  if (at) {
    const { data: next } = await db.from("time_log").select("game_day_after, minutes_of_day_after, minutes_advanced").gt("created_at", at)
      .order("created_at", { ascending: true }).limit(1).maybeSingle()
    if (next) {
      const t = Math.max(0, (Math.max(1, Number(next.game_day_after) || 1) - 1) * 1440 + (Number(next.minutes_of_day_after) || 0) - (Number(next.minutes_advanced) || 0))
      return { day: Math.floor(t / 1440) + 1, minutes: t % 1440 }
    }
  }
  return clockNow(db)
}

type DetailRow = { id: string; status: string; events: unknown; updated_at: string } & Record<string, unknown>

/**
 * The shift timeout: one game hour, or the 15-real-minute backstop (lib/labor-walk.mjs shiftTimeout). Writes are conditional on the row being as read,
 * so of the several maps polling at once one marks it and the rest read the mark. Returns the row and whether the maps
 * should walk the party home now.
 */
async function applyShiftTimeout(db: Db, detail: DetailRow, clock: { day: number; minutes: number }): Promise<{ detail: DetailRow; overdue: boolean }> {
  if (detail.status !== "working") return { detail, overdue: false }
  const events = Array.isArray(detail.events) ? [...detail.events] : []
  const step = arrivalStep(events)
  const arrived = step?.clock ?? (await clockAt(db, step?.at))
  const verdict = shiftTimeout({ ...detail, events }, clock, Date.now(), arrived)
  if (verdict === "ok") return { detail, overdue: false }
  if (verdict === "overdue") return { detail, overdue: true }
  const now = new Date().toISOString()
  if (verdict === "flag") {
    events.push({ at: now, kind: "overdue", why: shiftOver({ ...detail, events }, clock, Date.now(), arrived), clock, arrived })
    const { data } = await db.from("work_details").update({ events, updated_at: now })
      .eq("id", detail.id).eq("status", "working").eq("updated_at", detail.updated_at).select("*").maybeSingle()
    return { detail: (data as DetailRow | null) ?? detail, overdue: true }
  }
  // "abort": marked overdue a minute ago and no map started the way home
  events.push({ at: now, kind: "step", action: "abort", from: "working", to: "aborted", by: "timeout", clock })
  const { data } = await db.from("work_details").update({ status: "aborted", events, updated_at: now })
    .eq("id", detail.id).eq("status", "working").eq("updated_at", detail.updated_at).select("*").maybeSingle()
  if (data) await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text:
    "A work detail ran past its shift (one game hour, or 15 real minutes) and no map walked the party home, so it was called off. The party is wherever it was standing." })
  return { detail: (data as DetailRow | null) ?? detail, overdue: false }
}

/**
 * Has the shift this row means actually begun (and not yet ended)? Shift 3 on day D is the one that starts at 22:00 on
 * day D. The small hours of day D (00:00–06:00) are also "shift 3" to shiftAt(), but they are the tail of day D-1's
 * night shift. Comparing only day + shift number called day 1's 22:00 detail at 00:00 on day 1 — the first minute of
 * the run — so the party went to work the moment the session started (Sam, 2026-10-29: "the details started which it
 * shouldn't this early"), against the three-shift-change wait (firstWorkShift).
 */
function shiftUnderway(d: { day: number; shift: number }, clock: { day: number; minutes: number }): boolean {
  const start = (Math.max(1, Number(d.day) || 1) - 1) * 1440 + (SHIFT_STARTS[(Number(d.shift) || 1) - 1] ?? 0)
  const now = (Math.max(1, clock.day) - 1) * 1440 + clock.minutes
  return now >= start && now < start + 8 * 60
}

const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }

/**
 * AT LEAST THREE GO (Sam, 2026-11-16: "Make sure that at least three (if available) of the playing characters are
 * sent to do labor during labor rotations at the pen"). The detail takes everyone seated at the table; when that is
 * fewer than three, it is filled up to three from the other living player characters, the starting party first
 * (Kenta, Samson, Scott, Fifi: the heroes the map always has in the pen), then the rest. Fewer than three only when
 * fewer than three are alive.
 */
const LABOR_MIN_HEROES = 3
const PARTY_FIRST = ["Kenta of Neverwinter", "Samson Stillwater", "Scott Reedwind of Luskan", "Fifi of Waterdeep"]
async function atLeastThree(db: Db, pcs: CrewMember[]): Promise<CrewMember[]> {
  if (pcs.length >= LABOR_MIN_HEROES) return pcs
  const { data } = await db.from("characters").select("id, name, hp_current").eq("is_player", true).is("archived_at", null)
  const have = new Set(pcs.map((p) => p.id))
  const rank = (n: string) => { const i = PARTY_FIRST.indexOf(n); return i < 0 ? 99 : i }
  const more = (data ?? []).filter((r) => !have.has(r.id as string) && (r.hp_current == null || Number(r.hp_current) > 0))
    .sort((a, b) => rank(a.name as string) - rank(b.name as string))
    .map((r) => ({ kind: "pc" as const, id: r.id as string, name: r.name as string }))
  return [...pcs, ...more.slice(0, LABOR_MIN_HEROES - pcs.length)]
}

/** Plans the day if it has no rows yet. Returns the day's rows. */
async function ensureDay(db: Db, runId: string, day: number, minutes: number) {
  const { data: rows } = await db.from("work_details").select("*").eq("campaign_run_id", runId).eq("day", day).order("shift")
  if (rows && rows.length) {
    // a party detail planned before the three-hero rule (or with only one or two at the table) is topped up while it
    // has not been called yet
    const p = rows.find((r) => r.party && r.status === "scheduled")
    if (p) {
      const crew = (p.crew as CrewMember[]) ?? [], pcs = crew.filter((c) => c.kind === "pc")
      if (pcs.length < LABOR_MIN_HEROES) {
        const full = await atLeastThree(db, pcs)
        if (full.length > pcs.length) {
          const next = [...full, ...crew.filter((c) => c.kind !== "pc")]
          await db.from("work_details").update({ crew: next, updated_at: new Date().toISOString() }).eq("id", p.id).eq("status", "scheduled")
          p.crew = next
        }
      }
    }
    return rows
  }

  // a party detail from an earlier day that never ran is called off: the day ended without it
  await db.from("work_details").update({ status: "aborted", updated_at: new Date().toISOString() })
    .eq("campaign_run_id", runId).lt("day", day).eq("party", true).in("status", ["scheduled", "called"])

  const [seated, stage, npcRes, past, start] = await Promise.all([
    readSeated(db),
    readStage(db),
    db.from("npc_encounters").select("name, hp_current").in("name", PRISONERS),
    db.from("work_details").select("area_no, crew").eq("campaign_run_id", runId).eq("party", true),
    runStartClock(db, runId),
  ])
  const seatedPcs: CrewMember[] = seated.filter((s) => !s.away).map((s) => ({ kind: "pc", id: s.id, name: s.name }))
  if (!seatedPcs.length) return []                          // nobody at the table yet: plan the day when someone sits down
  const pcs = await atLeastThree(db, seatedPcs)
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
    notBefore: firstWorkShift(start),                     // Sam, 2026-10-27: not before three shift changes in the pen
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
    let overdue = false
    if (detail && detail.status === "working") ({ detail, overdue } = await applyShiftTimeout(db, detail as DetailRow, { day, minutes }))
    return NextResponse.json({ detail, due: !!detail && detail.status === "scheduled" && shiftUnderway(detail, { day, minutes }), overdue, day, shift, minutes, others: rows.filter((r) => !r.party).length,
      // Sam, 2026-10-26 ("yes" to making them visible): the prisoners NOT on the party's detail work their own shift.
      // The map takes these crews out of the pen while their shift runs and brings them back after. Derived from the
      // day's rota and the game clock, so every seat at the table sees the same prisoners gone.
      crewsNow: rows.filter((r) => !r.party && shiftUnderway(r, { day, minutes }) && r.status !== "aborted")
        .map((r) => ({ id: r.id, task: r.task, escort: r.escort ?? [], npcs: ((r.crew as CrewMember[]) ?? []).filter((c) => c.kind === "npc").map((c) => c.id) })) })
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
    const kind = ["work", "redo", "look", "pocket", "caught", "searched"].includes(body.kind) ? body.kind : null
    if (!kind) return NextResponse.json({ error: "unknown event" }, { status: 400 })
    if (row.status !== "working" && row.status !== "returning") return NextResponse.json({ error: "the detail is not at work" }, { status: 409 })
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

  const onCrew = () => dm || (row.crew as CrewMember[]).some((c) => c.kind === "pc" && c.id === playerId)
  const heroSlug = typeof body.slug === "string" ? body.slug.slice(0, 40) : ""

  // ---------- THE QUOTA: the shift itself (lib/quota.mjs) ----------
  if (action === "quota") {
    if (!onCrew()) return NextResponse.json({ error: "your hero is not on this detail" }, { status: 403 })
    return quotaAction(db, row as DetailRow, body, dm, playerId)
  }

  // ---------- disobedience (PR 4) ----------
  // Sam, 2026-10-26: the first time is the warning; after that Malachar rolls — a fellow prisoner on the detail defuses
  // it (takes the thing and offers it to the guard), or the escort shoots until the hero drops. The d20 is rolled here.
  if (action === "disobey") {
    if (!onCrew()) return NextResponse.json({ error: "your hero is not on this detail" }, { status: 403 })
    if (!heroSlug) return NextResponse.json({ error: "whose disobedience?" }, { status: 400 })
    const cause = ["keep-item", "refuse-work", "cast", "back-talk"].includes(body.cause) ? body.cause : "keep-item"
    const strikes = events.filter((e) => e.slug === heroSlug && (e.kind === "warning" || e.kind === "disobey")).length
    const d20 = 1 + Math.floor(Math.random() * 20)
    const companions = (row.crew as CrewMember[]).filter((c) => c.kind === "npc")
    const out = disobey(strikes, d20, companions, false, Math.random)        // the surgeon's record decides her part (/api/drow-surgeon "labor")
    const by = out.kind === "defused" ? companions.find((c) => c.name === out.by) ?? null : null
    events.push(out.kind === "warning"
      ? { at: now, kind: "warning", slug: heroSlug, cause }
      : { at: now, kind: "disobey", slug: heroSlug, cause, d20, outcome: out.kind, npc: by ? by.id : undefined })
    await db.from("work_details").update({ events, updated_at: now }).eq("id", id)
    const who = typeof body.name === "string" ? body.name.slice(0, 60) : "A prisoner"
    await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text:
      out.kind === "warning" ? `${who} defied the escort on a work detail (${cause}). Warning: the quaggoth slapped them down.`
      : out.kind === "defused" ? `${who} defied the escort again (Malachar's d20: ${d20}). ${by?.name ?? "A prisoner"} stepped in, took the thing from ${who} and offered it to the guard — defused. ${who} owes ${by?.name ?? "them"} for it; ${by?.name ?? "they"} will want a word about it later.`
      : `${who} defied the escort again (Malachar's d20: ${d20}). Nobody stepped in: the drow shoots.` })
    return NextResponse.json({ outcome: out.kind, d20: out.kind === "warning" ? undefined : d20, npc: by ? { id: by.id, name: by.name } : null, strikes: strikes + 1 })
  }

  // ---------- the search on suspicion (PR 4; Sam: never routine) ----------
  if (action === "search") {
    if (!onCrew()) return NextResponse.json({ error: "your hero is not on this detail" }, { status: 403 })
    const mine = events.filter((e) => e.slug === heroSlug && e.kind === "pocket" && e.item && !e.confiscated)
    if (!mine.length) return NextResponse.json({ reasons: [], items: [] })
    const { data: cat } = await db.from("items").select("slug, name, item_type, weight").in("slug", mine.map((e) => e.item))
    const big = (cat ?? []).some((it) => tooBigToHide(it))
    const pockets: PocketResult[] = mine.map((e) => ({ kept: true, caughtBy: null, margin: e.margin ?? 99, suspicious: !!e.close }))
    const reasons = suspicionReasons({ pockets, biggestHidden: big ? "large" : "small" })
    return NextResponse.json({ reasons, items: mine.map((e) => e.item) })
  }

  // ---------- what the search found goes to the stash (lib/confiscation.ts), like everything the drow took ----------
  if (action === "confiscate") {
    if (!onCrew()) return NextResponse.json({ error: "your hero is not on this detail" }, { status: 403 })
    const characterId = dm && typeof body.characterId === "string" ? body.characterId : playerId
    if (!characterId) return NextResponse.json({ error: "whose pockets?" }, { status: 400 })
    const { data: stash } = await db.from("characters").select("id").eq("name", CONFISCATION_STASH_NAME).order("created_at", { ascending: true }).limit(1).maybeSingle()
    if (!stash?.id) return NextResponse.json({ error: "no equipment stash" }, { status: 500 })
    const taken: string[] = []
    for (const e of events) {
      if (e.slug !== heroSlug || e.kind !== "pocket" || !e.item || e.confiscated) continue
      const { data: it } = await db.from("items").select("id, name").eq("slug", e.item).maybeSingle()
      if (!it) continue
      const { data: inv } = await db.from("inventory_items").select("id, quantity").eq("character_id", characterId).eq("item_id", it.id).is("confiscated_from", null).limit(1).maybeSingle()
      if (!inv) { e.confiscated = "gone"; continue }
      if ((inv.quantity ?? 1) > 1) {
        await db.from("inventory_items").update({ quantity: (inv.quantity ?? 1) - 1 }).eq("id", inv.id)
        const { data: full } = await db.from("inventory_items").select("*").eq("id", inv.id).maybeSingle()
        if (full) { const { id: _drop, created_at: _c, updated_at: _u, ...rest } = full as Record<string, unknown>; await db.from("inventory_items").insert({ ...rest, quantity: 1, character_id: stash.id, confiscated_from: characterId }) }
      } else {
        await db.from("inventory_items").update({ character_id: stash.id, confiscated_from: characterId }).eq("id", inv.id)
      }
      e.confiscated = now; taken.push(it.name as string)
    }
    events.push({ at: now, kind: "confiscated", slug: heroSlug, items: taken })
    await db.from("work_details").update({ events, updated_at: now }).eq("id", id)
    if (taken.length) await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text: `The escort searched a prisoner on the way back from a work detail and took ${taken.join(", ")} — back to the drow's stores.` })
    return NextResponse.json({ taken })
  }

  if (action === "abort" && !dm) return NextResponse.json({ error: "only the DM may call a detail off" }, { status: 403 })
  // every step carries the game clock: 'working' starts the one-game-hour shift timeout from it
  const clock = await clockNow(db)
  if (action === "call" && !dm) {
    // a player's browser may only call a detail whose shift is running now
    if (!shiftUnderway(row, clock)) return NextResponse.json({ error: "not this shift" }, { status: 409 })
  }
  const next = advance(row.status, action)
  if (!next) return NextResponse.json({ error: `cannot ${action} a ${row.status} detail`, detail: row }, { status: 409 })
  events.push({ at: now, kind: "step", action, from: row.status, to: next, by: dm ? "dm" : playerId, clock })
  // conditional on the status we read: of two browsers racing to march, one wins
  const { data, error } = await db.from("work_details").update({ status: next, events, updated_at: now }).eq("id", id).eq("status", row.status).select("*").maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "someone else moved it first" }, { status: 409 })
  if (next === "done" && row.party) await laborHomeClock(db)
  return NextResponse.json({ detail: data })
}


// ============================================================================
// THE QUOTA (Sam, 2026-11-15/16): the work-detail minigame on the work plate, in place of the 3-minute watch.
// The server holds the shift and rolls every die (lib/quota.mjs), so every screen sees one game. The state rides on
// the detail as its latest `quota` event. ops: start (idempotent) · pick {choice} (your own hero, on your turn) ·
// nudge (anyone: a seated player who has not chosen in 45 s keeps working). What it changes in the world: stolen items
// into the thief's pack, HP from a beating, exhaustion and Heroic Inspiration at the end, the search on Suspicion
// (items back to the drow's stash), and the run's carry-over (Suspicion, taken numbers, facts, lockdown) in world_flags.
// ============================================================================
const QUOTA_FLAG = (runId: string) => `quota:${runId}`
const FLAG_CAMPAIGN = "ashes-of-prometheus"   // world_flags' campaign key (lib/world-time-tick, lib/seats)
const QUOTA_COLUMNS = "id, name, class, hp_current, hp_max, exhaustion, proficiency_bonus, str_modifier, dex_modifier, con_modifier, int_modifier, wis_modifier, cha_modifier, sheet_skill_proficiencies"
type QState = Record<string, any>   // lib/quota.mjs's shift state (plain .mjs, untyped)

function quotaOf(events: unknown[]): QState | null {
  for (let i = events.length - 1; i >= 0; i--) { const e = events[i] as { kind?: string; state?: QState }; if (e && e.kind === "quota" && e.state) return e.state }
  return null
}

async function quotaHeroes(db: Db, crew: CrewMember[], task: string) {
  const ids = crew.filter((c) => c.kind === "pc").map((c) => c.id)
  const { data } = await db.from("characters").select(QUOTA_COLUMNS).in("id", ids)
  const rows = new Map((data ?? []).map((r) => [r.id as string, r as Record<string, unknown>]))
  const check = QUOTA.workCheck(task)
  return ids.map((id) => {
    const r = rows.get(id) ?? {}, n = (k: string) => Number(r[k]) || 0, prof = Number(r.proficiency_bonus) || 2
    const work = check.skill === "Athletics" ? sheetSkill(r, "Athletics", n("str_modifier"), prof)
      : check.skill === "Survival" ? sheetSkill(r, "Survival", n("wis_modifier"), prof) : n("dex_modifier")
    return {
      id, name: (r.name as string) || crew.find((c) => c.id === id)?.name || "Hero", cls: (r.class as string) || "",
      mods: { work, soh: sheetSkill(r, "Sleight of Hand", n("dex_modifier"), prof), perf: sheetSkill(r, "Performance", n("cha_modifier"), prof),
        pers: sheetSkill(r, "Persuasion", n("cha_modifier"), prof), con: n("con_modifier") },
      hp: r.hp_current == null ? Number(r.hp_max) || 1 : Number(r.hp_current), hpMax: Number(r.hp_max) || 1, exh: Number(r.exhaustion) || 0,
    }
  })
}

async function quotaAction(db: Db, row0: DetailRow, body: Record<string, unknown>, dm: boolean, playerId: string | null) {
  const op = typeof body.op === "string" ? body.op : ""
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row } = attempt ? await db.from("work_details").select("*").eq("id", row0.id).maybeSingle() : { data: row0 }
    if (!row) return NextResponse.json({ error: "no such detail" }, { status: 404 })
    if (row.status !== "working") return NextResponse.json({ error: "the detail is not at work", detail: row }, { status: 409 })
    const events = Array.isArray(row.events) ? [...row.events] : []
    let st = quotaOf(events)
    const before = st ? JSON.stringify({ hp: Object.fromEntries(Object.values(st.heroes as Record<string, any>).map((h) => [h.id, h.hp])), stolen: st.stolen.length, done: st.done }) : ""
    const nowMs = Date.now()
    if (op === "start") {
      if (st) return NextResponse.json({ detail: row })
      const { data: flag } = await db.from("world_flags").select("value").eq("campaign_id", FLAG_CAMPAIGN).eq("key", QUOTA_FLAG(row.campaign_run_id as string)).maybeSingle()
      const seated = new Set((await readSeated(db)).map((s) => s.id))
      const heroes = (await quotaHeroes(db, row.crew as CrewMember[], row.task as string)).filter((h) => h.hp > 0)
      if (!heroes.length) return NextResponse.json({ error: "nobody able to work" }, { status: 409 })
      st = QUOTA.newShift({ task: row.task, heroes, carry: (flag?.value as Record<string, unknown>) ?? {}, bots: heroes.filter((h) => !seated.has(h.id)).map((h) => h.id) }, Math.random, nowMs)
    } else if (!st) return NextResponse.json({ error: "the shift has not started" }, { status: 409 })
    else if (op === "pick") {
      const who = dm ? (typeof body.who === "string" ? body.who : QUOTA.current(st)) : playerId
      const err = QUOTA.choose(st, who, typeof body.choice === "string" ? body.choice : "work", Math.random, nowMs)
      if (err) return NextResponse.json({ error: err, detail: row }, { status: 409 })
    } else if (op === "nudge") {
      if (!QUOTA.nudge(st, Math.random, nowMs)) return NextResponse.json({ detail: row })
    } else return NextResponse.json({ error: "unknown op" }, { status: 400 })
    if (!st) return NextResponse.json({ error: "the shift has not started" }, { status: 409 })
    const now = new Date().toISOString()
    const kept = events.filter((e) => !(e && (e as { kind?: string }).kind === "quota"))
    kept.push({ at: now, kind: "quota", state: st })
    const { data: saved } = await db.from("work_details").update({ events: kept.slice(-200), updated_at: now })
      .eq("id", row.id).eq("updated_at", row.updated_at).select("*").maybeSingle()
    if (!saved) continue                       // another screen wrote first: read again and re-apply
    const after = JSON.stringify({ hp: Object.fromEntries(Object.values(st.heroes as Record<string, any>).map((h) => [h.id, h.hp])), stolen: st.stolen.length, done: st.done })
    if (op !== "start" && after !== before) await quotaConsequences(db, row as DetailRow, st, before ? JSON.parse(before) : null)
    return NextResponse.json({ detail: saved })
  }
  return NextResponse.json({ error: "busy, try again" }, { status: 409 })
}

/** What the round (or the end) changes in the world. Best-effort: a failure here never loses the shift. */
async function quotaConsequences(db: Db, row: DetailRow, st: QState, was: { hp: Record<string, number>; stolen: number; done: boolean } | null) {
  try {
    for (const h of Object.values(st.heroes as Record<string, any>)) {
      if (was && was.hp[h.id] !== h.hp) await db.from("characters").update({ hp_current: h.hp }).eq("id", h.id)
    }
    for (const s of (st.stolen as { who: string; slug: string }[]).slice(was ? was.stolen : 0)) {
      const item = await catalogRow(db, s.slug)
      if (item) await giveOne(db, s.who, item)
    }
    if (!st.done || (was && was.done)) return
    const e = st.end
    for (const [id, n] of Object.entries(e.exhGain as Record<string, number>)) {
      const h = st.heroes[id]; await db.from("characters").update({ exhaustion: Math.min(6, (h.exh || 0) + n) }).eq("id", id)
    }
    for (const id of e.inspired as string[]) await db.from("characters").update({ sheet_heroic_inspiration: true }).eq("id", id)
    // the search on Suspicion: what is found goes back to the drow's stores, like everything they took
    const { data: stash } = await db.from("characters").select("id").eq("name", CONFISCATION_STASH_NAME).order("created_at", { ascending: true }).limit(1).maybeSingle()
    for (const f of e.found as { who: string; slug: string }[]) {
      const { data: it } = await db.from("items").select("id").eq("slug", f.slug).maybeSingle()
      if (!it || !stash?.id) continue
      const { data: inv } = await db.from("inventory_items").select("*").eq("character_id", f.who).eq("item_id", it.id).is("confiscated_from", null).limit(1).maybeSingle()
      if (!inv) continue
      if ((inv.quantity ?? 1) > 1) {
        await db.from("inventory_items").update({ quantity: (inv.quantity ?? 1) - 1 }).eq("id", inv.id)
        const { id: _i, created_at: _c, updated_at: _u, ...rest } = inv as Record<string, unknown>
        await db.from("inventory_items").insert({ ...rest, quantity: 1, character_id: stash.id, confiscated_from: f.who })
      } else await db.from("inventory_items").update({ character_id: stash.id, confiscated_from: f.who }).eq("id", inv.id)
    }
    await db.from("world_flags").upsert({ campaign_id: FLAG_CAMPAIGN, key: QUOTA_FLAG(row.campaign_run_id as string), value: e.carry, set_by: "labor", note: "The Quota: what carries to the next shift (lib/quota.mjs)" }, { onConflict: "campaign_id,key" })
    const names = (ids: string[]) => ids.map((id) => st.heroes[id]?.short).filter(Boolean).join(", ")
    const kept = (e.kept as { who: string; slug: string }[]).map((k) => `${st.heroes[k.who]?.short}: ${k.slug}`)
    await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text:
      `The work detail's quota was ${e.met ? "met" : "missed"} (${st.filled} of ${st.quota}). Suspicion ${st.susp}/4${e.search ? ` (${e.search})` : ""}.` +
      (kept.length ? ` Smuggled back: ${kept.join("; ")}.` : "") + (e.found.length ? ` Found and taken by the escort: ${e.found.length}.` : "") +
      (Object.keys(e.exhGain).length ? ` Exhaustion: ${names(Object.keys(e.exhGain))}.` : "") +
      (st.facts.length ? ` What the drow have let slip: ${st.facts.join(" ")}` : "") })
  } catch (err) { console.error("[labor] quota consequences:", err) }
}

/**
 * HOME, AND ONE CHANGE OF THE WATCH (Sam, 2026-11-16: "When the game is won the game fades and everyone is back in
 * the pen. The timer is updated just one exchange and the timer starts again."). The clock stood still while the
 * detail was out (lib/world-time-tick partyAtLabor); when the party is back it jumps to the next change of the watch
 * (lib/world-time WATCH_STARTS, every 4 game hours) and runs on from there.
 */
async function laborHomeClock(db: Db) {
  try {
    const { data: ses } = await db.from("sessions").select("id,status,started_at").order("started_at", { ascending: false })
    const rows = (ses ?? []) as { id: string; status: string | null }[]
    const sessionId = (rows.find((s) => s.status === "active") ?? rows[0])?.id ?? null
    if (!sessionId) return
    const { data: clk } = await db.from("game_clock").select("minutes_of_day").eq("session_id", sessionId).maybeSingle()
    const m = Number(clk?.minutes_of_day) || 0
    const next = WATCH_STARTS.find((w) => w > m) ?? WATCH_STARTS[0] + 1440
    await logTimeEvent(db, sessionId, { eventType: "labor_shift", minutesAdvanced: next - m })
  } catch (e) { console.error("[labor] home clock:", e) }
}
