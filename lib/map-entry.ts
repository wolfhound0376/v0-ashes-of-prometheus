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
