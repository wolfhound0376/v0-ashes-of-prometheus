import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"

// /api/cinematics — create and delete cinematic clip entries. (PR-4)
//
//   POST   json: { location, state?, scope, kind }  → create a clip row
//   DELETE json: { id }                             → remove the clip row
//
// The VIDEO itself never passes through here: uploads go to /api/asset-media
// under the whitelisted target "cinematic.video", same as every other DM asset.
// Deleting a clip removes the database row only — blob bytes are kept, the
// same house rule as clearing any other asset reference.
//
// AUTHORIZATION mirrors /api/asset-media: x-dm-key must carry DM_ACCESS_CODE
// when that env var is set; with it unset the route stays open (fail-open,
// same as the /join gate).

export const dynamic = "force-dynamic"

const SCOPES = ["solo", "party"] as const
const KINDS = ["environment", "action", "filler"] as const
const TRIGGERS = ["campaign_open", "player_initiated", "event_driven", "dm_override"] as const

// The reserved location that holds catch-all clips. When neither an exact
// (location+state) nor a location-only clip exists, resolution falls through
// to a clip filed under this location.
const GENERIC_LOCATION = "generic"

// The five values the cinematic_requests.resolution column is constrained to
// at the database level. Anything outside this set throws on insert.
type Resolution = "exact" | "location_fallback" | "generic_fallback" | "miss" | "rejected"

function authorized(request: NextRequest): boolean {
  const dmCode = process.env.DM_ACCESS_CODE
  if (!dmCode) return true
  const supplied = normalizeCode(request.headers.get("x-dm-key"))
  return !!supplied && safeEquals(supplied, normalizeCode(dmCode))
}

// Observability write. Records which fallback tier a resolution landed on so
// the cinematic_gaps view can surface clips the catalogue is missing.
//
// Uses the service-role admin client because cinematic_requests has RLS on
// with no policies — an anon-key write would silently no-op. Every failure is
// swallowed and logged: a broken log must never stop a clip from playing.
async function logCinematicRequest(
  admin: ReturnType<typeof createAdminClient>,
  row: {
    req_location: string | null
    req_state: string | null
    req_scope: string
    req_kind: string
    trigger_type: string | null
    session_id: string | null
    character_id: string | null
    resolution: Resolution
    resolved_clip_id: string | null
  },
) {
  try {
    const { error } = await admin.from("cinematic_requests").insert(row)
    if (error) console.error("[cinematics] request-log insert failed:", error.message)
  } catch (e) {
    console.error("[cinematics] request-log insert threw:", e)
  }
}

