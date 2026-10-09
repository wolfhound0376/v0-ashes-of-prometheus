// Opportunity attacks — the rule that makes position cost something.
//
// Sam, 2026-10-09, on getting combat closer to BG3. Before this, movement was
// free: nothing punished walking away from a drow, so there was no cost to
// standing anywhere, so the grid was decoration. This is the one rule that
// turns it into a board.
//
// SRD: "You can make an opportunity attack when a hostile creature that you
// can see moves out of your reach. To make the opportunity attack, you use
// your reaction to make one melee attack against the provoking creature. The
// attack occurs right before the creature leaves your reach."
//
// Pure. No Supabase, no THREE, no fetch — the route hands it plain numbers and
// gets back a list of who gets to swing. That is what makes it testable, and
// the rule is fiddly enough to want tests.
//
// FOUR THINGS WORTH KNOWING BEFORE CHANGING ANY OF THIS:
//
// 1. `reacted` IS NOT STORED ON `turn_state`. It cannot be: `turn_state` holds
//    the ACTIVE combatant's economy and is replaced wholesale on every turn
//    change, but an opportunity attack is spent by someone whose turn it is
//    NOT. The ledger therefore lives on the `turn_order` entries, which are
//    already jsonb and already per-combatant — so this ships with no schema
//    change. See `clearReactionAtTurnStart` for the regain rule.
//
// 2. TRUE MEANS SPENT. `turn_state.reaction === true` means the reaction is
//    GONE, not available — the column default is all-false and the HUD reads
//    `econ.reaction ? "spent" : "lit"`. The field names read like capabilities
//    and behave like receipts. This module uses `reacted` precisely so that
//    nobody has to remember which way round it is.
//
// 3. THE SERVER ONLY SEES ENDPOINTS. The move handler receives a start square,
//    a destination and a feet cost — not the path. So a move that leaves a
//    drow's reach and loops back into it provokes nothing here, where a table
//    would charge for it. Flagged rather than hidden: catching it needs the
//    client to send the path, which is a bigger change and a separate idea.
//    `provokers` takes `from`/`to` and nothing else precisely so that handing
//    it real path steps later is an additive change.
//
// 4. REACH IS MEASURED IN SQUARES, CHEBYSHEV. The board is a 5-ft square grid
//    with diagonals costing 5 ft (the project's existing movement maths), so
//    "within 5 ft" is Chebyshev distance <= 1, and a 10-ft reach is <= 2.

/** One creature, narrowed to what the opportunity rule actually reads. */
export interface OaCombatant {
  token_id: string
  grid_x: number
  grid_y: number
  /** `hostile` or `friendly`, as `campOf()` in lib/combat-start.ts produces. */
  camp: string
  /** Melee reach in feet. 5 for almost everything; 10 for a glaive or a Large brute. */
  reach_ft: number
  /** Reaction already spent since this creature's last turn began. */
  reacted: boolean
  /** Unconscious, paralyzed, stunned, petrified — anything that forbids reactions. */
  incapacitated: boolean
  /** False when blinded, or the mover is invisible/unseen. The SRD requires sight. */
  can_see: boolean
}

export interface Square {
  grid_x: number
  grid_y: number
}

/** Chebyshev distance in FEET, at 5 ft per square. Diagonals cost 5, as the board already plays them. */
export function distanceFt(a: Square, b: Square): number {
  return Math.max(Math.abs(a.grid_x - b.grid_x), Math.abs(a.grid_y - b.grid_y)) * 5
}

/** Is `square` inside this creature's melee reach? */
export function withinReach(watcher: OaCombatant, square: Square): boolean {
  const reach = Number.isFinite(watcher.reach_ft) && watcher.reach_ft > 0 ? watcher.reach_ft : 5
  return distanceFt(watcher, square) <= reach
}

export interface ProvokeArgs {
  /** The creature doing the moving. Its own camp decides who counts as hostile. */
  mover: Pick<OaCombatant, "token_id" | "camp">
  from: Square
  to: Square
  /** Everyone else on the board. The mover may appear here and is ignored. */
  others: OaCombatant[]
  /** True when the mover took the Disengage action this turn. */
  disengaged?: boolean
}

/**
 * Who gets to swing at this move.
 *
 * Returns the watchers in board order — the caller resolves them in sequence.
 * An empty list is the overwhelmingly common case and costs one pass.
 */
export function provokers(args: ProvokeArgs): OaCombatant[] {
  // Disengage is the whole point of the action: it buys immunity for the turn.
  if (args.disengaged) return []

  // Standing still never provokes, and neither does a move that ends where it
  // started. Cheap guard, and it keeps a zero-distance "move" from charging a
  // reaction that a table would never charge.
  if (args.from.grid_x === args.to.grid_x && args.from.grid_y === args.to.grid_y) return []

  const out: OaCombatant[] = []
  for (const w of args.others) {
    if (w.token_id === args.mover.token_id) continue
    if (w.camp === args.mover.camp) continue // allies do not swing at you
    if (w.reacted) continue
    if (w.incapacitated) continue
    if (!w.can_see) continue
    // THE RULE, in one line: you provoke by LEAVING reach, not by moving
    // inside it. Circling a drow at arm's length is free; stepping back is not.
    if (withinReach(w, args.from) && !withinReach(w, args.to)) out.push(w)
  }
  return out
}

// ---------------------------------------------------------------- the ledger

/** A `turn_order` entry, narrowed to the fields the reaction ledger touches. */
export interface TurnOrderEntry {
  token_id: string
  kind?: string
  /**
   * The round in which this creature spent its reaction. Absent means it still
   * has one. A round number rather than a boolean so that a stale flag from an
   * earlier round can never silently disarm a creature for the rest of a fight.
   */
  reacted_round?: number | null
}

/** Has this creature already spent its reaction in the round now being played? */
export function hasReaction(entry: TurnOrderEntry | undefined, round: number): boolean {
  if (!entry) return false
  return entry.reacted_round !== round
}

/** Mark one creature's reaction as spent for this round. Returns a new array. */
export function spendReaction(
  order: TurnOrderEntry[],
  token_id: string,
  round: number,
): TurnOrderEntry[] {
  return order.map((e) => (e.token_id === token_id ? { ...e, reacted_round: round } : e))
}

/**
 * The regain rule. SRD: "You regain a spent reaction at the start of each of
 * your turns."
 *
 * So this is called when a creature's turn BEGINS, not at the top of a round —
 * those are different moments, and using the round boundary would hand a
 * creature acting late in the order a reaction it had already used moments
 * before.
 */
export function clearReactionAtTurnStart(
  order: TurnOrderEntry[],
  token_id: string,
): TurnOrderEntry[] {
  return order.map((e) => (e.token_id === token_id ? { ...e, reacted_round: null } : e))
}

/**
 * Conditions that forbid a reaction, and therefore an opportunity attack.
 *
 * SRD: "An incapacitated creature can't take actions or reactions." The other
 * four each say in their own entry that the creature is incapacitated, so they
 * are listed explicitly rather than inferred — a stunned drow that keeps
 * swinging because nobody expanded the word is the kind of bug that reads as
 * the AI cheating.
 *
 * Prone is deliberately absent: a prone creature may still take its reaction,
 * and an opportunity attack from the floor is legal.
 */
const NO_REACTION = new Set([
  "incapacitated",
  "paralyzed",
  "petrified",
  "stunned",
  "unconscious",
])

export function forbidsReactions(conditions: readonly string[] | null | undefined): boolean {
  for (const c of conditions ?? []) {
    if (NO_REACTION.has(String(c).trim().toLowerCase())) return true
  }
  return false
}
