import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { faceRng, hitDieFor, levelForXp, levelUp, levelUpPatch, XP_TABLE, type LevelUpSheet } from "@/lib/camp"
import { trialGates, TRIAL_GATE_FROM_LEVEL } from "@/lib/level-trial"

// /api/walk-level-up — the Level Up ceremony behind the Emberforged inventory's gold button.
//
//   GET  ?character_id=<uuid>                                    → what taking the next level would do (a dry run)
//   POST {characterId, fromLevel, method, face?, claimToken?}    → take it, once
//
// Sam, 2026-10-27: "Let's permit level ups outside of camp, just not in combat" and "no gated level until we get
// past level 3 for now." So the walk's inventory takes the level wherever the party stands; the walk refuses
// mid-fight on its side (it runs the fights, this route cannot see them), and the class trial (lib/level-trial.ts)
// walls off level 4 and up until Sam sets its counts.
//
// The rules are lib/camp.ts levelUp() — the same function the camp action in /api/chat uses: hit points (the SRD's
// roll or fixed value, CON added, minimum 1 per level — PHB wording), proficiency, Hit Dice, a full caster's slots,
// and the choices the player still owes (ASI, subclass, spells) banked on the sheet by levelUpPatch(). This route
// invents none of it. hp_current rises by the same amount as hp_max: a wound carried into the level is still there.
//
// ONE LEVEL, ONCE. The write is `update … where id = ? and level = fromLevel`: a double click, a stale tab or a
// retry finds the level already advanced, writes nothing, and is told so. The next level (XP permitting) is a fresh
// request with the new fromLevel — never two in one call (levelUp() refuses that too).
//
// Who may take it: the DM screen (x-dm-key), or the browser holding the claim of THIS character — the same two
// doors /api/walk-xp uses. Nobody levels someone else's hero.

export const dynamic = "force-dynamic"

const SHEET_COLUMNS = "id, name, class, level, xp, hp_max, hp_current, con_score, hit_dice_remaining, sheet_hit_dice, sheet_spellcasting, sheet_features, is_player, character_type"

type SheetRow = LevelUpSheet & { hp_current: number | null; sheet_features: unknown; is_player: boolean | null; character_type: string | null }

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

const isPlayer = (r: SheetRow) => r.is_player === true || r.character_type === "player"

