import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { shortRest, hitDieFor, type ShortRester, type ShortRestOutcome, type SongOfRest } from "@/lib/camp"
import { vitalityOf } from "@/lib/death-saves"
import { logTimeEvent } from "@/lib/time-tracking"

// /api/walk-rest — a short rest taken on the painted map, away from camp (Sam, 2026-10-24: "Short rests should be
// able to be taken even when not in camp but risk an encounter with locals").
//
//   POST {plate, area, spend: "max" | "none", risk: {chance, label}, claimToken?}
//
// The hour is rolled HERE, in this order:
//   1. The locals. `risk.chance` is the plate's own odds (story.json `rest`, a number 0–1 the map sends along with
//      the plate name; the route caps it at 1). A roll under it means the rest is BROKEN: no Hit Dice are spent,
//      half an hour has passed (SRD: a short rest is at least an hour; an interrupted one heals nothing), and the
//      map starts the fight with whoever the plate says comes. The route returns `interrupted: true` and writes
//      nothing to the sheets.
//   2. Otherwise the rest completes: every player character on the sheets spends Hit Dice the way the camp's own
//      short rest does (lib/camp.ts `shortRest`, the SRD's rule — roll the die, add CON, regain the total) —
//      "max" spends one die at a time until full or out, "none" spends nothing; a bard of 2nd or above sings
//      Song of Rest. hp_current, hit_dice_remaining and pact slots are written exactly as /api/chat's
//      [TIME:short_rest] writes them; a rest_events row is recorded; the clock moves an hour (time_log
//      `short_rest`, the trigger fills the minutes).
//
// Who may call it: the DM screen (x-dm-key) or a browser holding the claim of a seated player — the two doors
// /api/walk-xp uses. The dying and the dead do not rest (shortRest says so itself).
//
// Not done here: current hit points on the map itself — the walk's fights start every hero at full, so the healing
// lands on the SHEET (the dashboard, Malachar, the camp), which is where the game keeps it.

export const dynamic = "force-dynamic"

const INTERRUPTED_MINUTES = 30

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

async function clockSessionId(db: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const { data } = await db.from("sessions").select("id,status,started_at").order("started_at", { ascending: false })
  const rows = (data ?? []) as { id: string; status: string | null }[]
  return (rows.find((s) => s.status === "active") ?? rows[0])?.id ?? null
}

