// ============================================================================
// SNEAK ATTACK — the rogue's feature, which her sheet has claimed all along.
//
// Fifi's `sheet_features` carries this, verbatim, from PHB-2024 p.129:
//
//   "Once per turn you can deal an extra 1d6 damage to one creature you hit
//    with an attack if you have Advantage on the roll and the attack uses a
//    Finesse or Ranged weapon. You don't need Advantage if an ally is within
//    5 ft. of the target, the ally isn't Incapacitated, and you don't have
//    Disadvantage."
//
// The engine had never read it. The damage was never rolled, the sound in the
// bucket was never played, and the only trace of the feature anywhere in the
// code was a tooltip string. This module is the rule; the route is the wiring.
//
// WHY IT IS ITS OWN FILE. The condition is four ANDed clauses and a per-turn
// latch, and every one of them is a place to be quietly wrong. Pure in, pure
// out, no Supabase, no rolling — so it can be tested exhaustively without a
// database and without a fight.
// ============================================================================

/** Where a square is, in grid units. */
export interface Cell {
  x: number
  y: number
}

export interface SneakAttackQuery {
  /** The attacker's class, free text off the sheet. */
  attackerClass: string | null | undefined
  attackerLevel: number | null | undefined
  /** Did the attack land at all? No hit, no sneak attack. */
  hit: boolean
  /** From DerivedAttack. A fist is neither. */
  weaponFinesse: boolean
  weaponRanged: boolean
  /** Already spent this turn — the latch lives in combat_state.turn_state. */
  alreadyUsedThisTurn: boolean
  /**
   * True when the attacker has Advantage. Currently ALWAYS false, because the
   * combat route rolls one d20 and has no notion of advantage at any of its
   * five roll sites. Taken as a parameter rather than hardcoded so that the
   * day advantage arrives, this file needs no edit — and so the gap is
   * visible here rather than hidden in a missing branch.
   */
  hasAdvantage?: boolean
  /** Where the victim stands. */
  target: Cell
  /**
   * Everyone else on the map who is on the ATTACKER's side, alive and
   * visible. The caller filters; this only measures.
   */
  allies: Cell[]
}

export interface SneakAttackVerdict {
  applies: boolean
  /** "2d6" — what to roll. Empty when it does not apply. */
  dice: string
  /** Why not, for the log and for anyone reading a bug report. */
  reason: string
}

/**
 * How many d6, by rogue level. PHB: 1d6 at level 1, and another every two
 * levels after — so ceil(level / 2), which is 1d6 at 1-2, 2d6 at 3-4, and so
 * on to 10d6 at 19-20.
 */
export function sneakDice(level: number): number {
  return Math.max(1, Math.ceil(Math.max(1, level) / 2))
}

/** Chebyshev, in squares. 5e diagonals cost the same as orthogonals. */
const squares = (a: Cell, b: Cell) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

/**
 * "an ally is within 5 ft. of the target" — one square, diagonals included.
 *
 * The ATTACKER is not an ally of themselves and must not be counted: a rogue
 * standing next to her own target would otherwise qualify for every single
 * attack she ever made, which is the whole feature given away. The caller
 * excludes her by id before handing the list over, and this is the note
 * saying why that matters.
 */
function allyAdjacentToTarget(target: Cell, allies: Cell[]): boolean {
  return allies.some((a) => squares(a, target) <= 1)
}

/** Is this a rogue? `characters.class` is free text and multiclass strings happen. */
function isRogue(cls: string | null | undefined): boolean {
  return /\brogue\b/i.test(cls ?? "")
}

export function sneakAttackFor(q: SneakAttackQuery): SneakAttackVerdict {
  const no = (reason: string): SneakAttackVerdict => ({ applies: false, dice: "", reason })

  if (!q.hit) return no("the attack missed")
  if (!isRogue(q.attackerClass)) return no("not a rogue")
  if (q.alreadyUsedThisTurn) return no("already used this turn")
  if (!q.weaponFinesse && !q.weaponRanged) return no("not a finesse or ranged weapon")

  // The two routes into it. Advantage is the first clause in the book and the
  // one this engine cannot yet answer, so in practice everything arrives
  // through the second.
  const viaAdvantage = q.hasAdvantage === true
  const viaAlly = allyAdjacentToTarget(q.target, q.allies)
  if (!viaAdvantage && !viaAlly) return no("no advantage and no ally beside the target")

  const n = sneakDice(q.attackerLevel ?? 1)
  return {
    applies: true,
    dice: `${n}d6`,
    reason: viaAdvantage ? "advantage" : "an ally has them occupied",
  }
}
