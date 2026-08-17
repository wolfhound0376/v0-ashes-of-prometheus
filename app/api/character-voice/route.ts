import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"

// /api/character-voice — set a player character's ElevenLabs voice.
//
//   POST json: { id, voiceId?, voiceDescription? }
//
// The Characters-tab twin of /api/npc-asset's voice save, but keyed by row id
// (player characters are unique rows; NPC identity is by name). Empty strings
// clear the column. Authorization mirrors /api/asset-media: x-dm-key must
// carry DM_ACCESS_CODE when set; unset stays fail-open like the /join gate.

export const dynamic = "force-dynamic"

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
    console.error("[character-voice] admin client unavailable:", e)
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === "string" ? body.id : ""
  if (!id) return NextResponse.json({ error: "Character id is required" }, { status: 400 })

  const voiceId = typeof body?.voiceId === "string" && body.voiceId.trim() ? body.voiceId.trim().slice(0, 80) : null
  const voiceDescription =
    typeof body?.voiceDescription === "string" && body.voiceDescription.trim() ? body.voiceDescription.trim().slice(0, 300) : null

  const { data, error } = await admin
    .from("characters")
    .update({ voice_id: voiceId, voice_description: voiceDescription })
    .eq("id", id)
    .select("id, name, voice_id, voice_description")
    .single()
  if (error) {
    console.error("[character-voice] update failed:", error.message)
    return NextResponse.json({ error: "Could not save the voice" }, { status: 500 })
  }
  return NextResponse.json({ character: data })
}
