import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { COMPANION_ROWS, campName, campRoster, type WorldLike } from "@/lib/camp-roster"
import { buppidoInTheDark, d, fistFight, hungerEvent, type Brawler, type HungerEvent } from "@/lib/camp-hunger"
import { skillBonus, type SheetSlice } from "@/lib/game-context"
import { dressRow } from "@/lib/worn-gear-rows"

// /api/camp/hunger — what a hungry night does to the company (lib/camp-hunger.ts has Sam's rule and the sources).
//
//   POST {op: "night", fed, meal?}     Camp at the Fire's SLEEP, after the food is counted. Fed: the hungry streak
//        → {nights, event, text}       resets. Hungry: one more night in a row, and the rule decides what it brings.
//                                       `meal` ("full" | "partial" | "none") is what the night bought; it is kept on
//                                       party_supplies.last_camp_rest so the chat route's long rest obeys the fire.
//                                       Buppido's blow and the twins leaving are settled here and now; a brawl or a
//                                       rage waits for the party (op "settle").
//   POST {op: "settle", event, hero?, how?}   A brawl or rage: the hero steps in (Persuasion or Intimidation against
//        → {calmed, text}              the night's DC, with advantage when Shuushar tries too) or nobody does; failed,
//                                       the fists decide, and the hit points and grudges are written.
//
// WHO MAY WRITE: the same fail-open DM-key rule as /api/camp/haul (the camp page sends the key the browser keeps).

export const dynamic = "force-dynamic"
const CAMPAIGN_ID = "abyss"
type Db = ReturnType<typeof createAdminClient>

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return true
  return safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

const COLS = "id,name,level,hp_current,hp_max,ac,str_score,dex_score,con_score,int_score,wis_score,cha_score,proficiency_bonus,passive_perception,sheet_skill_proficiencies"
type Row = SheetSlice & { hp_current: number | null; hp_max: number | null; ac: number | null }

async function world(db: Db) {
  const { data: run } = await db.from("campaign_runs").select("id").eq("campaign_id", CAMPAIGN_ID).neq("status", "ended")
    .order("run_number", { ascending: false }).limit(1).maybeSingle()
  if (!run?.id) return null
  const { data: w } = await db.from("walk_world").select("heroes,state").eq("campaign_run_id", run.id).maybeSingle()
  return { runId: run.id as string, w: w as (WorldLike & { state?: Record<string, unknown> }) | null }
}

/** A slug at the fire → its characters row id (heroes from the walk, companions from their fixed rows). */
function rowIdOf(slug: string, w: WorldLike | null): string | null {
  if (slug in COMPANION_ROWS) return COMPANION_ROWS[slug]
  const h = w?.heroes?.[slug]
  return (h && typeof h.cid === "string" && h.cid) || null
}

async function rowOf(db: Db, id: string | null): Promise<Row | null> {
  if (!id) return null
  const { data } = await db.from("characters").select(COLS).eq("id", id).maybeSingle()
  return dressRow(db, (data as Row | null) ?? null)   // with their gear on (lib/worn-bonus.ts)
}

async function grudge(db: Db, a: string | null, b: string | null, reason: string) {
  if (!a || !b) return
  for (const [s, o] of [[a, b], [b, a]]) {
    const { data } = await db.from("character_relationships").select("id,resentment").eq("subject_id", s).eq("object_id", o).maybeSingle()
    if (data) await db.from("character_relationships").update({ resentment: (Number(data.resentment) || 0) + 2, last_reason: reason, updated_at: new Date().toISOString() }).eq("id", data.id)
    else await db.from("character_relationships").insert({ subject_id: s, object_id: o, resentment: 2, last_reason: reason })
  }
}

const name = (slug: string, r: Row | null) => campName(slug, r?.name)