// GET /api/cinematics — resolve a cinematic clip via the three-tier fallback
// and record the outcome. Query params:
//   location (required), state?, scope?, kind?, trigger_type?,
//   session_id?, character_id?
//
// Fallback order:  location+state ('exact')
//               →  location alone ('location_fallback')
//               →  reserved 'generic' location ('generic_fallback')
//               →  nothing ('miss')
// A missing location is 'rejected'. Scope/kind, when supplied, constrain every
// tier. Selection logic and response shape are additive here — no existing
// behaviour changes.
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not authorized" }, { status: 403 })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[cinematics] admin client unavailable:", e)
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  const params = request.nextUrl.searchParams
  const location = (params.get("location") || "").trim().slice(0, 80)
  const state = (params.get("state") || "").trim().slice(0, 40) || null
  const scope = SCOPES.includes(params.get("scope") as (typeof SCOPES)[number])
    ? (params.get("scope") as (typeof SCOPES)[number])
    : "party"
  const kind = KINDS.includes(params.get("kind") as (typeof KINDS)[number])
    ? (params.get("kind") as (typeof KINDS)[number])
    : "environment"
  const triggerType = TRIGGERS.includes(params.get("trigger_type") as (typeof TRIGGERS)[number])
    ? (params.get("trigger_type") as (typeof TRIGGERS)[number])
    : null
  const sessionId = params.get("session_id") || null
  const characterId = params.get("character_id") || null

  // Common request metadata attached to whatever resolution we record.
  const reqMeta = {
    req_location: location || null,
    req_state: state,
    req_scope: scope,
    req_kind: kind,
    trigger_type: triggerType,
    session_id: sessionId,
    character_id: characterId,
  }

  if (!location) {
    await logCinematicRequest(admin, { ...reqMeta, resolution: "rejected", resolved_clip_id: null })
    return NextResponse.json({ error: "Location is required" }, { status: 400 })
  }

  const columns = "id, location, state, scope, kind, video_url"

  // Tier 1 — exact match on location + state (scope/kind always constrain).
  let resolution: Resolution = "miss"
  let clip: Record<string, unknown> | null = null

  if (state) {
    const { data } = await admin
      .from("cinematic_clips")
      .select(columns)
      .eq("location", location)
      .eq("state", state)
      .eq("scope", scope)
      .eq("kind", kind)
      .limit(1)
      .maybeSingle()
    if (data) {
      clip = data
      resolution = "exact"
    }
  }

  // Tier 2 — location alone (any state), same scope/kind.
  if (!clip) {
    const { data } = await admin
      .from("cinematic_clips")
      .select(columns)
      .eq("location", location)
      .eq("scope", scope)
      .eq("kind", kind)
      .limit(1)
      .maybeSingle()
    if (data) {
      clip = data
      resolution = "location_fallback"
    }
  }

  // Tier 3 — reserved 'generic' location, same scope/kind.
  if (!clip) {
    const { data } = await admin
      .from("cinematic_clips")
      .select(columns)
      .eq("location", GENERIC_LOCATION)
      .eq("scope", scope)
      .eq("kind", kind)
      .limit(1)
      .maybeSingle()
    if (data) {
      clip = data
      resolution = "generic_fallback"
    }
  }

  // Record the outcome before responding. The insert is awaited so it reliably
  // runs in a serverless invocation, but every error is swallowed inside the
  // helper so a failed log can never block playback.
  const resolvedClipId = clip && typeof clip.id === "string" ? clip.id : null
  await logCinematicRequest(admin, { ...reqMeta, resolution, resolved_clip_id: resolvedClipId })

  return NextResponse.json({ clip, resolution })
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not authorized" }, { status: 403 })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[cinematics] admin client unavailable:", e)
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  const body = await request.json().catch(() => null)
  const location = typeof body?.location === "string" ? body.location.trim().slice(0, 80) : ""
  const state = typeof body?.state === "string" && body.state.trim() ? body.state.trim().slice(0, 40) : null
  const scope = SCOPES.includes(body?.scope) ? (body.scope as (typeof SCOPES)[number]) : null
  const kind = KINDS.includes(body?.kind) ? (body.kind as (typeof KINDS)[number]) : null

  if (!location) return NextResponse.json({ error: "Location is required" }, { status: 400 })
  if (!scope) return NextResponse.json({ error: "Scope must be solo or party" }, { status: 400 })
  if (!kind) return NextResponse.json({ error: "Kind must be environment, action or filler" }, { status: 400 })

  const { data, error } = await admin
    .from("cinematic_clips")
    .insert({ location, state, scope, kind })
    .select("id, location, state, scope, kind, video_url")
    .single()
  if (error) {
    console.error("[cinematics] insert failed:", error.message)
    return NextResponse.json({ error: "Could not create the clip" }, { status: 500 })
  }
  return NextResponse.json({ clip: data })
}

export async function DELETE(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not authorized" }, { status: 403 })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[cinematics] admin client unavailable:", e)
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === "string" ? body.id : ""
  if (!id) return NextResponse.json({ error: "Clip id is required" }, { status: 400 })

  const { error } = await admin.from("cinematic_clips").delete().eq("id", id)
  if (error) {
    console.error("[cinematics] delete failed:", error.message)
    return NextResponse.json({ error: "Could not delete the clip" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
