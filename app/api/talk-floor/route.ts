import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isDmRequest } from "@/lib/dm-session"
import { addSuggestion, cleanSuggestion, floorFor, floorKey, floorLive, sameHero, FLOOR_STALE_MS, type FloorRow } from "@/lib/talk-floor"

// /api/talk-floor — ONE SPEAKER PER CONVERSATION (lib/talk-floor.ts, table talk_floor).
//
//   GET                              every conversation going on right now: [{npc, npc_name, speaker, suggestions}]
//   POST {op:"claim", npc}           take the floor with this NPC, or keep it (this is also the heartbeat). Answers
//                                    {mine, floor}: mine=false means someone else is speaking and you listen in.
//   POST {op:"release", npc}         give it up (leaving the talk). The DM may clear anyone's.
//   POST {op:"suggest", npc, text}   a listener's suggestion to whoever holds the floor.
//
// Who is asking: the hero this browser plays (characterId, checked against its claimToken when it has one — the
// same trust /api/chat gives), or the DM. Never fails loudly: a floor that cannot be read is a floor that is free,
// because a broken lock must not silence the table.

export const dynamic = "force-dynamic"

type Db = ReturnType<typeof createAdminClient>

async function heroOf(db: Db, body: Record<string, unknown>): Promise<{ id: string; name: string } | null> {
  const id = typeof body.characterId === "string" ? body.characterId : ""
  if (!id) return null
  const token = typeof body.claimToken === "string" ? body.claimToken : ""
  if (token) {
    const { data } = await db.from("character_secrets").select("claim_token").eq("character_id", id).maybeSingle()
    if (!data || data.claim_token !== token) return null
  }
  const { data } = await db.from("characters").select("id, name").eq("id", id).is("archived_at", null).maybeSingle()
  return data ? { id: data.id as string, name: data.name as string } : null
}

const shown = (r: FloorRow) => ({ npc: r.npc, npc_name: r.npc_name, speaker: r.speaker, started_at: r.started_at, suggestions: r.suggestions ?? [] })

async function liveRows(db: Db): Promise<FloorRow[]> {
  const since = new Date(Date.now() - FLOOR_STALE_MS).toISOString()
  const { data } = await db.from("talk_floor").select("*").gte("beat_at", since)
  return ((data ?? []) as FloorRow[]).filter((r) => floorLive(r, Date.now()))
}

export async function GET() {
  try {
    return NextResponse.json({ floors: (await liveRows(createAdminClient())).map(shown) })
  } catch (e) {
    return NextResponse.json({ floors: [], error: String(e) })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const op = String(body.op ?? "")
    const npcName = String(body.npc ?? "").trim().slice(0, 60)
    if (!npcName) return NextResponse.json({ error: "npc" }, { status: 400 })
    const db = createAdminClient()
    const dm = isDmRequest(req, normalizeCode, safeEquals)
    const hero = await heroOf(db, body)
    const rows = await liveRows(db)
    const held = floorFor(rows, npcName, Date.now())

    if (op === "release") {
      if (held && (dm || (hero && sameHero(held.speaker, hero.name)))) await db.from("talk_floor").delete().eq("npc", held.npc)
      return NextResponse.json({ ok: true })
    }
    if (!hero) return NextResponse.json({ mine: dm, floor: held ? shown(held) : null })   // the DM watches and is never refused; an unseated screen holds nothing

    if (op === "suggest") {
      const text = cleanSuggestion(body.text)
      if (!held || !text || sameHero(held.speaker, hero.name)) return NextResponse.json({ ok: false, floor: held ? shown(held) : null })
      const suggestions = addSuggestion(held.suggestions, { from: hero.name, text, at: new Date().toISOString() })
      await db.from("talk_floor").update({ suggestions }).eq("npc", held.npc).eq("speaker", held.speaker)
      return NextResponse.json({ ok: true, floor: shown({ ...held, suggestions }) })
    }

    if (op === "claim") {
      if (held && !sameHero(held.speaker, hero.name)) return NextResponse.json({ mine: false, floor: shown(held) })
      // The key of the row already there ("jorlan duskryn" when this screen said "Jorlan"), else this name's own.
      const { data, error } = await db.rpc("talk_floor_claim", {
        p_npc: held?.npc ?? floorKey(npcName), p_npc_name: held?.npc_name ?? npcName, p_speaker: hero.name, p_speaker_id: hero.id, p_stale_secs: Math.round(FLOOR_STALE_MS / 1000),
      })
      const row = (Array.isArray(data) ? data[0] : data) as FloorRow | null
      if (error || !row) return NextResponse.json({ mine: true, floor: null, error: error?.message ?? "no row" })   // fail open
      return NextResponse.json({ mine: sameHero(row.speaker, hero.name), floor: shown(row) })
    }
    return NextResponse.json({ error: "op" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ mine: true, floor: null, error: String(e) })   // fail open: never silence the table
  }
}
