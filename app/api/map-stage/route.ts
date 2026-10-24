import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readStage } from "@/lib/stage-roster"
import { readSeated } from "@/lib/seats"
import { WALK_SHEET_COLUMNS, walkSheetFromRow, type WalkSheet } from "@/lib/walk-sheet"

// /api/map-stage — who is in the area with the party, as Malachar has narrated it (lib/stage-roster.ts).
//
// The painted map reads this and keeps its sprites honest: a creature on the `present` list walks in,
// one on `gone` walks off (dead ones fall where they stand), and the story's own cast — the guards,
// Jorlan, the prisoners — leave the plate when Malachar sends them out of sight and come back when he
// brings them in. Replaces /api/map-creatures, which read the NPC panel's spotlight (is_active) and so
// lost the ooze the moment the party spoke to someone else. Anyone may read it — the players see the
// room too.
//
// `run` is the number of the live campaign run (campaign_runs, the one not ended). A restart opens a
// new run (/api/restart-campaign step 2c); the map remembers the number it first saw and reloads
// itself when it changes, so an open gate, a walked-in creature and a party halfway across the plate
// do not survive a world that was reset under them. Null when the runs cannot be read.
//
// `seated` is who has sat down this run (lib/seats.ts): the map draws THOSE as the party, and only
// them (Sam, 2026-10-14: "only the character selected will populate"). Empty until someone comes
// through the door, in which case the map falls back to the whole party so a DM screen is not empty.

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const admin = createAdminClient()
    const [stage, seated, runRes] = await Promise.all([
      readStage(admin),
      readSeated(admin),
      admin.from("campaign_runs").select("run_number").eq("campaign_id", "abyss").neq("status", "ended")
        .order("run_number", { ascending: false }).limit(1).maybeSingle(),
    ])
    // Each seated character's level, so the map can switch on class features as they are earned
    // (Cunning Action at rogue level 2). Best-effort: a failed read leaves level off and the map
    // keeps its own snapshot.
    //
    // And each one's whole walk sheet (lib/walk-sheet.ts), so a hero made at the Forge after the map was
    // built walks and fights as themselves instead of as the first premade (Sam, 2026-10-23: "My son
    // created a character named gandalf but kenta is the pixel art"). The premades keep the page's own
    // snapshots; the map only uses this for a seat it does not already know.
    const ids = seated.map((s) => s.id)
    const levels = new Map<string, number>()
    const sheets = new Map<string, WalkSheet>()
    if (ids.length) {
      const { data } = await admin.from("characters").select(WALK_SHEET_COLUMNS).in("id", ids)
      for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
        const id = String(r.id)
        if (typeof r.level === "number") levels.set(id, r.level)
        sheets.set(id, walkSheetFromRow(r))
      }
    }
    return NextResponse.json({
      area: stage.area,
      updatedAt: stage.updatedAt,
      present: Object.values(stage.present),
      gone: Object.values(stage.gone),
      run: runRes.data?.run_number ?? null,
      seated: seated.map((s) => ({ id: s.id, name: s.name, dm: !!s.dm, level: levels.get(s.id) ?? null, sheet: sheets.get(s.id) ?? null })),
    })
  } catch (e) {
    return NextResponse.json({ area: null, present: [], gone: [], run: null, seated: [], error: String(e) }, { status: 200 })
  }
}
