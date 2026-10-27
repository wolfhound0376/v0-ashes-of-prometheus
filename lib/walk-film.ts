// lib/walk-film.ts — film the painted map may ask for.
//
// The map (public/velkynvelve-walk, in an iframe on /velkynvelve) posts {type: "aop:walk-film", cue} when a moment
// it knows has film is chosen — today the pen gate's Look closer → "Look around" / "Count the guards" (Sam,
// 2026-10-27). components/walk/walk-cue-bridge.tsx turns the cue into an /api/cinematics request built here and
// plays what comes back. Whether there is film, which one (Fifi's own vs the general), and whether this seat has
// already seen it are the server's call (resolve_cinematic + cinematic_views): a click from the map is a
// player_initiated look, exactly like the dashboard's look-around chip.
//
// A closed list: the map names a moment, it never picks film.

export const PEN_LOCATION = "Scene_1_Velkynvelve (slave pen)"

type WalkFilm = { kind: "action" | "environment"; state: string | null; scope: "solo" | "party"; location: string }

export const WALK_FILMS = {
  /** The outpost beyond the bars — the pen's establishing film (what the dashboard's look-around chip rolls). */
  "look-around": { kind: "environment", state: null, scope: "party", location: PEN_LOCATION },
  /** Counting the guards through the bars — Fifi's own film on her seat, the general one for everyone else. */
  "count-guards": { kind: "action", state: "count-guards", scope: "solo", location: PEN_LOCATION },
} as const satisfies Record<string, WalkFilm>

export type WalkFilmCue = keyof typeof WALK_FILMS

/** Read a message from the map's frame. Anything but a known cue is null. The caller checks origin and source. */
export function parseWalkFilm(data: unknown): WalkFilmCue | null {
  if (!data || typeof data !== "object") return null
  const m = data as Record<string, unknown>
  if (m.type !== "aop:walk-film" || typeof m.cue !== "string") return null
  return Object.prototype.hasOwnProperty.call(WALK_FILMS, m.cue) ? (m.cue as WalkFilmCue) : null
}

/** The /api/cinematics query for a cue, as the seated character (or none, for an unseated window). */
export function walkFilmParams(cue: WalkFilmCue, characterId: string | null): URLSearchParams {
  const f: WalkFilm = WALK_FILMS[cue]
  const params = new URLSearchParams({ location: f.location, kind: f.kind, scope: f.scope, trigger_type: "player_initiated" })
  if (f.state) params.set("state", f.state)
  if (characterId) params.set("character_id", characterId)
  return params
}
