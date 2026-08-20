import { NextResponse } from "next/server"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { createAdminClient } from "@/lib/supabase/admin"
import { clampFraming, STAGE_OFFSET_MAX, STAGE_OFFSET_MIN, STAGE_SCALE_MAX, STAGE_SCALE_MIN } from "@/lib/stage-framing"

const COLUMNS = ["face_url", "idle_url", "talking_url"] as const
type AssetColumn = (typeof COLUMNS)[number]

function hasDmAccess(dmCode: unknown): boolean {
  const configuredCode = process.env.DM_ACCESS_CODE
  // Fail closed: if no DM access code is configured, nobody is a DM.
  return !!configuredCode && safeEquals(normalizeCode(dmCode), normalizeCode(configuredCode))
}

export async function DELETE(request: Request) {
  let body: { npcName?: string; asset?: string; dmCode?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  if (!hasDmAccess(body.dmCode)) {
    return NextResponse.json({ error: "DM access required" }, { status: 403 })
  }

  const npcName = body.npcName?.trim()
  const asset = body.asset as AssetColumn
  if (!npcName || !COLUMNS.includes(asset)) {
    return NextResponse.json({ error: "npcName and a valid asset are required" }, { status: 400 })
  }

  const { data, error } = await createAdminClient()
    .from("npc_encounters")
    .update({ [asset]: null })
    .eq("name", npcName)
    .select("id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cleared: asset, updatedCount: data?.length ?? 0 })
}

// PATCH carries two different edits, told apart by which keys are present:
// the ElevenLabs voice, or the head-window framing. Keeping them on one verb
// keeps the name-keyed DM authorization in one place; branching on the payload
// means a framing save can never blank a voice it was not asked about.
export async function PATCH(request: Request) {
  let body: {
    npcName?: string
    voiceId?: string
    voiceDescription?: string
    stageScale?: number | string
    stageOffsetY?: number | string
    dmCode?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  if (!hasDmAccess(body.dmCode)) {
    return NextResponse.json({ error: "DM access required" }, { status: 403 })
  }

  const npcName = body.npcName?.trim()
  if (!npcName) return NextResponse.json({ error: "npcName is required" }, { status: 400 })

  if (body.stageScale !== undefined || body.stageOffsetY !== undefined) {
    const stage_scale = clampFraming(body.stageScale, STAGE_SCALE_MIN, STAGE_SCALE_MAX, 1)
    const stage_offset_y = clampFraming(body.stageOffsetY, STAGE_OFFSET_MIN, STAGE_OFFSET_MAX, 0)
    const { data, error } = await createAdminClient()
      .from("npc_encounters")
      .update({ stage_scale, stage_offset_y })
      .eq("name", npcName)
      .select("id")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ stageScale: stage_scale, stageOffsetY: stage_offset_y, updatedCount: data?.length ?? 0 })
  }

  const voiceId = body.voiceId?.trim() || null
  const voiceDescription = body.voiceDescription?.trim() || null
  const { data, error } = await createAdminClient()
    .from("npc_encounters")
    .update({ voice_id: voiceId, voice_description: voiceDescription })
    .eq("name", npcName)
    .select("id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ voiceId, voiceDescription, updatedCount: data?.length ?? 0 })
}
