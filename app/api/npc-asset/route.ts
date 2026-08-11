import { NextResponse } from "next/server"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { createAdminClient } from "@/lib/supabase/admin"

const COLUMNS = ["face_url", "idle_url", "talking_url"] as const
type AssetColumn = (typeof COLUMNS)[number]

export async function DELETE(request: Request) {
  let body: { npcName?: string; asset?: string; dmCode?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const configuredCode = process.env.DM_ACCESS_CODE
  if (configuredCode && !safeEquals(normalizeCode(body.dmCode), normalizeCode(configuredCode))) {
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
