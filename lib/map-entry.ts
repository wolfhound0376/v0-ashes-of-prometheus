// THE GAME STARTS ON THE MAP (Sam, 2026-10-25): "When starting a new game or entering it, you always
// start at the pixel map plate vs the dashboard UI."
//
// The dashboard ("/") is where you talk; the painted pixel map is where you are. So the first time a
// browser session lands on "/" it is sent to the map, and only after that does "/" mean the dashboard
// (coming back from the map, the camp, a talk, the bench). The rule is pure so it can be tested; the
// dashboard page applies it with sessionStorage.
//
// Only Velkynvelve is walkable today, so the map is /velkynvelve. When more places become walkable this
// is the one function to teach where the party actually stands (party_situation.place).

export const MAP_HOME = "/velkynvelve"

/** The session flag: set once this browser session has entered the game (on the map or anywhere after). */
export const ENTERED_KEY = "aop_entered_game"

/** Where the map is, carrying the rehearsal flag so a sandbox stays a sandbox across the map and back. */
export function mapHref(sandbox: boolean): string {
  return sandbox ? `${MAP_HOME}?sandbox=1` : MAP_HOME
}

/**
 * Should this arrival at "/" go to the map instead of the dashboard?
 *
 * Yes only for a genuine entry: nothing in the address says the player is coming back from somewhere
 * in the game, and this browser session has not entered yet. `?dash=1` is the explicit "I want the
 * dashboard" door (e.g. a DM link) and always stays.
 */
export function shouldEnterOnMap(params: URLSearchParams, enteredThisSession: boolean): boolean {
  if (enteredThisSession) return false
  if (params.get("dash") === "1") return false
  // Coming back from in-game places or opening a specific window: those are not entries.
  for (const key of ["from", "talk", "bench", "view", "c", "k"]) if (params.get(key)) return false
  return true
}

// THE RUINS SURVIVE THE DOOR (Sam, 2026-11-23: "I entered the ruins and it took me here" — at The Table, being asked for
// his words). The road's Enter (and the travel map's Ruins card) go to /velkynvelve?ruins=1; the map's gate sends a browser
// that is not seated on to /table, and that bounce dropped the address, so after coming in through the door the player
// stood in the ordinary game with no Ruins. The gate now remembers where the browser was going (this tab only), The
// Table says so, and the first time the map lets that browser in it is put back on its way.

/** Where this tab was going when the door stopped it: {q: "?ruins=1&from=map", at: ms}. sessionStorage, so one tab. */
export const DOOR_NEXT_KEY = "aop_door_next"
/** A remembered way in is good for this long; after that the player meant something else. */
export const DOOR_NEXT_MS = 30 * 60 * 1000

/** What to remember when the gate turns this arrival away: only the Ruins' way in is worth keeping. Null = nothing. */
export function doorIntent(params: URLSearchParams, now: number): string | null {
  if (params.get("ruins") !== "1") return null
  const q = new URLSearchParams({ ruins: "1" })
  if (params.get("from") === "map") q.set("from", "map")
  return JSON.stringify({ q: `?${q}`, at: now })
}

/** The query to put back on the map's address once the gate lets the browser in. Null = nothing owed (or too old). */
export function doorResume(stored: string | null, params: URLSearchParams, now: number): string | null {
  if (!stored || params.get("ruins")) return null
  try {
    const v = JSON.parse(stored) as { q?: unknown; at?: unknown }
    if (typeof v.q !== "string" || typeof v.at !== "number") return null
    if (now - v.at > DOOR_NEXT_MS || now < v.at) return null
    return /^\?ruins=1(&from=map)?$/.test(v.q) ? v.q : null
  } catch { return null }
}

/** Is a way into the Ruins being held for this tab? (The Table reads this to say why the player is standing there.) */
export function doorWaiting(stored: string | null, now: number): boolean {
  return doorResume(stored, new URLSearchParams(), now) !== null
}