type Row = Record<string, unknown>

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const claimToken = typeof body.claimToken === "string" ? body.claimToken : ""
  const plate = typeof body.plate === "string" ? body.plate.slice(0, 40) : ""
  const area = typeof body.area === "string" ? body.area.slice(0, 80) : ""
  const spend: "max" | "none" = body.spend === "none" ? "none" : "max"
  const chance = Math.max(0, Math.min(1, Number(body?.risk?.chance) || 0))
  const riskLabel = typeof body?.risk?.label === "string" ? body.risk.label.slice(0, 120) : "The locals find you."

  const db = createAdminClient()

  const { data: partyRaw, error: readErr } = await db
    .from("characters")
    .select("id,name,class,level,hp_current,hp_max,hit_dice_remaining,sheet_hit_dice,sheet_spellcasting,conditions,death_saves,con_score")
    .eq("is_player", true).is("archived_at", null)
  if (readErr) return NextResponse.json({ error: "could not read the party" }, { status: 500 })
  const rows = (partyRaw ?? []) as Row[]
  if (!rows.length) return NextResponse.json({ error: "nobody is seated" }, { status: 400 })

  // who may rest the party: the DM, or the claimed browser of a seated player
  if (!isDm(req)) {
    if (!claimToken) return NextResponse.json({ error: "DM or a seated player only" }, { status: 403 })
    const { data: secrets } = await db.from("character_secrets").select("character_id, claim_token").in("character_id", rows.map((r) => String(r.id)))
    const ok = (secrets ?? []).some((s) => s.claim_token && safeEquals(String(s.claim_token), claimToken))
    if (!ok) return NextResponse.json({ error: "DM or a seated player only" }, { status: 403 })
  }

  const sessionId = await clockSessionId(db)
  const rng = () => Math.random()

  // 1. the locals
  const d = rng()
  if (chance > 0 && d < chance) {
    await logTimeEvent(db, sessionId, { eventType: "cinematic_cut", minutesAdvanced: INTERRUPTED_MINUTES })
    await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text: `*The party tries to rest in ${area || plate || "the outpost"}; after half an hour they are found. ${riskLabel}*` }).then(() => {}, () => {})
    return NextResponse.json({ ok: true, interrupted: true, minutes: INTERRUPTED_MINUTES, roll: Number(d.toFixed(3)), chance, label: riskLabel })
  }

  // 2. the rest completes
  const song: SongOfRest | null = (() => {
    const bard = rows.find((r) => /bard/i.test(String(r.class ?? "")) && vitalityOf(r.hp_current as number | null, Array.isArray(r.conditions) ? (r.conditions as unknown[]).map(String) : []) === "up")
    return bard ? { bardId: String(bard.id), bardName: String(bard.name), bardLevel: Number(bard.level ?? 1) } : null
  })()

  const notes: string[] = []
  const flags = new Set<string>()
  const results: { id: string; name: string; hp: number; hpMax: number; healed: number; dice: number[]; hitDiceLeft: number | null; note: string }[] = []
  let bardSpentDie = false
  let bardCharacterId: string | null = null

  for (const p of rows) {
    const conditions = Array.isArray(p.conditions) ? (p.conditions as unknown[]).map(String) : []
    const rester: ShortRester = {
      id: String(p.id), name: String(p.name), level: p.level as number | null, class: p.class as string | null,
      sheet_hit_dice: p.sheet_hit_dice as string | null, hp: p.hp_current as number | null, hpMax: p.hp_max as number | null,
      hitDiceRemaining: p.hit_dice_remaining as number | null, con_score: p.con_score as number | null,
      spend: spend === "max" ? 1 : 0, spellcasting: (p.sheet_spellcasting ?? null) as ShortRester["spellcasting"],
      vitality: vitalityOf(p.hp_current as number | null, conditions),
    }
    const first = shortRest([rester], rng, song)
    if (first.restEvent.bard_spent_die) bardSpentDie = true
    bardCharacterId = first.restEvent.bard_character_id
    let out: ShortRestOutcome = first.characters[0]
    // "max": one die at a time, stop at full or when the dice run out (the same loop /api/chat runs)
    if (spend === "max" && out.rested && out.dice.length > 0) {
      const dice = [...out.dice]
      let cur = out
      while (cur.hp < (rester.hpMax ?? 0) && (cur.hitDiceRemaining ?? 0) > 0) {
        const again = shortRest([{ ...rester, hp: cur.hp, hitDiceRemaining: cur.hitDiceRemaining, spend: 1 }], rng, null).characters[0]
        if (again.dice.length === 0) break
        dice.push(...again.dice)
        cur = again
      }
      const healed = cur.hp - Math.max(0, rester.hp ?? 0)
      const parts = [`spends ${dice.length} Hit Di${dice.length === 1 ? "e" : "ce"} (d${hitDieFor(rester)}: ${dice.map((x) => x.face).join(", ")})`]
      if (out.songOfRest) parts.push(`Song of Rest (${out.songOfRest.face})`)
      if (out.pactSlotsRestored) parts.push(`${out.pactSlotsRestored} pact slot${out.pactSlotsRestored === 1 ? "" : "s"} back`)
      out = { ...out, hp: cur.hp, hitDiceRemaining: cur.hitDiceRemaining, dice, healed, note: `${rester.name} ${parts.join(", ")} — regains ${healed} hp (${cur.hp}/${rester.hpMax ?? 0}).` }
    }
    notes.push(out.note)
    out.flags.forEach((f) => flags.add(f))
    results.push({ id: out.id, name: out.name, hp: out.hp, hpMax: Number(p.hp_max ?? 0), healed: out.healed, dice: out.dice.map((x) => x.face), hitDiceLeft: out.hitDiceRemaining, note: out.note })
    if (!out.rested) continue

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    let touched = false
    const hpBefore = Math.max(0, (p.hp_current as number | null) ?? 0)
    if (out.hp !== hpBefore) { patch.hp_current = out.hp; touched = true }
    if (out.hitDiceRemaining != null && out.hitDiceRemaining !== p.hit_dice_remaining) { patch.hit_dice_remaining = out.hitDiceRemaining; touched = true }
    if (out.slots) {
      const sc = (p.sheet_spellcasting ?? null) as Record<string, unknown> | null
      patch.sheet_spellcasting = sc ? { ...sc, slots: out.slots } : { slots: out.slots }   // the whole object back, only `used` zeroed
      touched = true
    }
    if (touched) {
      const { error } = await db.from("characters").update(patch).eq("id", p.id)
      if (error) console.error(`[walk-rest] ${String(p.name)}:`, error.message)
    }
  }

  // the record of the hour, the way /api/chat records a short rest away from camp (nobody eats)
  const { data: sup } = await db.from("party_supplies").select("supplies").limit(1).maybeSingle()
  const supplies = Number((sup as { supplies?: unknown } | null)?.supplies ?? 0) || 0
  const { error: restErr } = await db.from("rest_events").insert({
    session_id: sessionId, rest_type: "short", fed: false,
    supplies_before: supplies, supplies_cost: 0, supplies_after: supplies, party_size: rows.length,
    bard_character_id: bardCharacterId, bard_spent_die: bardSpentDie,
    detail: { notes, flags: [...flags, "Rested on the painted map, not at camp (walk-rest)."], spend, plate, area, risk: { chance, roll: Number(d.toFixed(3)) } },
  })
  if (restErr) console.error("[walk-rest] rest_events:", restErr.message)
  await logTimeEvent(db, sessionId, { eventType: "short_rest" })
  await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text: `*The party takes a short rest in ${area || plate || "the outpost"}. ${notes.join(" ")}*` }).then(() => {}, () => {})

  return NextResponse.json({ ok: true, interrupted: false, minutes: 60, roll: Number(d.toFixed(3)), chance, characters: results, flags: [...flags] })
}
