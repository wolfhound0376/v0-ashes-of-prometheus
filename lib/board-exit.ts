/**
 * LEAVING THE BOARD IS NAVIGATION, NOT A GAME ACTION.
 *
 * Sam got trapped on the battle board: End Combat did nothing and ← SCENE
 * bounced him straight back. Two separate mechanisms conspired, and both are
 * fixed by the rules in this file.
 *
 * The dashboard sends the DM to the board when a fight breaks out. It decided
 * that by comparing "is there a fight now" against a ref that was seeded
 * `false` on every mount — so ARRIVING on the dashboard looked identical to a
 * fight starting while you sat there, and the redirect fired on arrival. The
 * escape hatch (a sessionStorage flag set by ← SCENE) was cleared by the very
 * first render, before the NPC roster had loaded: an empty roster reads as
 * "no fight", which is the condition that deletes the flag. So the flag was
 * gone by the time the data landed and the redirect fired anyway. Deterministic,
 * not a race — the door was locked every time.
 *
 * The rule below is the fix: **an arrival is not a transition.** The redirect
 * belongs to the moment a fight starts under your eyes, and there is no such
 * moment on the first look at a screen you just opened.
 */

/** What the last look at the roster said. `null` means we have not looked yet. */
export type PriorCombat = boolean | null

export type RedirectInput = {
  /** Is a fight running right now, as far as this screen can tell? */
  inCombat: boolean
  /** What the previous render saw. `null` on the first observation. */
  previous: PriorCombat
  /** Only the DM's browser gets yanked to the board. */
  isDm: boolean
  /** Did this browser just walk off the board on purpose? */
  leftDeliberately: boolean
}

/**
 * Should this browser be sent to the battle board?
 *
 * Only when a fight BEGINS while this screen is already open. Four gates, and
 * every one of them has a reason:
 *
 *  - not the DM: players stay on their sheets; a fight starting must not tear
 *    four people away from what they were reading.
 *  - left deliberately: the DM pressed ← SCENE. Honour it. Overriding a
 *    person's own navigation is how you build a room with no door.
 *  - first observation: arriving somewhere is not an event happening there.
 *    This is the gate that was missing.
 *  - already in combat last time: the redirect fires once per fight, not on
 *    every re-render for as long as the fight lasts.
 */
export function shouldRedirectToBoard(a: RedirectInput): boolean {
  if (!a.isDm) return false
  if (a.leftDeliberately) return false
  if (a.previous === null) return false
  return a.inCombat && !a.previous
}

/**
 * Has the "I left on purpose" mark served its purpose?
 *
 * It is dropped when the fight it was protecting against is genuinely over, so
 * the NEXT fight redirects normally. It must NOT be dropped merely because
 * this render cannot see a fight — an unloaded roster looks exactly like peace,
 * and clearing on that is what disarmed the flag before the redirect ran.
 * `observed` is the caller's promise that it has actually looked.
 */
export function shouldForgetDeliberateExit(inCombat: boolean, observed: boolean): boolean {
  return observed && !inCombat
}
