import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { readSeated } from "@/lib/seats"
import { describeSituation, parseSituationInput, situationRow, type PartySituationRow } from "@/lib/situation"
import { activeRun, SITUATION_TABLE as TABLE } from "@/lib/situation-store"

// /api/party/situation — what the party is in the middle of, as the painted walk sees it (lib/situation.ts).
//
//   GET                → { situation, summary } for the live run (anyone may ask; the players see the room)
//   POST {…situation, characterId}
//                      → the walk's account, upserted onto the live run's row. Accepted from a browser
//                        that walks as a SEATED character (lib/seats.ts) or holds the DM key, so a stray
//                        tab cannot move the party.
//
// One row per campaign run (public.party_situation). Until the migration is pasted in the table does
// not exist; a POST then answers 200 with {ok:false, pending:"migration"} rather than an error, because
// the walk fires these and forgets them and must never trip over the game not being ready for it.

export const dynamic = "force-dynamic"

function hasDmKey(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return true
  return safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

/** The table is missing until Sam pastes the migration: PostgREST says PGRST205 / Postgres 42P01. */
const tableMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /party_situation.*(does not exist|schema cache)/i.test(e.message ?? ""))

export async function GET(req: NextRequest) {
  try {
    const db = createAdminClient()
    const asked = req.nextUrl.searchParams.get("run") ?? ""
    const run = /^[0-9a-f-]{36}$/i.test(asked) ? asked : await activeRun(db)
    if (!run) return NextResponse.json({ situation: null, summary: null })
    const { data, error } = await db.from(TABLE).select("*").eq("campaign_run_id", run).maybeSingle()
    if (error) return NextResponse.json({ situation: null, summary: null, ...(tableMissing(error) ? { pending: "migration" } : { error: error.message }) })
    const row = (data ?? null) as PartySituationRow | null
    return NextResponse.json({ situation: row, summary: describeSituation(row) })
  } catch (e) {
    return NextResponse.json({ situation: null, summary: null, error: String(e) })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = parseSituationInput(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const db = createAdminClient()
  // Who is writing: a seated character's browser (the walk sends the leader's id) or the DM.
  const characterId = typeof body?.characterId === "string" ? body.characterId : ""
  const seated = characterId ? (await readSeated(db)).some((s) => s.id === characterId) : false
  if (!seated && !hasDmKey(req)) return NextResponse.json({ error: "not a seated character or the DM" }, { status: 403 })

  const run = await activeRun(db)
  if (!run) return NextResponse.json({ error: "no campaign run" }, { status: 409 })

  const row = situationRow(parsed.value, run)
  const { error } = await db.from(TABLE).upsert(row, { onConflict: "campaign_run_id" })
  if (error) {
    if (tableMissing(error)) {
      console.warn("[situation] party_situation is not in the database yet — paste migrations/20261024000000_party_situation.sql")
      return NextResponse.json({ ok: false, pending: "migration" })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, run, summary: describeSituation(row) })
}
