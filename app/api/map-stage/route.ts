import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { applyStageEvents, jorlanOnDuty, readStage, watchWriteEvents } from "@/lib/stage-roster"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { readSeated } from "@/lib/seats"
import { WALK_SHEET_COLUMNS, walkSheetFromRow, type WalkSheet } from "@/lib/walk-sheet"
import { loadNpcLanguages } from "@/lib/npc-languages"

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
//
// `watch` and `gate` are the pen's watch and gate as Malachar's [WATCH:] / [GATE:] tags left them (lib/stage-roster).
// The map has read both since 2026-10-25 (followWatch / followGate) but this route never sent them, so no change of
// watch, unattended post or story-opened gate ever reached it. `jorlanOnDuty` says whether Jorlan has come on the
// watch yet (Sam, 2026-10-26: he arrives with the 2nd or 3rd rotation, not at the start); `rotations` is the count.
//
// POST — the DM changes the watch or the gate from the map (2026-10-30).
//
// Until now the ONLY way the watch could change was a [WATCH:] tag in Malachar's prose. The map's own DM button
// ("Story: the watch changes") called a local `fakeWatch()` that set `storyWatch` in that one browser and played the
// hand-over there — invisible to every other seat, and, because it never reached the server, it never incremented
// `rotations`. Measured on the live game 2026-10-30: `watch: null`, `rotations: 0` — the watch had never changed in
// the whole run, so Jorlan (who comes on with the 2nd or 3rd rotation) could never arrive, and neither could anything
// else counted in rotations. This POST is that missing write path: one DM press, one real change, every seat agrees.
//
// DM only, by the same `x-dm-key` the labor route uses. Players do not move the watch — the drow do.

export const dynamic = "force-dynamic"

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

/**
 * The body a map sends: `{ watch: "changing" }`, `{ gate: "open" }`, or both. The words are run through the same
 * `watchStateOf` / `gateStateOf` vocabulary Malachar's tags use, so the button and the prose cannot drift apart —
 * an unknown word is refused rather than guessed at.
 */
export async function POST(req: NextRequest) {
  if (!isDm(req)) return NextResponse.json({ error: "DM key required" }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad JSON" }, { status: 400 }) }

  const { events, error } = watchWriteEvents(body)
  if (!events) return NextResponse.json({ error }, { status: 400 })

  try {
    const admin = createAdminClient()
    await applyStageEvents(admin, events)
    // Read back rather than trusting the write: the caller wants to know whether this is the rotation that
    // brought Jorlan on, and `rotations`/`jorlanAt` are decided inside applyEventsTo, not here.
    const stage = await readStage(admin)
    return NextResponse.json({
      ok: true,
      watch: stage.watch ?? null,
      gate: stage.gate ?? null,
      rotations: stage.rotations ?? 0,
      jorlanOnDuty: jorlanOnDuty(stage),
      updatedAt: stage.updatedAt,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

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
    // snapshots for attacks and magic; their saves and skills come from this sheet (class save proficiency
    // included, 2026-10-27), and a seat the map does not already know takes the whole sheet.
    const ids = seated.map((s) => s.id)
    const levels = new Map<string, number>()
    const sheets = new Map<string, WalkSheet>()
    // Each seat's languages (and conditions, for Comprehend Languages / Tongues) so the map can render a
    // line in a tongue that seat lacks as gibberish (lib/languages, public/js/aop-languages.js).
    const tongues = new Map<string, { languages: unknown; conditions: unknown }>()
    if (ids.length) {
      const { data } = await admin.from("characters").select(WALK_SHEET_COLUMNS + ", languages, conditions").in("id", ids)
      for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
        const id = String(r.id)
        tongues.set(id, { languages: r.languages ?? null, conditions: r.conditions ?? null })
        if (typeof r.level === "number") levels.set(id, r.level)
        sheets.set(id, walkSheetFromRow(r))
      }
    }
    // And what each NPC speaks, by name (lib/npc-languages: its own `languages`, else its bestiary row's), so the
    // lines the map composes itself, its combat taunts, are spoken in a real tongue and heard per seat like
    // every other NPC line. Only NPCs with language data are listed; a missing name is never scrambled.
    const npcLanguages: Record<string, string> = {}
    try {
      const { data: npcRows } = await admin.from("npc_encounters").select("id, name")
      const rows = (npcRows ?? []) as { id: string; name: string | null }[]
      const langs = await loadNpcLanguages(admin, rows.map((r) => r.id))
      for (const r of rows) {
        const l = langs.get(r.id)
        if (r.name && l && !npcLanguages[r.name]) npcLanguages[r.name] = l
      }
    } catch { /* best-effort: without it taunts stay in plain words, as before */ }
    return NextResponse.json({
      area: stage.area,
      watch: stage.watch ?? null,
      gate: stage.gate ?? null,
      rotations: stage.rotations ?? 0,
      jorlanOnDuty: jorlanOnDuty(stage),
      npcLanguages,
      updatedAt: stage.updatedAt,
      present: Object.values(stage.present),
      gone: Object.values(stage.gone),
      run: runRes.data?.run_number ?? null,
      seated: seated.map((s) => ({ id: s.id, name: s.name, dm: !!s.dm, level: levels.get(s.id) ?? null, sheet: sheets.get(s.id) ?? null, ...(tongues.get(s.id) ?? { languages: null, conditions: null }) })),
    })
  } catch (e) {
    return NextResponse.json({ area: null, watch: null, gate: null, rotations: 0, jorlanOnDuty: false, present: [], gone: [], run: null, seated: [], npcLanguages: {}, error: String(e) }, { status: 200 })
  }
}