export async function POST(req: NextRequest) {
  if (!isDm(req)) return NextResponse.json({ error: "DM key required" }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const db = createAdminClient()
  const W = await world(db).catch(() => null)
  const roster = campRoster(W?.w ?? null)
  const r = Math.random

  if (body.op === "night") {
    const { data: pool } = await db.from("party_supplies").select("id,hungry_nights").limit(1).maybeSingle()
    const before = Number((pool as { hungry_nights?: number } | null)?.hungry_nights) || 0
    const nights = body.fed ? 0 : before + 1
    // What the fire bought tonight (Sam, 2026-11-16: "fix gap"): the chat route's long rest at camp reads this.
    const meal = body.meal === "full" || body.meal === "partial" || body.meal === "none" ? body.meal : body.fed ? null : "none"
    const now = new Date().toISOString()
    if (pool?.id) await db.from("party_supplies").update({ hungry_nights: nights, updated_at: now, ...(meal ? { last_camp_rest: meal, last_camp_rest_at: now } : {}) }).eq("id", pool.id)
    if (!roster) return NextResponse.json({ nights, event: { kind: nights ? "grumble" : "none" }, text: nights ? "Stomachs growl in the dark." : "" })
    const heroes = roster.heroes.map((h) => h.slug)
    const event: HungerEvent = hungerEvent(nights, roster.companions, heroes, r)
    if (event.kind === "grumble")
      return NextResponse.json({ nights, event, text: nights === 1 ? "A hungry night. Stomachs growl, tempers fray, nobody sleeps well." : `Another hungry night (${nights} in a row). The muttering has an edge to it now.` })
    if (event.kind === "buppido") {
      const row = await rowOf(db, rowIdOf(event.target, W?.w ?? null))
      const passive = Number(row?.passive_perception) || 10 + (Math.floor((Number(row?.wis_score) || 10) / 2) - 5)
      const b = buppidoInTheDark(passive, Number(row?.ac) || 10, r)
      const who = name(event.target, row)
      if (b.spotted) return NextResponse.json({ nights, event, text: `In the dark, ${who} wakes to find Buppido crouched over them with a rock in his hand. He smiles. "Sleepwalking," he says, and goes back to his bedroll.` })
      if (!b.hit) return NextResponse.json({ nights, event, text: `Something scrapes on the stone beside ${who}'s head in the night. In the morning there is a rock there that was not there before.` })
      if (row) await db.from("characters").update({ hp_current: Math.max(0, (Number(row.hp_current) || 0) - b.damage) }).eq("id", row.id)
      return NextResponse.json({ nights, event, damage: b.damage, text: `${who} wakes in the dark with blood in their hair: ${b.damage} bludgeoning from something heavy. Everyone is asleep. Buppido is snoring a little too loudly.` })
    }
    if (event.kind === "twins") {
      const gone = ["topsy", "turvy"].filter((t) => roster.companions.includes(t))
      const state = (W?.w?.state ?? {}) as Record<string, unknown>
      const company = (Array.isArray(state.company) ? state.company : []).filter((c) => !gone.includes(String(c)))
      const left = [...new Set([...(Array.isArray(state.leftBehind) ? state.leftBehind : []), ...gone])]
      if (W?.runId) await db.rpc("walk_world_apply", { p_run: W.runId, p_patch: { state: { company, leftBehind: left } }, p_by: "camp" })
      return NextResponse.json({ nights, event, gone, text: `In the morning ${gone.length > 1 ? "Topsy and Turvy are" : `${campName(gone[0], null)} is`} gone, and so is whatever food was left in the packs. Nobody heard a thing.` })
    }
    if (event.kind !== "brawl" && event.kind !== "rage") return NextResponse.json({ nights, event, text: "" })
    // a brawl or a rage: the party decides what happens (op "settle")
    const a = name(event.a, null), bName = name(event.b, null)
    const text = event.kind === "brawl" ? `${a} shoves ${bName}. Hunger has worn the last of the patience off them both, and the fists come up.` : `${a} roars. Something in him has snapped: he turns on ${bName}.`
    return NextResponse.json({ nights, event, text })
  }

  if (body.op === "settle") {
    const ev = body.event as { kind?: string; a?: string; b?: string; dc?: number; calmer?: boolean } | undefined
    if (!ev || (ev.kind !== "brawl" && ev.kind !== "rage") || !ev.a || !ev.b) return NextResponse.json({ error: "no brawl to settle" }, { status: 400 })
    const [ra, rb] = await Promise.all([rowOf(db, rowIdOf(ev.a, W?.w ?? null)), rowOf(db, rowIdOf(ev.b, W?.w ?? null))])
    const an = name(ev.a, ra), bn = name(ev.b, rb)
    let stepText = ""
    if (typeof body.hero === "string" && (body.how === "persuasion" || body.how === "intimidation")) {
      const hr = await rowOf(db, rowIdOf(body.hero, W?.w ?? null))
      if (hr) {
        const sb = skillBonus(hr as SheetSlice, body.how)
        const roll = ev.calmer ? Math.max(d(20, r), d(20, r)) : d(20, r)
        const total = roll + sb.mod + sb.prof, dc = Number(ev.dc) || 20
        const hero = campName(body.hero, hr.name)
        stepText = `${hero} steps between them: ${body.how === "persuasion" ? "Persuasion" : "Intimidation"} ${roll} + ${sb.mod + sb.prof} = ${total} vs ${dc >= 25 ? "Very Hard" : "Hard"}${ev.calmer ? " (Shuushar helps: advantage)" : ""}.`
        if (total >= dc) return NextResponse.json({ calmed: true, text: `${stepText} It works. ${an} and ${bn} back off, glaring, and the fire is quiet again.` })
        stepText += " It doesn't work."
      }
    }
    const A: Brawler = { slug: ev.a, name: an, hp: Number(ra?.hp_current ?? ra?.hp_max) || 10, ac: Number(ra?.ac) || 10, str: Number(ra?.str_score) || 10, claw: ev.a === "derendil" }
    const B: Brawler = { slug: ev.b, name: bn, hp: Number(rb?.hp_current ?? rb?.hp_max) || 10, ac: Number(rb?.ac) || 10, str: Number(rb?.str_score) || 10, claw: ev.b === "derendil" }
    const f = fistFight(A, B, r)
    const rowFor = (s: string) => (s === ev.a ? ra : rb)
    const w = rowFor(f.winner.slug), l = rowFor(f.loser.slug)
    if (w) await db.from("characters").update({ hp_current: f.winnerHp }).eq("id", w.id)
    if (l) await db.from("characters").update({ hp_current: f.loserHp }).eq("id", l.id)
    await grudge(db, ra?.id ?? null, rb?.id ?? null, "a brawl at the fire on a hungry night")
    return NextResponse.json({ calmed: false, winner: f.winner.slug, loser: f.loser.slug,
      text: `${stepText ? stepText + " " : ""}They go at it with fists for ${f.rounds} round${f.rounds === 1 ? "" : "s"}. ${f.loser.name} goes down and stays down, and wakes at 1 HP. ${f.winner.name} is left at ${f.winnerHp}. Neither will forget it.` })
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 })
}
