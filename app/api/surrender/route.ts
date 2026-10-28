import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { applyStageEvents, readStage, slugOf } from "@/lib/stage-roster"
import { endCombatFlag, COMBAT_FLAG } from "@/lib/combat-flag"
import { mergeSituation, startingSituation, type Situation } from "@/lib/situation"
import { activeRun, readPartySituation, SITUATION_TABLE } from "@/lib/situation-store"
import { SURRENDER_PRISONERS, surrenderVictim, surrenderBeating, surrenderSummary } from "@/lib/surrender.mjs"

// /api/surrender — the party gives up to the drow (Sam, 2026-10-28: "Surrendering takes you back to the pen after
// suffering some damage and throwing one of the NPCs into the chasm as a warning."). Rules: lib/surrender.mjs.
//
// The painted map plays it; this is the record. Every die is rolled HERE, never in the browser, and every fact lands
// where the rest of the game reads it:
//   - the beating on each hero's `characters` row (hp_current; never below 1)
//   - the party's situation back to CAPTIVE in the pen (party_situation, event `recaptured` — lib/situation.ts), and the
//     gate locked on the stage roster, so Malachar and every NPC treat them as prisoners again
//   - a fight on the shared combat flag ends — a surrender is how a fight with the drow stops
//   - the prisoner thrown into the chasm: dead on the stage roster (bludgeoning), 0 HP and inactive on their rows —
//     written at `thrown`, the moment the map throws them, NOT at `begin`: the map's stage poll walks a dead cast
//     member off where they stand, which would drop the victim on the floor of the guard tower before the march
//   - a System line in the dialogue so Malachar knows what happened and plays it
//
//   GET                       the record so far ({record: {count, victims, pending, last}}) — the pool shows the bodies
//   POST {action:"begin", area, areaName, heroes:[characterId], company:[spriteId], by?}
//                             the surrender: picks the victim, rolls the beating, writes the situation and the flag.
//                             Returns {seq, victim, beaten:[{id,name,rolls,dmg,hp,hpMax,skipped}], record}
//   POST {action:"thrown", seq}
//                             the map has thrown the chosen prisoner: dead on the roster and the rows, the line for
//                             Malachar. Any screen that plays the throw may call it; a second call for the same
//                             surrender changes nothing.
//
// Who may call it: the DM, or any browser holding a seat's claim (claimId + claimToken) — the same gate as
// /api/walk-spotted. The record lives in world_flags under "surrender", so a campaign restart clears it.

export const dynamic = "force-dynamic"

const CAMPAIGN = "ashes-of-prometheus"
const FLAG = "surrender"
const MAX_HEROES = 12

type Victim = { id: string; name: string; at: string; area: string | null }
type Beaten = { id: string; name: string; rolls: number[]; dmg: number; hp: number; hpMax: number; skipped: boolean }
type Last = { seq: number; at: string; area: string | null; areaName: string; by: string | null; victim: Victim | null; beaten: Beaten[] }
type Record_ = {
  count: number
  victims: Victim[]        // thrown and dead
  pending: Victim | null   // chosen at `begin`, not yet thrown
  last: Last | null
}

type Db = ReturnType<typeof createAdminClient>

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n)

async function readRecord(db: Db): Promise<Record_> {
  const { data } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", FLAG).maybeSingle()
  const v = (data?.value ?? {}) as Partial<Record_>
  return { count: typeof v.count === "number" ? v.count : 0, victims: Array.isArray(v.victims) ? v.victims : [], pending: v.pending ?? null, last: v.last ?? null }
}
async function writeRecord(db: Db, r: Record_, note: string) {
  await db.from("world_flags").upsert(
    { campaign_id: CAMPAIGN, key: FLAG, value: r, set_by: "map", note: `Surrender: ${note}`.slice(0, 240) },
    { onConflict: "campaign_id,key" },
  )
}
async function say(db: Db, text: string) {
  await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text })
}

