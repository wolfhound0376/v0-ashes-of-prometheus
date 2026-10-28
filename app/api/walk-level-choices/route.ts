import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { METAMAGIC, choicesOwed, classSpells, planFor, settleChoices, subclassesFor, type CastingSheet, type Picks } from "@/lib/level-choices"

// /api/walk-level-choices — the choices a level leaves after the ceremony (lib/level-choices.ts).
//
//   GET  ?character_id=<uuid>   → {owed, plan, casting, scores, spells, metamagic, origins}
//          owed: true  — the row's current level still carries its "choices to make" marker (taken, not chosen)
//          owed: false — the plan is for the NEXT level, so the walk can show the choices before the level is taken
//   POST {characterId, level, picks, claimToken?} → settle them, once
//
// Once: the write only lands while the row is at `level` AND still carries that level's marker
// (`.contains(sheet_features, [{name}])`). A second click, another tab or the DM finds it settled and writes nothing.
// Who may: the DM screen (x-dm-key) or the browser holding THIS character's claim — the ceremony's two doors.

export const dynamic = "force-dynamic"

const COLUMNS = "id, name, class, level, sheet_spellcasting, sheet_features, str_score, dex_score, con_score, int_score, wis_score, cha_score, is_player, character_type"
type Row = { id: string; name: string; class: string | null; level: number; sheet_spellcasting: CastingSheet | null; sheet_features: unknown; is_player: boolean | null; character_type: string | null } & Record<string, unknown>

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}
const isPlayer = (r: Row) => r.is_player === true || r.character_type === "player"

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("character_id")?.trim() ?? ""
  if (!id) return NextResponse.json({ error: "character_id is required" }, { status: 400 })
  const db = createAdminClient()
  const { data, error } = await db.from("characters").select(COLUMNS).eq("id", id).maybeSingle()
  if (error) return NextResponse.json({ error: "could not read the sheet" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "no such character" }, { status: 404 })
  const row = data as unknown as Row
  if (!isPlayer(row)) return NextResponse.json({ error: "only player characters level" }, { status: 403 })
  const level = Math.max(1, Math.trunc(row.level || 1))
  const owed = choicesOwed(row.sheet_features, level)
  const plan = planFor(row.class, owed ? level : level + 1)
  const sc = row.sheet_spellcasting ?? {}
  return NextResponse.json({
    name: row.name, class: row.class, level, owed, plan,
    casting: { cantrips: sc.cantrips ?? [], prepared: sc.prepared ?? [], save_dc: sc.save_dc ?? null, attack_bonus: sc.attack_bonus ?? null, rules_source: sc.rules_source ?? null },
    scores: { STR: row.str_score, DEX: row.dex_score, CON: row.con_score, INT: row.int_score, WIS: row.wis_score, CHA: row.cha_score },
    spells: plan && plan.caster ? classSpells(plan.cls, plan.maxSpellLevel) : [],
    metamagic: plan && plan.metamagic ? METAMAGIC : [], origins: subclassesFor(plan),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const characterId = typeof body.characterId === "string" ? body.characterId.trim().slice(0, 64) : ""
  const level = Math.trunc(Number(body.level))
  const claimToken = typeof body.claimToken === "string" ? body.claimToken : ""
  if (!characterId || !Number.isFinite(level)) return NextResponse.json({ error: "characterId and level are required" }, { status: 400 })
  const db = createAdminClient()
  if (!isDm(req)) {
    if (!claimToken) return NextResponse.json({ error: "the DM, or this hero's own browser" }, { status: 403 })
    const { data: secret } = await db.from("character_secrets").select("claim_token").eq("character_id", characterId).maybeSingle()
    if (!secret?.claim_token || !safeEquals(String(secret.claim_token), claimToken)) return NextResponse.json({ error: "the DM, or this hero's own browser" }, { status: 403 })
  }
  const { data, error } = await db.from("characters").select(COLUMNS).eq("id", characterId).maybeSingle()
  if (error) return NextResponse.json({ error: "could not read the sheet" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "no such character" }, { status: 404 })
  const row = data as unknown as Row
  if (!isPlayer(row)) return NextResponse.json({ error: "only player characters level" }, { status: 403 })
  if (row.level !== level || !choicesOwed(row.sheet_features, level)) {
    return NextResponse.json({ ok: false, already: true, note: `${row.name}'s level ${level} choices are already settled, or that level is not on the sheet.` })
  }
  const plan = planFor(row.class, level)
  if (!plan) return NextResponse.json({ ok: false, error: "This level's choices are made on the dashboard sheet." }, { status: 409 })
  const picks: Picks = {
    metamagic: Array.isArray(body.picks?.metamagic) ? body.picks.metamagic : [],
    origin: typeof body.picks?.origin === "string" ? body.picks.origin : null,
    spells: Array.isArray(body.picks?.spells) ? body.picks.spells : [],
    cantrips: Array.isArray(body.picks?.cantrips) ? body.picks.cantrips : [],
    swapOut: typeof body.picks?.swapOut === "string" ? body.picks.swapOut : null,
    swapOutCantrip: typeof body.picks?.swapOutCantrip === "string" ? body.picks.swapOutCantrip : null,
  }
  const out = settleChoices(plan, row.sheet_spellcasting, row.sheet_features, picks)
  if (!out.ok) return NextResponse.json({ ok: false, error: out.error }, { status: 400 })
  const { data: written, error: werr } = await db.from("characters")
    .update({ ...(out.spellcasting ? { sheet_spellcasting: out.spellcasting } : {}), sheet_features: out.features, updated_at: new Date().toISOString() })
    .eq("id", characterId).eq("level", level)
    .contains("sheet_features", [{ name: `Level ${level} — choices to make` }])
    .select("id")
  if (werr) return NextResponse.json({ error: "the choices could not be written — tell the DM" }, { status: 500 })
  if (!written || written.length === 0) return NextResponse.json({ ok: false, already: true, note: "Already settled; nothing more was written." })
  return NextResponse.json({ ok: true, summary: out.summary, casting: out.spellcasting ? { cantrips: out.spellcasting.cantrips, prepared: out.spellcasting.prepared, sorcery_points: out.spellcasting.sorcery_points } : null })
}
