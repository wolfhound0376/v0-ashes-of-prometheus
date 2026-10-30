import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { tagLine } from "@/lib/dialogue-tags"

// ============================================================================
// POST /api/dialogue/tag-archive — run the tagger over the archive.
// ============================================================================
//
// Sam, 2026-10-30: "work on making it recyclable by making detailed tags."
//
// The rules are in lib/dialogue-tags.ts (pure, tested). This walks
// dialogue_archive and writes the verdicts down so the recycler
// (lib/canned-lines.ts) has something to query.
//
// A route rather than a CLI script on purpose: it needs the service role and
// the roster, both of which the server already has, and Sam can fire it from
// the DM screen without a terminal or an env var.
//
//   POST { }                → tag everything not yet tagged (resumable, and a
//                             second run is a no-op)
//   POST { dry: true }      → count and sample, write nothing
//   POST { retag: true }    → re-tag EVERY row, for after a rules change
//
// Nothing is ever deleted; only the tag columns are written. DM key required,
// same gate as /api/character-voice.

export const dynamic = "force-dynamic"
export const maxDuration = 60

const PAGE = 500
/** A ceiling so one call cannot run forever on a large archive; call again to continue. */
const MAX_ROWS = 5000

function authorized(request: NextRequest): boolean {
  const dmCode = process.env.DM_ACCESS_CODE
  if (!dmCode) return false
  const supplied = normalizeCode(request.headers.get("x-dm-key"))
  return !!supplied && safeEquals(supplied, normalizeCode(dmCode))
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not authorized" }, { status: 403 })

  let db: ReturnType<typeof createAdminClient>
  try {
    db = createAdminClient()
  } catch (e) {
    console.error("[tag-archive] admin client unavailable:", e)
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const dry = body?.dry === true
  const retag = body?.retag === true

  // The roster is read live, never hard-coded: a line naming a hero is not
  // reusable, and which names those are changes every time someone forges a
  // character.
  const { data: heroes, error: heroErr } = await db
    .from("characters")
    .select("name")
    .eq("is_player", true)
    .is("archived_at", null)
  if (heroErr) {
    console.error("[tag-archive] roster read failed:", heroErr.message)
    return NextResponse.json({ error: "Could not read the roster" }, { status: 500 })
  }
  const heroNames = (heroes ?? []).map((h: { name: string | null }) => h.name).filter(Boolean) as string[]

  let from = 0
  let seen = 0
  let reusable = 0
  const reasons: Record<string, number> = {}
  const sample: string[] = []

  while (seen < MAX_ROWS) {
    let q = db
      .from("dialogue_archive")
      .select("id, speaker, speaker_type, channel, text, recipient")
      .order("archived_at", { ascending: true })
    if (!retag) q = q.is("tagged_at", null)

    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) {
      console.error("[tag-archive] read failed:", error.message)
      return NextResponse.json({ error: "Archive read failed", detail: error.message }, { status: 500 })
    }
    if (!data?.length) break

    for (const row of data) {
      const t = tagLine(row, heroNames)
      seen++
      if (t.reusable) {
        reusable++
        if (sample.length < 10) sample.push(`${row.speaker}: ${String(row.text ?? "").slice(0, 80)}`)
      } else {
        reasons[t.reason] = (reasons[t.reason] ?? 0) + 1
      }

      if (dry) continue

      const { error: upErr } = await db
        .from("dialogue_archive")
        .update({
          kind: t.kind,
          trigger: t.trigger,
          reusable: t.reusable,
          reason: t.reason || null,
          tags: t.tags,
          tagged_at: new Date().toISOString(),
        })
        .eq("id", row.id)
      if (upErr) console.error(`[tag-archive] write failed for ${row.id}:`, upErr.message)
    }

    // Untagged rows drop out of the filter as they are written, so the window
    // only has to advance when nothing is being written to it.
    if (retag || dry) from += PAGE
    if (data.length < PAGE) break
  }

  console.log(`[tag-archive] ${dry ? "examined" : "tagged"} ${seen}; ${reusable} reusable`)
  return NextResponse.json({
    ok: true,
    mode: dry ? "dry" : retag ? "retag" : "new",
    examined: seen,
    reusable,
    notReusable: reasons,
    sample,
    more: seen >= MAX_ROWS,
  })
}
