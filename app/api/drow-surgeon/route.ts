import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { applyStageEvents, readStage, slugOf } from "@/lib/stage-roster"
import { skill } from "@/lib/walk-sheet"
import {
  SURGEON_TOOTH, SURGEON_VICTIMS, surgeonVictim, surgeonD, surgeonSpeaksElvish, surgeonVolley, surgeonHeal, surgeonOnDown, surgeonPersuade, surgeonBoon,
} from "@/lib/drow-surgeon.mjs"

// /api/drow-surgeon — The Drow Surgeon (Sam's homebrew, 2026-10-25; doc claude/The_Drow_Surgeon_2026-10-25.md).
//
// The painted map draws it; this is the record. Every die is rolled HERE, never in the browser, and every fact lands
// where the rest of the game reads it: the dead prisoner on the stage roster (dead, piercing) and at 0 on their rows,
// the shot prisoner's hit points and conditions on their characters row, the favour as a catalog row in someone's
// inventory, and a System line in the dialogue so Malachar knows what happened.
//
//   GET                         the encounter so far ({state}) and who at the table speaks Elvish ({elvish: ids})
//   POST {action:"begin"}       the first bolt: Malachar's d8 picks the prisoner it kills. Once per run.
//   POST {action:"volley"}      one round of bolts at the prisoner at the gate (one per guard on post)
//   POST {action:"stepped"}     they stepped away before they dropped: the shooting stops, no surgeon comes
//   POST {action:"tend"}        Liana pours the potion
//   POST {action:"persuade"}    the one try at talking her round; on a success the hidden d4 and the favour
//   POST {action:"leave"}       she goes without being asked
//   POST {action:"again"}       a LATER defiance at the gate (Sam, 2026-10-25: "Remove formal fight. Volleys only."): the
//                               guards shoot again — no execution, no surgeon — volleys until they step away or drop
//   POST {action:"labor"}       volleys at a hero who defied the escort twice on a work detail (Hard Labor): the surgeon's
//                               first time if she has not come, else a later defiance — no execution bolt either way
//   POST {action:"recover"}     a first drop that the surgeon does not come to: stable at 0, they regain 1 HP after 1d4
//                               hours (SRD 5.1, Combat: Stabilizing a Creature) — reported to Malachar, not advanced here
//
// A HERO SURVIVES THIS ONCE (Sam, 2026-10-30). `volley` answers with `next`: "surgeon" the first time they drop,
// "recover" if Liana has already been and gone this run, and "dead" the second time the same hero is dropped — the
// bolts finish them, the route writes the death, and the map's dieNow hands the table to GAME OVER. The count of who
// has been dropped before lives in the record (`downs`), so a reload cannot forget it. lib/drow-surgeon.mjs decides.
//
// LOLTH'S TOOTH (the dagger Liana can hand over; Sam's rulings 2026-10-25), its own record under "lolths-tooth":
//   POST {action:"tooth-dose"}     a dose of venom spent on a hit (3 in the hilt)
//   POST {action:"tooth-refill"}   a vial of drow poison from the wielder's pack fills it again (the vial is spent)
//   POST {action:"tooth-drawn"}    taken in hand: Ilvara feels it, unless the curse is lifted — a line for Malachar
//   POST {action:"tooth-uncurse"}  DM only: a Remove Curse has ended the beacon (the spider-sense stays)
//
// Who may call it: the DM, or any browser holding a seat's claim (claimId + claimToken) — the same gate as /api/walk-cast.
// The state lives in world_flags under "drow-surgeon", so a campaign restart clears it with every other flag.

export const dynamic = "force-dynamic"

const CAMPAIGN = "ashes-of-prometheus"
const FLAG = "drow-surgeon"
const TOOTH_FLAG = "lolths-tooth"
type Tooth = { doses: number; uncursed: boolean; drawn?: { by: string; area: string | null; at: string } | null }
async function readTooth(db: Db): Promise<Tooth> {
  const { data } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", TOOTH_FLAG).maybeSingle()
  const v = data?.value as Partial<Tooth> | null
  return { doses: typeof v?.doses === "number" ? v.doses : SURGEON_TOOTH.doses, uncursed: !!v?.uncursed, drawn: v?.drawn ?? null }
}
async function writeTooth(db: Db, t: Tooth, note: string) {
  await db.from("world_flags").upsert(
    { campaign_id: CAMPAIGN, key: TOOTH_FLAG, value: t, set_by: "map", note: `Lolth's Tooth: ${note}`.slice(0, 240) },
    { onConflict: "campaign_id,key" },
  )
}

