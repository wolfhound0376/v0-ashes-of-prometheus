/**
 * WHO IS ALLOWED TO REPLAY A CLIP, AND WHAT THIS BROWSER HAS ALREADY SEEN.
 *
 * Sam, 7 Sep 2026: "cinematics triggering all the time."
 *
 * He was right, and the request log said so plainly. Grouped by trigger:
 *
 *   dm_override + action   20 requests · 4 distinct clips · 0 ever suppressed
 *   event_driven + action  10 requests · 4 distinct clips · 1 suppressed
 *
 * `kind=action` is only ever sent for a cue Malachar emitted himself, and
 * `dm_override` was only ever sent when DM Mode was on. So those twenty rows
 * are twenty automatic cues that took the DM's manual-replay door — and the
 * route ignores the once-per-character rule for that door on purpose, because
 * DM Mode is the sanctioned way to replay something deliberately.
 *
 * The mistake was treating DM Mode as a property of the BROWSER rather than of
 * the PRESS. A DM asking for a clip again is a decision. Malachar mentioning
 * the guards for the third time is not, and it must not inherit the DM's
 * permission to repeat himself.
 *
 * Nothing here talks to the network. It is the two rules the dashboard needs,
 * kept where a test can reach them.
 */

/** Every trigger the cinematics route accepts. Mirrors TRIGGERS in the route. */
export type CinematicTrigger =
  | "campaign_open"
  | "player_initiated"
  | "event_driven"
  | "dm_override"

/**
 * Which door this request goes through.
 *
 * A CUE IS NEVER AN OVERRIDE, whatever the DM Mode toggle says. That is the
 * whole fix: `dmMode` may escalate a deliberate press, and only a deliberate
 * press.
 */
export function triggerFor(opts: { dmMode: boolean; fromCue: boolean }): CinematicTrigger {
  if (opts.fromCue) return "event_driven"
  return opts.dmMode ? "dm_override" : "player_initiated"
}

/**
 * THE SEAT THAT CANNOT BE REMEMBERED.
 *
 * The server's once-per-character memory is keyed on a character id, and says
 * so honestly: `alreadySeen` returns false with no character, and `recordView`
 * declines to write a row it could never match again. Correct, and it leaves a
 * hole — a browser watching without a claimed seat (the DM's own window, most
 * of the time) is told "unseen" forever and replays every cue.
 *
 * There is nothing the server can key that on, so this browser remembers for
 * itself. Per-viewer, disposable, and never authoritative: the server's rule
 * still wins whenever there IS a character to hang it on. A deliberate DM
 * replay skips this exactly as it skips the server's check.
 */
export function shouldPlay(opts: {
  clipId: string
  /** The claimed character, or null for an unseated window. */
  characterId: string | null
  trigger: CinematicTrigger
  /** Clip ids this browser has already played while unseated. */
  playedHere: ReadonlySet<string>
}): boolean {
  // A deliberate override replays. That is what the toggle is for.
  if (opts.trigger === "dm_override") return true
  // With a seat, the server has already applied the real rule and would have
  // handed back nothing. Do not second-guess it.
  if (opts.characterId) return true
  return !opts.playedHere.has(opts.clipId)
}

/** Where the unseated browser keeps its list. One key, ids only. */
export const PLAYED_KEY = "aop-cinematics-played"

/** Read the list. Storage is allowed to be missing, full, or forbidden. */
export function readPlayed(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(PLAYED_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [])
  } catch {
    return new Set()
  }
}

/** Remember one more. Capped, because a session must not grow a list forever. */
export function rememberPlayed(clipId: string, played: Set<string> = readPlayed()): Set<string> {
  played.add(clipId)
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PLAYED_KEY, JSON.stringify(Array.from(played).slice(-200)))
    } catch {
      /* private window, or storage refused — the guard degrades, play continues */
    }
  }
  return played
}
