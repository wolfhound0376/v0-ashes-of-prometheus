// lib/check-cue.ts — a check's outcome names a filmed moment.
//
// Sam (2026-10-14): "I like how certain checks have their video cinematic …
// I'd like to incorporate this when certain checks are done."
//
// Today a clip rolls only when Malachar writes [CINEMATIC: …] in his prose or a
// player taps the look-around chip. This is the third door: the rules engine
// itself. When a check resolves, the code that resolved it emits a cue named
// for the outcome — "notice-success", "navigation-fail", "forced-march-fail",
// "lockpick-success" — and the stage (components/stage/stage-provider.tsx)
// asks /api/cinematics whether there is film for it.
//
// Everything that decides WHETHER film plays stays on the server, unchanged:
// location → generic fallback → nothing; once per character; solo or party.
// A cue with no film is silence. This file carries the name and nothing else,
// as lib/cinematic-cue.ts does for Malachar's cues.
//
// Cue names are the cinematic_clips.state vocabulary: lowercase, hyphenated,
// `<check>-<success|fail>`. A new check means a new name here, in the table
// below, so the catalogue and the code agree on what can be filmed.

const EVENT = "aop-check-cue"

export type CheckCue = {
  /** cinematic_clips.state, e.g. "notice-success". */
  state: string
  /** Who should see it. A party clip is shared through sessions.stage; a solo one plays for this browser only. */
  scope: "solo" | "party"
  /** Where it happened — matched against cinematic_clips.location, falling back to generic. */
  location?: string
  /** Malachar's caption to carry through the film. */
  caption?: string
}

/** The check cues the rules engine can emit today. Film is optional for every one of them. */
export const CHECK_CUES = {
  // the road (lib/travel/*)
  "notice-success": "The party's passive Perception found something at a road node",
  "navigation-fail": "The navigator lost the way (1d6 hours wandering)",
  "forced-march-fail": "Someone dropped a level of exhaustion pushing past eight hours",
  // the painted map (public/velkynvelve-walk, via components/walk/walk-cue-bridge.tsx)
  "count-guards": "Someone looked closer at the pen gate: the view through the bars as a guard walks past",
} as const

export type CheckCueName = keyof typeof CHECK_CUES

/** Announce that a check resolved into a filmed moment. Safe to call anywhere; a no-op on the server. */
export function emitCheckCue(cue: CheckCue): void {
  if (typeof window === "undefined") return
  const state = (cue.state || "").trim()
  if (!state) return
  try {
    window.dispatchEvent(new CustomEvent<CheckCue>(EVENT, { detail: { ...cue, state } }))
  } catch {
    /* no CustomEvent support — the check stands, the film does not */
  }
}

/** Subscribe to check cues. Returns an unsubscribe function. */
export function onCheckCue(fn: (cue: CheckCue) => void): () => void {
  if (typeof window === "undefined") return () => {}
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<CheckCue>).detail
    if (detail?.state) fn(detail)
  }
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}

/** The cues the painted map may ask for. A closed list: the map names a moment, it never picks film. */
export const WALK_CHECK_CUES: ReadonlySet<CheckCueName> = new Set<CheckCueName>(["count-guards"])

/**
 * Read a check cue posted by the painted map's frame ({type: "aop:check-cue", state, scope, location}).
 * Anything that is not a cue on WALK_CHECK_CUES is null. The caller checks origin and source.
 */
export function parseWalkCheckCue(data: unknown): CheckCue | null {
  if (!data || typeof data !== "object") return null
  const m = data as Record<string, unknown>
  if (m.type !== "aop:check-cue") return null
  const state = typeof m.state === "string" ? m.state.trim() : ""
  if (!WALK_CHECK_CUES.has(state as CheckCueName)) return null
  const scope = m.scope === "party" ? "party" : "solo"
  const location = typeof m.location === "string" && m.location.trim() ? m.location.trim().slice(0, 80) : undefined
  const caption = typeof m.caption === "string" && m.caption.trim() ? m.caption.trim().slice(0, 240) : undefined
  return { state, scope, location, caption }
}