type Stage = "shooting" | "stepped" | "down" | "tended" | "settled" | "killed"
type State = {
  stage: Stage
  again?: number                                   // 0/absent = the first time (the surgeon's scene); n = the n-th later defiance
  at: string
  victim: { id: string; name: string; roll: number } | null
  target: { id: string; name: string }
  volleys: number
  /** How many times each hero (characters.id) has been dropped by these bolts. Sam, 2026-10-30: the second is fatal. */
  downs?: Record<string, number>
  /** Who the bolts have killed outright, so a reload does not stand them back up. */
  killed?: { id: string; name: string; at: string } | null
  heal?: { amount: number; hp: number; hpMax: number } | null
  persuade?: { speaker: string; translator: string | null; rolls: number[]; total: number; dc: number; success: boolean } | null
  boon?: { d4: number; kind: string; slug?: string; shown?: string; to?: string } | null
}

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

type Db = ReturnType<typeof createAdminClient>

async function readState(db: Db): Promise<State | null> {
  const { data } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", FLAG).maybeSingle()
  const v = data?.value
  return v && typeof v === "object" && !Array.isArray(v) ? (v as State) : null
}
async function writeState(db: Db, s: State, note: string) {
  await db.from("world_flags").upsert(
    { campaign_id: CAMPAIGN, key: FLAG, value: s, set_by: "map", note: `The Drow Surgeon: ${note}`.slice(0, 240) },
    { onConflict: "campaign_id,key" },
  )
}
async function say(db: Db, text: string) {
  await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text })
}
const conditionsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])
const withCond = (list: string[], c: string) => (list.some((x) => x.toLowerCase() === c) ? list : [...list, c])
const withoutCond = (list: string[], c: string) => list.filter((x) => x.toLowerCase() !== c)

