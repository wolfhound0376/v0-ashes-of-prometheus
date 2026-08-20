import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { clampFraming, STAGE_OFFSET_MAX, STAGE_OFFSET_MIN, STAGE_SCALE_MAX, STAGE_SCALE_MIN } from "@/lib/stage-framing"

// /api/character-stage — set a player character's scene-stage framing.
//
//   POST json: { id, stageScale?, stageOffsetY? }
//
// Sibling of /api/character-voice: same row-id keying, same DM authorization
// (x-dm-key must carry DM_ACCESS_CODE when set; unset stays fail-open like the
// /join gate). Values are clamped server-side so a bad number can never make a
// character disappear off the panel.

export const dynamic = "force-dynamic"

function authorized(request: NextRequest): boolean {
  const dmCode = process.env.DM_ACCESS_CODE
  // Fail closed: if no DM access code is configured, nobody is a DM.
  if (!dmCode) return false
  const supplied = normalizeCode(request.headers.get("x-dm-key"))
  return !!supplied && safeEquals(supplied, normalizeCode(dmCode))
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not authorized" }, { status: 403 })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[character-stage] admin client unavailable:", e)
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === "string" ? body.id : ""
  if (!id) return NextResponse.json({ error: "Character id is required" }, { status: 400 })

  const stage_scale = clampFraming(body?.stageScale, STAGE_SCALE_MIN, STAGE_SCALE_MAX, 1)
  const stage_offset_y = clampFraming(body?.stageOffsetY, STAGE_OFFSET_MIN, STAGE_OFFSET_MAX, 0)

  const { data, error } = await admin
    .from("characters")
    .update({ stage_scale, stage_offset_y })
    .eq("id", id)
    .select("id, name, stage_scale, stage_offset_y")
    .single()
  if (error) {
    console.error("[character-stage] update failed:", error.message)
    return NextResponse.json({ error: "Could not save the stage framing" }, { status: 500 })
  }
  return NextResponse.json({ character: data })
}
