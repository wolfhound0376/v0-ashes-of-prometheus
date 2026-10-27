import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isRollLine, stripRollTalk } from "@/lib/speech-notation"

// /api/map-dialogue — the story conversation, for the walk (public/velkynvelve-walk).
//
// Sam, 2026-10-14: "why can I not hear Jorlan speak or see him". The walk drew the cast where the
// game put them but never heard the conversation: everything said through Malachar lived only on the
// dashboard. The walk polls this and plays each new line on the plate — an NPC in a speech bubble and
// their own voice, a player in a bubble, Malachar in the narration strip.
//
//   GET                 → { cursor } only: where "now" is, so the walk does not replay old history
//   GET ?after=<iso>    → { cursor, lines } — the table's lines at or after that moment, oldest first
//
// Read-only and the same lines every seat already sees on the dashboard's log.
//
// Player-to-player messages (channel 'direct', Sam 2026-10-26: "This should display with everyone. No voice
// heard.") ride along too, carrying `channel` and `recipient`: the walk draws them over the sender's sprite for
// the whole table and says them in the sender's own voice.
//
// Rolls are never speech (Sam, 2026-10-26): a roll announcement ("🎲 …") or a roll report to Malachar
// ("[Dice Roll] …") never reaches the walk, and a check call or roll figure inside a spoken line ("Roll for
// Stealth.", "(Insight)", "DC 12") is cut out of the bubble before it gets there. A line left with nothing is dropped.

export const dynamic = "force-dynamic"

const SPOKEN = ["npc", "dm", "player"]
const HEARD = ["dm", "direct"]

export async function GET(req: NextRequest) {
  try {
    const db = createAdminClient()
    const after = req.nextUrl.searchParams.get("after")
    if (!after || Number.isNaN(Date.parse(after))) {
      const { data } = await db.from("dialogue").select("created_at").in("channel", HEARD)
        .order("created_at", { ascending: false }).limit(1).maybeSingle()
      return NextResponse.json({ cursor: data?.created_at ?? new Date().toISOString(), lines: [] })
    }
    const { data, error } = await db.from("dialogue")
      .select("id, speaker, speaker_type, text, speech_segments, created_at, sort_order, channel, recipient")  // speech_segments[].lang: the tongue (lib/languages)
      .in("channel", HEARD).in("speaker_type", SPOKEN).gte("created_at", after)
      .order("created_at", { ascending: true }).order("sort_order", { ascending: true }).limit(40)
    if (error) return NextResponse.json({ cursor: after, lines: [], error: error.message })
    const lines = (data ?? []).flatMap((r) => {
      if (typeof r.text !== "string" || isRollLine(r.text)) return []
      const text = stripRollTalk(r.text)
      if (!text) return []
      // Tongue segments carry their own words (lib/languages): cut the mechanics there too.
      const segs = Array.isArray(r.speech_segments)
        ? (r.speech_segments as Array<Record<string, unknown>>).map((sg) => ({
            ...sg,
            ...(typeof sg.line === "string" ? { line: stripRollTalk(sg.line) } : {}),
            ...(typeof sg.text === "string" ? { text: stripRollTalk(sg.text) } : {}),
          })).filter((sg) => (typeof sg.line === "string" ? sg.line : typeof sg.text === "string" ? sg.text : "x"))
        : r.speech_segments
      return [{ ...r, text, speech_segments: segs }]
    })
    // The cursor moves past dropped rows too, so a roll line is never asked for again.
    const last = data && data.length ? data[data.length - 1].created_at : null
    return NextResponse.json({ cursor: last ?? after, lines })
  } catch (e) {
    return NextResponse.json({ cursor: null, lines: [], error: String(e) })
  }
}
