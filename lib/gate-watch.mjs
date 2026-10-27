// THE PEN GATE WARNING — the rule, pure, in one copy.
//
// Sam, 2026-10-27: "When someone approaches the gate and is warned don't automatically kill someone. That only
// happens if the warning is not heeded or more than 10 seconds have passed since the initial warning."
//
// The bug this replaces (measured on a headless copy of the map, 2026-10-27): the guard warns Kenta at the bars, the
// player clicks "Step back", and 0.8 s later Derendil is shot dead and the volleys begin. "Step back" opened a
// "came back too soon" window, and on the very next frame Kenta was still standing at the bars — he had not walked
// away yet — so the watch read it as coming back and fired.
//
// The rule now. A warning starts a clock. The guards shoot ONLY when:
//   1. the warning is not heeded — "Stay where you are", or the hero gets away from the bars and then comes back
//      while the warning still stands (GATE_RULES.againMs); or
//   2. more than GATE_RULES.graceMs (10 s) have passed since the warning and the hero is still at the bars — whether
//      the card was never answered or they said "Step back" and never actually left.
// Walking away from the bars inside those 10 s is heeding it. Nothing is ever fired on the frame the warning is
// answered.
//
// Plain JavaScript for the same reason as lib/drow-surgeon.mjs: build_walk.py pastes this file into the painted map
// at its GATE_WATCH placeholder (minus `export`), so the map and lib/gate-watch.test.ts read the SAME function. Every
// name here starts with GATE_RULES or gateRule so the paste cannot collide with the page's own names.

export const GATE_RULES = {
  graceMs: 10000,   // Sam: 10 seconds from the warning to get away from the bars
  againMs: 20000,   // how long the warning stands: coming back to the bars inside it is not heeding it
}

/**
 * One look by the watch. `w` is the warning on record (or null), `at` whether that hero is at the bars and seen by a
 * guard, `t` the game clock in ms. Returns the warning to keep and what the guards do now:
 *   "warn"  — a fresh warning (the card goes up, the clock starts)
 *   "shoot" — not heeded, or out of time
 *   "wait"  — the clock is running; leave them be
 *   "none"  — nothing to do
 * Warning shapes: {stage: "warned", at} while unanswered · {stage: "stepped", at, left} after "Step back".
 * `at` is always the time of the INITIAL warning; answering the card never resets it.
 */
export function gateRuleStep(w, at, t) {
  if (w && w.stage === "stepped" && t - w.at > GATE_RULES.againMs && (w.left || !at)) w = null   // the warning has lapsed: a new approach is warned afresh
  if (!w) return at ? { w: { stage: "warned", at: t }, act: "warn" } : { w: null, act: "none" }
  const late = t - w.at > GATE_RULES.graceMs
  if (w.stage === "warned") {
    if (late) return at ? { w: null, act: "shoot" } : { w: { stage: "stepped", at: w.at, left: true }, act: "none" }
    return { w, act: "wait" }
  }
  // stepped: they said they would go
  if (!at) return { w: w.left ? w : { ...w, left: true }, act: "none" }   // away from the bars: heeded
  if (w.left) return { w: null, act: "shoot" }                           // got away, then came back: not heeded
  if (late) return { w: null, act: "shoot" }                             // still at the bars 10 s after the warning
  return { w, act: "wait" }                                              // still walking away
}