export async function GET() {
  try {
    const db = createAdminClient()
    return NextResponse.json({ record: await readRecord(db) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = typeof body.action === "string" ? body.action : ""
  const db = createAdminClient()

  // the gate: the DM, or a browser that sat down as one of the party
  if (!isDm(req)) {
    const claimId = clip(body.claimId, 64), claimToken = typeof body.claimToken === "string" ? body.claimToken : ""
    const { data: secret } = claimId ? await db.from("character_secrets").select("claim_token").eq("character_id", claimId).maybeSingle() : { data: null }
    if (!secret?.claim_token || !claimToken || !safeEquals(String(secret.claim_token), claimToken)) {
      return NextResponse.json({ error: "Only a seated player or the DM can do that." }, { status: 403 })
    }
  }

  try {
    const record = await readRecord(db)
    const now = new Date().toISOString()

    // ---------- the surrender ----------
    if (action === "begin") {
      const area = clip(body.area, 40) || null
      const areaName = clip(body.areaName, 80) || "Velkynvelve"
      const by = clip(body.by, 60) || null
      const heroIds = (Array.isArray(body.heroes) ? body.heroes : []).map((h: unknown) => clip(h, 64)).filter(Boolean).slice(0, MAX_HEROES)
      const known = new Set(SURRENDER_PRISONERS.map((p) => p.id))
      const company = (Array.isArray(body.company) ? body.company : []).map((c: unknown) => clip(c, 40)).filter((c: string) => known.has(c))

      // the one who will go over the rail: never one the story already has dead or gone
      const stage = await readStage(db)
      const gone = SURRENDER_PRISONERS.filter((p) => stage.gone[slugOf(p.name)] || record.victims.some((v) => v.id === p.id)).map((p) => p.id)
      const picked = surrenderVictim(company, gone)
      const victim: Victim | null = picked ? { id: picked.id, name: picked.name, at: now, area } : null

      // the beating
      const beaten: Beaten[] = []
      if (heroIds.length) {
        const { data: rows } = await db.from("characters").select("id, name, hp_current, hp_max").in("id", heroIds).eq("is_player", true)
        for (const t of rows ?? []) {
          const hpMax = Number(t.hp_max) || 1
          const b = surrenderBeating(Number(t.hp_current ?? hpMax))
          if (!b.skipped && b.dmg > 0) await db.from("characters").update({ hp_current: b.hpAfter }).eq("id", t.id)
          beaten.push({ id: t.id, name: t.name, rolls: b.rolls, dmg: b.dmg, hp: b.hpAfter, hpMax, skipped: b.skipped })
        }
      }

      // back in the pen: captive, gate locked, ward up
      await applyStageEvents(db, [{ kind: "gate", state: "locked" }])
      const runId = await activeRun(db)
      let situation: Situation | null = null
      if (runId) {
        const prev = (await readPartySituation(db, runId)) ?? startingSituation(runId)
        situation = mergeSituation(prev, { event: "recaptured", sub_location: "node-11-slave-pen", sub_label: "Slave Pen", party_present: beaten.map((b) => b.name) }, "walk", now)
        const { error } = await db.from(SITUATION_TABLE).upsert(situation, { onConflict: "campaign_run_id" })
        if (error) console.warn("[surrender] situation not written:", error.message)
      }

      // a fight with the drow ends here
      const { data: fight } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", COMBAT_FLAG).maybeSingle()
      if (fight?.value && (fight.value as { status?: string }).status === "active") await endCombatFlag(db)

      record.count += 1
      record.pending = victim
      record.last = { seq: record.count, at: now, area, areaName, by, victim, beaten }
      await writeRecord(db, record, `#${record.count} in ${areaName}${victim ? `, ${victim.name} chosen` : ""}`)
      const hits = beaten.filter((b) => !b.skipped && b.dmg > 0).map((b) => `${b.name} ${b.dmg}`)
      await say(db, `The party surrendered to the guards in ${areaName}.${hits.length ? ` The drow beat them with crossbow stocks and boots (${hits.join(", ")} bludgeoning).` : ""} They are being marched back to the slave pen; the gate will be locked behind them and the ward covers them again — CAPTIVE. Malachar: do not resolve the march yet; the map plays it.`)
      return NextResponse.json({ ok: true, seq: record.count, victim: picked, beaten, situation, record })
    }

    // ---------- the throw ----------
    if (action === "thrown") {
      const seq = Number(body.seq) || record.count
      if (!record.last || seq !== record.count) return NextResponse.json({ ok: true, stale: true, record })
      const victim = record.pending
      if (!victim) return NextResponse.json({ ok: true, already: true, record })       // thrown by another screen already, or nobody was chosen
      await applyStageEvents(db, [{ kind: "leave", name: victim.name, dead: true, cause: "bludgeoning" }])
      await db.from("npc_encounters").update({ hp_current: 0, is_active: false }).eq("name", victim.name)
      await db.from("characters").update({ hp_current: 0 }).eq("name", victim.name).eq("is_player", false)
      record.victims.push({ ...victim, at: now })
      record.pending = null
      await writeRecord(db, record, `${victim.name} thrown into the chasm (#${record.count})`)
      await say(db, surrenderSummary(record.last.areaName, victim, record.last.beaten))
      return NextResponse.json({ ok: true, victim, record })
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