export async function GET() {
  try {
    const db = createAdminClient()
    const [state, players, tooth] = await Promise.all([
      readState(db),
      db.from("characters").select("id, languages").eq("is_player", true),
      readTooth(db),
    ])
    const elvish = (players.data ?? []).filter((p) => surgeonSpeaksElvish(p.languages)).map((p) => p.id)
    return NextResponse.json({ state, elvish, tooth: { doses: tooth.doses, uncursed: tooth.uncursed } })
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
    const claimId = typeof body.claimId === "string" ? body.claimId : ""
    const claimToken = typeof body.claimToken === "string" ? body.claimToken : ""
    const { data: secret } = claimId ? await db.from("character_secrets").select("claim_token").eq("character_id", claimId).maybeSingle() : { data: null }
    if (!secret || !claimToken || secret.claim_token !== claimToken) return NextResponse.json({ error: "Only a seated player or the DM can do that." }, { status: 403 })
  }

  // ---------- Lolth's Tooth ----------
  if (action.startsWith("tooth-")) {
    const tooth = await readTooth(db)
    const who = typeof body.characterId === "string" ? body.characterId : ""
    const { data: ch } = who ? await db.from("characters").select("id, name").eq("id", who).maybeSingle() : { data: null }
    if (action === "tooth-dose") {
      if (tooth.doses <= 0) return NextResponse.json({ ok: false, tooth }, { status: 409 })
      tooth.doses -= 1
      await writeTooth(db, tooth, `a dose spent (${tooth.doses} left)`)
      return NextResponse.json({ ok: true, tooth })
    }
    if (action === "tooth-refill") {
      if (!ch) return NextResponse.json({ error: "who is refilling it?" }, { status: 400 })
      if (tooth.doses >= SURGEON_TOOTH.doses) return NextResponse.json({ ok: true, tooth, full: true })
      // a vial of the catalog's drow poison from their own pack, never one confiscated into the stash
      const { data: vial } = await db.from("inventory_items").select("id, quantity, items!inner(slug)")
        .eq("character_id", ch.id).eq("items.slug", "drow-poison").is("confiscated_from", null).limit(1).maybeSingle()
      if (!vial) return NextResponse.json({ error: `${ch.name} has no drow poison to fill it with.` }, { status: 409 })
      const q = Number(vial.quantity) || 1
      const { error } = q > 1 ? await db.from("inventory_items").update({ quantity: q - 1 }).eq("id", vial.id) : await db.from("inventory_items").delete().eq("id", vial.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      tooth.doses = SURGEON_TOOTH.doses
      await writeTooth(db, tooth, `refilled by ${ch.name}`)
      await say(db, `${ch.name} fills the reservoir in the drow ritual dagger's hilt from a vial of drow poison (${SURGEON_TOOTH.doses} doses).`)
      return NextResponse.json({ ok: true, tooth })
    }
    if (action === "tooth-drawn") {
      const area = typeof body.area === "string" ? body.area.slice(0, 80) : null
      tooth.drawn = { by: ch?.name ?? "someone", area, at: new Date().toISOString() }
      await writeTooth(db, tooth, `drawn by ${tooth.drawn.by}`)
      if (!tooth.uncursed) await say(db, `CURSE — Lolth's Tooth has been drawn by ${tooth.drawn.by}${area ? ` in ${area}` : ""}. Ilvara Mizzrym, the priestess who consecrated it, feels it and knows roughly where it is. What she does about it is Malachar's call.`)
      return NextResponse.json({ ok: true, tooth, beacon: !tooth.uncursed })
    }
    if (action === "tooth-uncurse") {
      if (!isDm(req)) return NextResponse.json({ error: "DM only" }, { status: 403 })
      tooth.uncursed = true
      await writeTooth(db, tooth, "curse lifted")
      await say(db, `A Remove Curse has broken the beacon in Lolth's Tooth: Ilvara can no longer feel it drawn. It still glows near spiders.`)
      return NextResponse.json({ ok: true, tooth })
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 })
  }

  const state = await readState(db)

  // ---------- the first bolt ----------
  if (action === "begin") {
    if (state) return NextResponse.json({ error: "already happened", state }, { status: 409 })
    const targetId = typeof body.targetId === "string" ? body.targetId : ""
    const { data: target } = await db.from("characters").select("id, name").eq("id", targetId).maybeSingle()
    if (!target) return NextResponse.json({ error: "no such character at the gate" }, { status: 400 })
    // a prisoner the story already has dead or gone is not shot again: the next on the table is
    const stage = await readStage(db)
    const gone = SURGEON_VICTIMS.filter((v) => stage.gone[slugOf(v.name)]).map((v) => v.id)
    const roll = surgeonD(8)
    const v = surgeonVictim(roll, gone)
    const s: State = { stage: "shooting", at: new Date().toISOString(), victim: v ? { id: v.id, name: v.name, roll } : null, target: { id: target.id, name: target.name }, volleys: 0 }
    if (v) {
      await applyStageEvents(db, [{ kind: "leave", name: v.name, dead: true, cause: "piercing" }])
      await db.from("npc_encounters").update({ hp_current: 0, is_active: false }).eq("name", v.name)
      await db.from("characters").update({ hp_current: 0 }).eq("name", v.name).eq("is_player", false)
    }
    await writeState(db, s, v ? `${v.name} shot dead (d8 ${roll})` : "no prisoner left to shoot")
    await say(db, v
      ? `${target.name} would not step back from the pen gate. The guards on the bridge loosed one bolt into the pen to make the point: it took ${v.name} in the chest. ${v.name} is dead (Malachar's d8: ${roll}). The guards are still shooting.`
      : `${target.name} would not step back from the pen gate, and the guards on the bridge began to shoot.`)
    return NextResponse.json({ ok: true, state: s })
  }

  // ---------- volleys on a work detail (Hard Labor; Sam, 2026-10-26) ----------
  // "another disobedient request leads to volleys downing the player (surgeon then comes unless she has already came
  // once)". No warning bolt and no prisoner executed — that is the gate's scene. If she has never come, this starts the
  // record as a FIRST time (again absent), so after the drop `tend` brings her; if she has come, it is a later defiance
  // (again n), and after the drop `recover` applies. The walk hauls the downed hero back to the pen for either.
  if (action === "labor") {
    if (state && state.stage !== "stepped" && state.stage !== "settled" && state.stage !== "tended" && state.stage !== "killed") return NextResponse.json({ error: "the guards are already busy", state }, { status: 409 })
    const targetId = typeof body.targetId === "string" ? body.targetId : ""
    const { data: target } = await db.from("characters").select("id, name").eq("id", targetId).maybeSingle()
    if (!target) return NextResponse.json({ error: "no such character on the detail" }, { status: 400 })
    const first = !state || (!state.heal && !state.again && state.stage !== "tended" && state.stage !== "settled")
    const s: State = first
      ? { stage: "shooting", at: new Date().toISOString(), victim: state?.victim ?? null, target: { id: target.id, name: target.name }, volleys: 0 }
      : { ...state!, stage: "shooting", again: (state!.again ?? 0) + 1, target: { id: target.id, name: target.name }, volleys: 0 }
    await writeState(db, s, `${target.name} defies the escort on a work detail${first ? "" : ` (later defiance ${s.again})`}`)
    await say(db, `${target.name} defied the escort on a work detail a second time. No more warnings: the drow raises a hand crossbow and shoots until ${target.name} drops.${first ? " (The surgeon has not yet come this run.)" : ""}`)
    return NextResponse.json({ ok: true, state: s, surgeon: first })
  }

  if (!state) return NextResponse.json({ error: "nothing has happened at the gate yet" }, { status: 409 })

  // ---------- a later defiance: volleys only ----------
  if (action === "again") {
    // "killed" is a finished scene too: the guards are free again, and the next fool at the gate is a new target.
    if (state.stage !== "stepped" && state.stage !== "settled" && state.stage !== "killed") return NextResponse.json({ error: "the guards are already busy", state }, { status: 409 })
    const targetId = typeof body.targetId === "string" ? body.targetId : ""
    const { data: target } = await db.from("characters").select("id, name").eq("id", targetId).maybeSingle()
    if (!target) return NextResponse.json({ error: "no such character at the gate" }, { status: 400 })
    state.again = (state.again ?? 0) + 1
    state.stage = "shooting"; state.target = { id: target.id, name: target.name }; state.volleys = 0
    await writeState(db, state, `${target.name} defies the guards again (${state.again})`)
    await say(db, `${target.name} would not step back from the pen gate again. No warning bolt this time: the guards on the bridge simply shoot.`)
    return NextResponse.json({ ok: true, state })
  }

  // ---------- stable at 0 and nobody comes ----------
  if (action === "recover") {
    // Nobody comes: a first drop with the surgeon already gone. A hero on their SECOND drop is dead and does not get up
    // (the volley wrote that), so this can never raise them.
    if (state.stage !== "down") return NextResponse.json({ error: "nobody is lying there waiting", state }, { status: 409 })
    const hours = surgeonD(4)
    const { data: t } = await db.from("characters").select("id, name, hp_current, conditions").eq("id", state.target.id).maybeSingle()
    if (!t) return NextResponse.json({ error: "the prisoner's row is gone" }, { status: 500 })
    const hp = Math.max(1, Number(t.hp_current) || 0)
    await db.from("characters").update({ hp_current: hp, conditions: withoutCond(conditionsOf(t.conditions), "unconscious") }).eq("id", t.id)
    state.stage = "settled"
    await writeState(db, state, `${t.name} comes round after ${hours} h`)
    await say(db, `Nobody came for ${t.name}. Stable at 0 HP, they lay in the corner of the pen and came round ${hours} hour${hours > 1 ? "s" : ""} later with ${hp} HP (SRD: a stable creature regains 1 HP after 1d4 hours). Malachar: advance the clock by ${hours} hour${hours > 1 ? "s" : ""}.`)
    return NextResponse.json({ ok: true, hours, hp, state })
  }

  // ---------- a round of bolts at the prisoner ----------
  if (action === "volley") {
    if (state.stage !== "shooting") return NextResponse.json({ error: "the shooting has stopped", state }, { status: 409 })
    const guards = Math.min(4, Math.max(1, Number(body.guards) || 1))
    const { data: t } = await db.from("characters")
      .select("id, name, ac, hp_current, hp_max, con_modifier, proficiency_bonus, sheet_save_proficiencies, conditions")
      .eq("id", state.target.id).maybeSingle()
    if (!t) return NextResponse.json({ error: "the prisoner's row is gone" }, { status: 500 })
    const saves = Array.isArray(t.sheet_save_proficiencies) ? t.sheet_save_proficiencies.map(String) : []
    const conSave = (Number(t.con_modifier) || 0) + (saves.some((x) => /^con/i.test(x)) ? Number(t.proficiency_bonus) || 2 : 0)
    const hpMax = Number(t.hp_max) || 1
    const hp = Math.max(0, Number(t.hp_current ?? hpMax))
    const v = surgeonVolley({ ac: Number(t.ac) || 10, hp, conSave }, guards)
    let conds = conditionsOf(t.conditions)
    if (v.poisoned) conds = withCond(conds, "poisoned")
    if (v.down) conds = withCond(conds, "unconscious")
    state.volleys += 1

    // WHAT THE DROP MEANS (Sam, 2026-10-30). The rule is lib/drow-surgeon.mjs; this is only the bookkeeping.
    // `surgeonCame` is true once Liana has been in — she is seen once a run, so a later first-timer gets `recover`.
    const downs = state.downs ?? {}
    const next = v.down
      ? surgeonOnDown({ downsBefore: downs[t.id] ?? 0, surgeonCame: !!state.heal })
      : null
    const killed = next === "dead"

    if (v.down) downs[t.id] = (downs[t.id] ?? 0) + 1
    state.downs = downs
    if (killed) {
      // Dead, not down. No death saves to fail and no coming round: the second time, the bolts finish it, and the
      // map's dieNow puts them on the shared fallen list — which is what calls GAME OVER if they were the last one.
      conds = withCond(withoutCond(conds, "unconscious"), "dead")
      state.stage = "killed"
      state.killed = { id: t.id, name: t.name, at: new Date().toISOString() }
    } else if (v.down) {
      state.stage = "down"
    }
    await db.from("characters").update({ hp_current: killed ? 0 : v.hpAfter, conditions: conds }).eq("id", t.id)
    await writeState(db, state, `volley ${state.volleys} at ${t.name}: ${hp} → ${v.hpAfter}${killed ? ", KILLED (second drop)" : v.down ? ", down" : ""}`)

    const hits = v.bolts.filter((b) => b.hit)
    const tally = `The guards loose ${v.bolts.length === 1 ? "a bolt" : v.bolts.length + " bolts"} at ${t.name} (${hits.length ? `${hits.length} hit for ${hits.reduce((n, b) => n + b.dmg, 0)} piercing` : "all miss"}${v.poisoned ? "; the drow poison takes hold" : ""}).`
    await say(db, killed
      ? `${tally} ${t.name} has been shot down here once already, and the drow do not waste a second mercy: the bolts finish them. ${t.name} is DEAD. (Sam's ruling, 2026-10-30: the first time the surgeon comes; the second time they die.)`
      : `${tally} ${t.name} is at ${v.hpAfter}/${hpMax} HP${v.down ? (v.ko && v.hpAfter > 0 ? ", knocked out by the poison" : ", down and bleeding") + " — stable; the shooting stops" : ""}.`)
    return NextResponse.json({ ok: true, volley: v, hp: killed ? 0 : v.hpAfter, hpMax, killed, next, state })
  }

  // ---------- stepped away before they dropped ----------
  if (action === "stepped") {
    if (state.stage !== "shooting") return NextResponse.json({ ok: true, state })
    state.stage = "stepped"
    await writeState(db, state, `${state.target.name} stepped away from the gate`)
    await say(db, `${state.target.name} backs away from the pen gate. The guards lower their crossbows.`)
    return NextResponse.json({ ok: true, state })
  }

  // ---------- Liana's potion ----------
  if (action === "tend") {
    // She comes to a hero's FIRST drop, whether or not they had defied the guards before (Sam, 2026-10-30 — Gandalf
    // stepped back the first time and was then dropped five times with nobody ever coming for him). She is still seen
    // only once a run: `state.heal` set means she has been and gone.
    const firstDrop = (state.downs?.[state.target.id] ?? 0) <= 1
    if (state.stage !== "down" || !firstDrop || state.heal) return NextResponse.json({ error: "nobody is lying there for her", state }, { status: 409 })
    const { data: t } = await db.from("characters").select("id, name, hp_current, hp_max, conditions").eq("id", state.target.id).maybeSingle()
    if (!t) return NextResponse.json({ error: "the prisoner's row is gone" }, { status: 500 })
    const hpMax = Number(t.hp_max) || 1
    const h = surgeonHeal(Number(t.hp_current) || 0, hpMax)
    // tended is shaken awake (SRD drow poison: "another creature takes an action to shake it awake"); poisoned stays its hour
    await db.from("characters").update({ hp_current: h.hpAfter, conditions: withoutCond(conditionsOf(t.conditions), "unconscious") }).eq("id", t.id)
    state.stage = "tended"; state.heal = { amount: h.amount, hp: h.hpAfter, hpMax }
    await writeState(db, state, `Liana heals ${t.name} for ${h.amount}`)
    await say(db, `Liana, a drow surgeon, came into the pen and tended ${t.name}: she pulled the bolt and poured a Potion of Healing (from Ilvara's stores) into them — ${h.amount} HP, now ${h.hpAfter}/${hpMax}. She speaks only Elvish. She ordered the guards to throw ${state.victim ? state.victim.name + "'s body" : "the body"} over the bridge into the falls.`)
    return NextResponse.json({ ok: true, heal: h, state })
  }

  // ---------- talking her round ----------
  if (action === "persuade") {
    if (state.stage !== "tended") return NextResponse.json({ error: "she is not listening now", state }, { status: 409 })
    const speakerId = typeof body.speakerId === "string" ? body.speakerId : ""
    const translator = typeof body.translator === "string" && body.translator.trim() ? body.translator.trim().slice(0, 60) : null
    const { data: sp } = await db.from("characters")
      .select("id, name, languages, cha_modifier, proficiency_bonus, sheet_skill_proficiencies").eq("id", speakerId).maybeSingle()
    if (!sp) return NextResponse.json({ error: "no such speaker" }, { status: 400 })
    const own = surgeonSpeaksElvish(sp.languages)
    if (!own && !translator) return NextResponse.json({ error: `${sp.name} does not speak Elvish and has nobody to put it into Elvish.` }, { status: 400 })
    if (translator && state.victim && translator.toLowerCase().includes(state.victim.name.split(" ")[0].toLowerCase())) return NextResponse.json({ error: "the dead do not translate" }, { status: 400 })
    const bonus = skill(sp as Record<string, unknown>, "Persuasion", Number(sp.cha_modifier) || 0, Number(sp.proficiency_bonus) || 2)
    const r = surgeonPersuade(bonus, !own)
    state.persuade = { speaker: sp.name, translator: own ? null : translator, rolls: r.rolls, total: r.total, dc: r.dc, success: r.success }
    let granted: { name: string; to: string } | null = null
    if (r.success) {
      const d4 = surgeonD(4)
      const b = surgeonBoon(d4) as { kind: string; slug?: string; shown?: string; to?: string; desc?: string }
      state.boon = { d4, kind: b.kind, slug: b.slug, shown: b.shown, to: b.to }
      if (b.kind === "item" && b.slug) {
        const toId = b.to === "downed" ? state.target.id : sp.id
        const toName = b.to === "downed" ? state.target.name : sp.name
        const { data: it } = await db.from("items").select("id, item_type, icon_url, equippable_slot, weight, value").eq("slug", b.slug).maybeSingle()
        if (!it) return NextResponse.json({ error: `catalog row ${b.slug} is missing — nothing invented` }, { status: 500 })
        await db.from("inventory_items").insert({ character_id: toId, name: b.shown, quantity: 1, description: b.desc, item_type: it.item_type, icon_url: it.icon_url,
          item_id: it.id, equippable_slot: it.equippable_slot, weight: it.weight, value: it.value })
        granted = { name: b.shown!, to: toName }
      } else if (b.kind === "jorlan") {
        await db.from("npc_encounters").update({ disposition: "warm" }).eq("name", "Jorlan Duskryn")
      }
    }
    state.stage = "settled"
    await writeState(db, state, r.success ? `persuaded (d4 ${state.boon?.d4})` : "not persuaded")
    await say(db, r.success
      ? `${sp.name}${own ? "" : ` (through ${translator})`} talked Liana round (Persuasion ${r.total} vs DC ${r.dc}). ${
          granted ? `She gave ${granted.to} a ${granted.name}.` : "She will speak to Jorlan Duskryn, who resents Ilvara, about slaves who could embarrass her."} Then she left.`
      : `${sp.name}${own ? "" : ` (through ${translator})`} tried to talk Liana round (Persuasion ${r.total} vs DC ${r.dc}) and failed. She left, and will not be seen again.`)
    return NextResponse.json({ ok: true, persuade: r, boon: state.boon ?? null, granted, state })
  }

  // ---------- she goes ----------
  if (action === "leave") {
    if (state.stage !== "tended") return NextResponse.json({ ok: true, state })
    state.stage = "settled"
    await writeState(db, state, "Liana left unasked")
    await say(db, `Liana left the pen without another word, and will not be seen again.`)
    return NextResponse.json({ ok: true, state })
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 })
}
