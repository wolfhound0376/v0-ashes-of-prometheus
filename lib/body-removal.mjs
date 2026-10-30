// THE DROW CLEAR THE PEN — the rules, pure, in one copy.
//
// Sam, 2026-10-30: "When someone is murdered by the drow they will eventually (two drow) drag the dead body out
// within two guard cycles." Asked how long a cycle is, because the map had never had one: "They should be at least
// 5 minutes each."
//
// Plain JavaScript for the same reason as lib/game-over.mjs and lib/buppido-rises.mjs: build_walk.py pastes this file
// into the painted map at its BODY_REMOVAL placeholder (minus `export`). Every name starts with BODY_REMOVAL_ or
// bodyRemoval so the paste cannot collide with the page's names.
//
// THERE WAS NO GUARD CYCLE BEFORE THIS. The only cadence at the pen gate is the watch's sweep (GATE_WATCH.sweep,
// 1800-3600 ms), which is how often a guard re-scans the bars — a glance, not a rotation. Nothing in the map modelled
// a shift. So the five minutes below is Sam defining the unit, not a number read off anything that already existed.
//
// SOURCES
//   [SAM 2026-10-30] two drow; the body goes out; within two guard cycles; a cycle is at least five minutes.
//   [SAM 2026-10-30] Buppido is the exception — his body stays, and what happens next is lib/buppido-rises.mjs.
//   [SOURCED] where it goes: Liana's order in The Drow Surgeon (Sam, 2026-10-25) is to take the body over the bridge
//             and into the falls. The body leaves the pen through the gate and does not come back.
//   [CLAUDE]  the walk and hoist timings, and the rule that the gate is open while they carry it.
//
// WHY IT MATTERS AT THE TABLE. Ten minutes is long enough that the corpse is a presence in the room — the party has to
// keep talking and planning with it lying there — and short enough that it does not become furniture. It also gives
// Buppido his tell: everyone else is carried out on a clock, so a body still lying there at minute eleven is the sign
// that something is wrong, before anything has happened.

export const BODY_REMOVAL_RULES = {
  plate: 11,             // the slave pen; the drow clear their own outpost, not the road
  cycleMs: 300000,       // ONE GUARD CYCLE: five minutes [SAM 2026-10-30]
  cycles: 2,             // "within two guard cycles" — so ten minutes from the death
  bearers: 2,            // "(two drow)"
  walkMs: 2600,          // in from the gate to the body
  hoistMs: 900,          // an end each
  carryMs: 3200,         // out again, with it between them
}

/** When the drow get round to this body. */
export function bodyRemovalDueAt(diedAtMs) {
  const R = BODY_REMOVAL_RULES
  return Number(diedAtMs || 0) + R.cycleMs * R.cycles
}

/**
 * Whose body do they leave?
 *
 * Buppido only [SAM 2026-10-30: "his body doesn't get dragged away like the rest"]. Heroes are not on this list on
 * purpose: a dead hero is the table's business, and a stone goes up where they fell (lib/game-over.mjs), so the drow
 * never touch them either — that is handled by only ever offering this NPC bodies.
 */
export function bodyRemovalSkips(id) {
  return String(id || "") === "buppido"
}

/** Is this body ready to go? */
export function bodyRemovalReady({ id, diedAt, plate, nowMs, taken = false } = {}) {
  if (taken || bodyRemovalSkips(id)) return false
  if (Number(plate) !== BODY_REMOVAL_RULES.plate) return false
  return Number(nowMs || 0) >= bodyRemovalDueAt(diedAt)
}

/** How long the whole removal takes once it starts, so a screen joining late can tell where in it we are. */
export function bodyRemovalTotalMs() {
  const R = BODY_REMOVAL_RULES
  return R.walkMs + R.hoistMs + R.carryMs
}
