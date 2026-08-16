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

function authorized(request: NextRequest): boolean {
  const dmCode = process.env.DM_ACCESS_CODE
  if (!dmCode) return true
  const supplied = normalizeCode(request.headers.get("x-dm-key"))
  return !!supplied && safeEquals(supplied, normalizeCode(dmCode))
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
