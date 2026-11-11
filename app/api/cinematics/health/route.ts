import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { summarizeRequests, type RequestRow } from "@/lib/cinematic-health"

// GET /api/cinematics/health — what the request log says about each film, for the DM's Cinematics tab.
//
//   → { byClip: { <clip id>: { served, last, to: [hero names] } }, misses: [{ location, state, kind, asked, last }] }
//
// cinematic_requests has RLS on with no policies, so the browser cannot read it; this is the one door, and it
// is DM-keyed exactly like the catalogue's writes. Read-only: nothing here changes a row or spends a viewing.
// The log is the last 3,000 asks — months of play at today's rate — newest first.

export const dynamic = "force-dynamic"

function authorized(request: NextRequest): boolean {
  const dmCode = process.env.DM_ACCESS_CODE
  if (!dmCode) return false // fail closed, as /api/cinematics does
  const supplied = normalizeCode(request.headers.get("x-dm-key"))
  return !!supplied && safeEquals(supplied, normalizeCode(dmCode))
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not authorized" }, { status: 403 })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[cinematics/health] admin client unavailable:", e)
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  const [log, clips] = await Promise.all([
    admin
      .from("cinematic_requests")
      .select("req_location, req_state, req_kind, resolution, resolved_clip_id, character_id, created_at")
      .order("created_at", { ascending: false })
      .limit(3000),
    admin.from("cinematic_clips").select("location, state, kind, video_url"),
  ])
  if (log.error) {
    console.error("[cinematics/health] log read failed:", log.error.message)
    return NextResponse.json({ error: "Could not read the request log" }, { status: 500 })
  }
  const rows = (log.data || []) as RequestRow[]

  const ids = [...new Set(rows.map((r) => r.character_id).filter((v): v is string => !!v))]
  const names: Record<string, string> = {}
  if (ids.length) {
    const { data: chars } = await admin.from("characters").select("id, name").in("id", ids)
    for (const c of chars || []) names[c.id as string] = String(c.name ?? "")
  }

  return NextResponse.json(summarizeRequests(rows, names, (clips.data || []) as { location: string; state: string | null; kind: string; video_url: string | null }[]))
}
