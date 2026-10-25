import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

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

export const dynamic = "force-dynamic"

const SPOKEN = ["npc", "dm", "player"]

export async function GET(req: NextRequest) {
  try {
    const db = createAdminClient()
    const after = req.nextUrl.searchParams.get("after")
    if (!after || Number.isNaN(Date.parse(after))) {
      const { data } = await db.from("dialogue").select("created_at").eq("channel", "dm")
        .order("created_at", { ascending: false }).limit(1).maybeSingle()
      return NextResponse.json({ cursor: data?.created_at ?? new Date().toISOString(), lines: [] })
    }
    const { data, error } = await db.from("dialogue")
      .select("id, speaker, speaker_type, text, speech_segments, created_at, sort_order")  // speech_segments[].lang: the tongue (lib/languages)
      .eq("channel", "dm").in("speaker_type", SPOKEN).gte("created_at", after)
      .order("created_at", { ascending: true }).order("sort_order", { ascending: true }).limit(40)
    if (error) return NextResponse.json({ cursor: after, lines: [], error: error.message })
    const lines = (data ?? []).filter((r) => typeof r.text === "string" && r.text.trim())
    return NextResponse.json({ cursor: lines.length ? lines[lines.length - 1].created_at : after, lines })
  } catch (e) {
    return NextResponse.json({ cursor: null, lines: [], error: String(e) })
  }
}
