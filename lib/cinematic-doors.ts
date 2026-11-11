// lib/cinematic-doors.ts — every filmed moment has ONE door, and only that door may open it.
//
// Sam (2026-11-10): "Sometimes we are triggering cinematics that have NOTHING to do with what we are doing."
//
// What the request log showed (cinematic_requests, read 2026-11-10):
//   - "notice-success" asked for INSIDE THE SLAVE PEN eight times (last: Fifi, 2026-11-10) and answered with
//     road-notice-success.mp4 — the film shot for the party spotting something at a ROAD node. It is filed at
//     location 'generic' so every road marker finds it, and /api/chat offered every 'generic' action clip to
//     Malachar as a cue he could name anywhere. He saw a cue called "notice-success", someone noticed
//     something in the pen, and the road film rolled.
//   - "ward-sigil" played for Fifi as an event_driven cue. That film is the reward for a caster's Arcana
//     reading on the map (lib/walk-film.ts); the map only ever asks as player_initiated. An event_driven
//     request means Malachar named it from the chat, with no roll, for a rogue.
//
// Both are the same fault: a cue that belongs to the rules engine or to the map was ALSO on Malachar's list,
// where the only thing he knows about it is its name.
//
// The three doors:
//   engine   — code resolved a check and emits the cue itself (lib/check-cue.ts, the alchemy bench).
//   map      — the Underwalk adjudicated a moment and posts the cue (lib/walk-film.ts), roll already judged.
//   malachar — everything else filed at the scene: he names it with [CINEMATIC: …] when his narration gets there.
//
// A cue owned by the engine or the map is never offered to Malachar. Pure: no fetch, no DOM.

import { CHECK_CUES } from "@/lib/check-cue"
import { WALK_FILMS } from "@/lib/walk-film"
import { CRIT_FAIL_CUE } from "@/lib/alchemy-bench"

export type CinematicDoor = "engine" | "map" | "malachar"

/** Cues the rules engine fires itself when a check resolves. */
export const ENGINE_CUES: readonly string[] = [...Object.keys(CHECK_CUES), CRIT_FAIL_CUE]

/** Cues the Underwalk fires after it has adjudicated the moment (and any roll) itself. */
export const MAP_CUES: readonly string[] = Object.values(WALK_FILMS)
  .map((f) => f.state as string | null)
  .filter((s): s is string => !!s)

/** Which door a cue belongs to. Anything the code does not claim is Malachar's to name. */
export function doorFor(state: string): CinematicDoor {
  const s = (state || "").trim().toLowerCase()
  if (ENGINE_CUES.includes(s)) return "engine"
  if (MAP_CUES.includes(s)) return "map"
  return "malachar"
}

/** The cue names Malachar may be offered, from the action clips filed where the party is. */
export function cuesForMalachar(states: ReadonlyArray<string | null | undefined>): string[] {
  const out: string[] = []
  for (const raw of states) {
    const s = (raw || "").trim()
    if (!s || doorFor(s) !== "malachar") continue
    if (!out.includes(s)) out.push(s)
  }
  return out
}

// ── THE CATALOGUE ROW IS THE WHOLE TRIGGER (Sam, 2026-11-10: "go on the pipeline") ──────────────────────
// cinematic_clips now says, per film: `moment` (one sentence — WHEN it fires), `fired_by` (which door),
// `plate` (which Underwalk plate, null = anywhere in the scene) and `retired`. Malachar is told the moment,
// not just the name; a film for another plate, another hero or another door is never put in front of him.
// Migration: supabase/migrations/20261111030000_cinematic_trigger_columns.sql.

export type CueRow = {
  state: string | null
  moment?: string | null
  fired_by?: string | null
  plate?: string | null
  retired?: boolean | null
  character_id?: string | null
}

export type OfferedCue = { state: string; moment: string | null }

/**
 * The cues to put in front of Malachar this turn.
 *   plate        where the SPEAKER stands (party_situation.sub_location, or their own plate when the party is
 *                split). null = not known: plated cues are then still offered, as they were before plates existed.
 *   characterId  the speaker. A film bound to another hero is not offered — the server would refuse it anyway.
 * A cue the code itself fires (doorFor) is never offered whatever the row says: the row can narrow, never widen.
 */
export function offerToMalachar(
  rows: ReadonlyArray<CueRow>,
  ctx: { plate: string | null; characterId: string | null },
): OfferedCue[] {
  const out: OfferedCue[] = []
  for (const r of rows) {
    const state = (r.state || "").trim()
    if (!state || r.retired) continue
    if (doorFor(state) !== "malachar") continue
    if (r.fired_by && r.fired_by !== "malachar") continue
    if (r.plate && ctx.plate && r.plate !== ctx.plate) continue
    if (r.character_id && r.character_id !== ctx.characterId) continue
    const moment = (r.moment || "").trim() || null
    const seen = out.find((o) => o.state === state)
    if (seen) { if (!seen.moment && moment) seen.moment = moment; continue }
    out.push({ state, moment })
  }
  return out
}

/** The list as Malachar (and the second look) reads it: one cue per line, with the moment it belongs to. */
export function cueLines(cues: ReadonlyArray<OfferedCue>): string {
  return cues.map((c) => (c.moment ? `- ${c.state}: ${c.moment}` : `- ${c.state}`)).join("\n")
}