/** What the next level would bring, computed by the rules engine without writing anything. */
function preview(sheet: SheetRow) {
  const level = Math.max(1, Math.trunc(sheet.level || 1))
  const next = level + 1
  const xp = Math.max(0, Math.trunc(Number(sheet.xp) || 0))
  const need = XP_TABLE[next] ?? null
  const dry = levelUp(sheet, { method: "average" })
  const die = hitDieFor(sheet)
  const gated = trialGates(sheet.class, next)
  return {
    name: sheet.name,
    class: sheet.class,
    level,
    next,
    xp,
    need,
    earned: need != null && xp >= need,
    die,
    // the SRD's fixed alternative to the roll: half the die rounded up, plus one
    average: die ? Math.ceil(die / 2) + 1 : null,
    con: dry.hp ? dry.hp.con : null,
    gated,
    gateNote: gated ? `Level ${next} waits on the ${String(sheet.class ?? "").toLowerCase()}'s class trial (levels ${TRIAL_GATE_FROM_LEVEL} and up — Sam, 2026-10-27). The trial is not yet set, so this level cannot be taken from here yet.` : null,
    ok: dry.ok && !gated,
    refusal: dry.ok ? null : dry.note,
    write: dry.write
      ? { level: dry.write.level, proficiency_bonus: dry.write.proficiency_bonus, sheet_hit_dice: dry.write.sheet_hit_dice, slots: dry.write.sheet_spellcasting?.slots ?? null }
      : null,
    pendingChoices: dry.pendingChoices,
    flags: dry.flags,
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("character_id")?.trim() ?? ""
  if (!id) return NextResponse.json({ error: "character_id is required" }, { status: 400 })
  const db = createAdminClient()
  const { data, error } = await db.from("characters").select(SHEET_COLUMNS).eq("id", id).maybeSingle()
  if (error) return NextResponse.json({ error: "could not read the sheet" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "no such character" }, { status: 404 })
  const sheet = data as unknown as SheetRow
  if (!isPlayer(sheet)) return NextResponse.json({ error: "only player characters level" }, { status: 403 })
  return NextResponse.json({ preview: preview(sheet) })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const characterId = typeof body.characterId === "string" ? body.characterId.trim().slice(0, 64) : ""
  const claimToken = typeof body.claimToken === "string" ? body.claimToken : ""
  const method: "roll" | "average" = body.method === "roll" ? "roll" : "average"
  const fromLevel = Math.trunc(Number(body.fromLevel))
  const faceIn = Math.trunc(Number(body.face))
  if (!characterId || !Number.isFinite(fromLevel) || fromLevel < 1) {
    return NextResponse.json({ error: "characterId and fromLevel are required" }, { status: 400 })
  }

  const db = createAdminClient()

  // the two doors: the DM, or this character's own claim
  if (!isDm(req)) {
    if (!claimToken) return NextResponse.json({ error: "the DM, or this hero's own browser" }, { status: 403 })
    const { data: secret } = await db.from("character_secrets").select("claim_token").eq("character_id", characterId).maybeSingle()
    if (!secret?.claim_token || !safeEquals(String(secret.claim_token), claimToken)) {
      return NextResponse.json({ error: "the DM, or this hero's own browser" }, { status: 403 })
    }
  }

  const { data, error } = await db.from("characters").select(SHEET_COLUMNS).eq("id", characterId).maybeSingle()
  if (error) return NextResponse.json({ error: "could not read the sheet" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "no such character" }, { status: 404 })
  const sheet = data as unknown as SheetRow
  if (!isPlayer(sheet)) return NextResponse.json({ error: "only player characters level" }, { status: 403 })

  const level = Math.max(1, Math.trunc(sheet.level || 1))
  if (level !== fromLevel) {
    // the level moved under this request — a second click, another tab, the DM — nothing more is written
    return NextResponse.json({ ok: false, already: true, level, note: `${sheet.name} is already level ${level}; nothing more was written.` })
  }
  const next = level + 1
  if (trialGates(sheet.class, next)) {
    return NextResponse.json({ ok: false, gated: true, note: preview(sheet).gateNote }, { status: 403 })
  }

  // the Hit Die: the walk rolled it in front of the player and sends the face; a face outside the die is refused,
  // never clamped into a better one. "average" is the SRD's fixed value and needs no roll.
  const die = hitDieFor(sheet)
  if (!die) return NextResponse.json({ ok: false, note: `${sheet.name}: no Hit Die on the sheet.` }, { status: 409 })
  if (method === "roll" && !(faceIn >= 1 && faceIn <= die)) {
    return NextResponse.json({ error: `a rolled level needs the d${die}'s face (1–${die})` }, { status: 400 })
  }
  const out = levelUp(sheet, method === "roll" ? { method, rng: faceRng(faceIn, die) } : { method })
  if (!out.ok || !out.write || !out.hp) return NextResponse.json({ ok: false, note: out.note, flags: out.flags }, { status: 409 })
  const patch = levelUpPatch(out, { hp_current: sheet.hp_current, sheet_features: sheet.sheet_features })
  if (!patch) return NextResponse.json({ ok: false, note: out.note }, { status: 409 })

  // once: the write only lands while the row is still at fromLevel
  const { data: written, error: writeErr } = await db
    .from("characters")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", characterId)
    .eq("level", fromLevel)
    .select("id, level, hp_max, hp_current, proficiency_bonus, sheet_hit_dice, xp, xp_to_next")
  if (writeErr) return NextResponse.json({ error: "the level could not be written — tell the DM" }, { status: 500 })
  if (!written || written.length === 0) {
    return NextResponse.json({ ok: false, already: true, level: next, note: `${sheet.name} already took level ${next}; nothing more was written.` })
  }
  const row = written[0] as { level: number; hp_max: number; hp_current: number; proficiency_bonus: number; sheet_hit_dice: string; xp: number; xp_to_next: number | null }

  return NextResponse.json({
    ok: true,
    note: out.note,
    hp: out.hp,
    write: {
      level: row.level,
      hp_max: row.hp_max,
      hp_current: row.hp_current,
      proficiency_bonus: row.proficiency_bonus,
      sheet_hit_dice: row.sheet_hit_dice,
      xp: row.xp,
      xp_to_next: row.xp_to_next,
      slots: out.write.sheet_spellcasting?.slots ?? null,
    },
    pendingChoices: out.pendingChoices,
    flags: out.flags,
    // XP enough for another level already? The walk may offer it again, as a fresh request.
    moreToTake: levelForXp(row.xp) > row.level,
  })
}
