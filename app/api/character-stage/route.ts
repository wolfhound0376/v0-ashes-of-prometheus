import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"

// /api/character-stage — set a player character's scene-stage framing.
//
//   POST json: { id, stageScale?, stageOffsetY? }
//
// Sibling of /api/character-voice: same row-id keying, same DM authorization
// (x-dm-key must carry DM_ACCESS_CODE when set; unset stays fail-open like the
// /join gate). Values are clamped server-side so a bad number can never make a
// character disappear off the panel.

export const dynamic = "force-dynamic"

export const STAGE_SCALE_MIN = 0.2
export const STAGE_SCALE_MAX = 3
export const STAGE_OFFSET_MIN = -50
export const STAGE_OFFSET_MAX = 50

function authorized(request: NextRequest): boolean {
  const dmCode = process.env.DM_ACCESS_CODE
  if (!dmCode) return true
  const supplied = normalizeCode(request.headers.get("x-dm-key"))
  return !!supplied && safeEquals(supplied, normalizeCode(dmCode))
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100))
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

  const stage_scale = clamp(body?.stageScale, STAGE_SCALE_MIN, STAGE_SCALE_MAX, 1)
  const stage_offset_y = clamp(body?.stageOffsetY, STAGE_OFFSET_MIN, STAGE_OFFSET_MAX, 0)

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
