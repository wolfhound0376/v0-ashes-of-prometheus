// Rune marks — the knowledge of one school's rune.
//
//   GET  ?characterId=…                          → the marks this character knows
//   POST {characterId, school, learnedVia}       → DM ONLY: record a mark learned
//
// A mark is found or taught IN THE WORLD (claude/claude_Alchemy_Rune_Marks.md:
// the ward under Lolth's shrine, the post in the slave pen, Shuushar, the
// myconids, Buppido…). Nothing a player clicks can grant one. The DM records it
// when the table earns it — same gate as /api/alchemy/bench and /api/combat:
// x-dm-key must equal DM_ACCESS_CODE, and an open table with no code set stays
// open.
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isRuneSchool } from "@/lib/alchemy-runes"

export const dynamic = "force-dynamic"

function authorized(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return true
  return safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

export async function GET(req: NextRequest) {
  const characterId = req.nextUrl.searchParams.get("characterId")
  if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 })
  const db = createAdminClient()
  const { data, error } = await db
    .from("character_known_runes").select("school, learned_via, learned_at").eq("character_id", characterId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ characterId, marks: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "marks are earned in the world; DM only" }, { status: 403 })
  let body: { characterId?: string; school?: string; learnedVia?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 })
  }
  const { characterId, school } = body
  const via = body.learnedVia ?? "dm"
  if (!characterId || !isRuneSchool(school)) {
    return NextResponse.json({ error: "characterId and one of the eight schools required" }, { status: 400 })
  }
  if (!["found", "taught", "dm"].includes(via)) {
    return NextResponse.json({ error: "learnedVia must be found, taught or dm" }, { status: 400 })
  }
  const db = createAdminClient()
  const { data: character } = await db.from("characters").select("id, name").eq("id", characterId).maybeSingle()
  if (!character) return NextResponse.json({ error: "no such character" }, { status: 404 })
  const { error } = await db
    .from("character_known_runes")
    .upsert({ character_id: characterId, school, learned_via: via }, { onConflict: "character_id,school", ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, character: character.name, school, learnedVia: via })
}
