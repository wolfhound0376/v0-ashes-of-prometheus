import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readStage } from "@/lib/stage-roster"

// /api/map-stage — who is in the area with the party, as Malachar has narrated it (lib/stage-roster.ts).
//
// The painted map reads this and keeps its sprites honest: a creature on the `present` list walks in,
// one on `gone` walks off (dead ones fall where they stand), and the story's own cast — the guards,
// Jorlan, the prisoners — leave the plate when Malachar sends them out of sight and come back when he
// brings them in. Replaces /api/map-creatures, which read the NPC panel's spotlight (is_active) and so
// lost the ooze the moment the party spoke to someone else. Anyone may read it — the players see the
// room too.

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const stage = await readStage(createAdminClient())
    return NextResponse.json({
      area: stage.area,
      updatedAt: stage.updatedAt,
      present: Object.values(stage.present),
      gone: Object.values(stage.gone),
    })
  } catch (e) {
    return NextResponse.json({ area: null, present: [], gone: [], error: String(e) }, { status: 200 })
  }
}
