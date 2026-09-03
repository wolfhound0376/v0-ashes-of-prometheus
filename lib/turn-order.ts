// ============================================================================
// TURN ORDER — whose turn is next, when some of them are dead.
//
// THE BUG THIS EXISTS FOR, from the log of Sam's first sandbox trial:
//
//   23:17:32  Kenta casts Ray of Frost … Drow Elite Warrior goes down.
//   23:19:02  Drow Elite Warrior lies still.
//   23:20:20  Drow Elite Warrior lies still.
//   23:21:12  Drow Elite Warrior lies still.
//   23:22:11  Drow Elite Warrior lies still.
//   23:23:00  Drow Elite Warrior lies still.
//
// Six rounds after it died, the drow was still being dealt a turn, and still
// answering. So was Fifi, who had been killed outright: "Fifi of Copperas
// Cove lies dead." once a round, forever. Nothing was WRONG with either
// line — the handlers say exactly the right thing about a body. The mistake
// was asking a body anything at all.
//
// SRD 5.1, Combat: initiative is the order of "every participant". A creature
// that is dead has stopped participating. It keeps its square — the body is
// still terrain, still cover, still something to step around — but the order
// walks past it.
//
// WHAT IS NOT SKIPPED, and this is the whole subtlety: a character who is
// DYING is not dead. They are at 0, unconscious, and rolling a death save
// every single turn. That roll IS their turn, it is how they come back, and
// skipping it would quietly strand a downed friend at zero forever. In the
// same log, Samson rolls three saves across three rounds and stabilises —
// exactly what must keep happening.
//
//   dead    → skipped
//   dying   → keeps its turn, and rolls
//   stable  → keeps its turn (still unconscious, but the fiction says so)
//
// This file decides only WHERE THE INDEX GOES. It has no idea what dead
// means; the caller passes that in. That keeps the arithmetic — which is
// where the round-counting bug lives — testable on its own.
// ============================================================================

export interface Advance {
  /** The index whose turn it now is. */
  index: number
  /**
   * How many times the order wrapped past the top getting there.
   *
   * Normally 0 or 1. It is NOT always "1 when index === 0", which is the
   * trap: if the first combatant in the order is a corpse, the turn lands on
   * index 1 having still crossed into a new round. Counting the crossing
   * rather than the landing is what keeps the round number, the end-of-round
   * world step and the summon expiry honest.
   */
  roundsCrossed: number
  /**
   * True when every combatant was dead and the order has nobody to give the
   * turn to.
   *
   * A real answer, not an error: it is what the end of a total party kill
   * looks like, and the caller has to decide whether that ends the fight
   * rather than being handed an index into a graveyard.
   */
  exhausted: boolean
}

/**
 * The next index that belongs to something still participating.
 *
 * `isDead(i)` is asked about candidates only — never about `from` — because
 * the combatant whose turn is ending may well have just died in it, and that
 * has no bearing on who goes next.
 */
export function advanceTurn(opts: {
  from: number
  count: number
  isDead: (index: number) => boolean
}): Advance {
  const { from, count, isDead } = opts
  if (count <= 0) return { index: 0, roundsCrossed: 0, exhausted: true }

  let roundsCrossed = 0
  let index = from
  // At most `count` steps: one full lap proves there is nobody left, and
  // bounding it is what stops a board of corpses spinning forever.
  for (let step = 0; step < count; step++) {
    const next = index + 1
    if (next >= count) roundsCrossed += 1
    index = next % count
    if (!isDead(index)) return { index, roundsCrossed, exhausted: false }
  }
  // Everybody is dead. Report where the walk ended and how far the round
  // counter moved, so a caller that ends the fight still writes a coherent
  // final state rather than one that contradicts the log above it.
  return { index, roundsCrossed, exhausted: true }
}
