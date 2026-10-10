// Shove and Jump — the "can I just…?" verbs.
//
// Tier 3 of the Octopath/BG3 plan. BG3's tactical texture is not really its
// spell list; it is that the obvious physical idea usually works. You can push
// someone off a ledge. You can jump a gap. Both are plain SRD, both were
// missing here, and both are cheap.
//
// The sandbox map already makes the first one pay off: Sam ruled the Underdark
// river rapids difficult terrain on 2026-09-27, so shoving a drow into them is
// a real tactical act rather than a flourish.
//
// Pure. The contest rolls through `resolveSkillCheck` from lib/game-context so
// a shove shows its arithmetic the way every other check in this project does
// — "d20(14) + STR(+3) + proficient(+2) = 19 vs DC 15" — rather than inventing
// a second, quieter way to roll dice.

import {
  resolveSkillCheck,
  type CheckResult,
  type Rng,
  type SheetSlice,
} from "./game-context"

// ------------------------------------------------------------------- size

/** SRD size categories, smallest first. */
export const SIZE_ORDER = ["tiny", "small", "medium", "large", "huge", "gargantuan"] as const
export type Size = (typeof SIZE_ORDER)[number]

export function sizeRank(raw: string | null | undefined): number {
  const i = SIZE_ORDER.indexOf(String(raw ?? "medium").trim().toLowerCase() as Size)
  return i === -1 ? 2 : i // unknown reads as Medium rather than throwing
}

/**
 * SRD, Shoving a Creature: "The target must be no more than one size larger
 * than you."
 *
 * One step is allowed, two is not. A Medium rogue may shove a Large quaggoth
 * (2 -> 3); a Small gnome may not (1 -> 3). Spelled out because the off-by-one
 * decides whether Fifi can shove a hook horror — she cannot — and an
 * inclusive/exclusive slip here would quietly hand the party a verb the book
 * does not give them.
 */
export function canShoveSize(shoverSize: string | null, targetSize: string | null): boolean {
  return sizeRank(targetSize) - sizeRank(shoverSize) <= 1
}

// ------------------------------------------------------------------ shove

export type ShoveOutcome = "prone" | "push"

export interface ShoveResult {
  /** Did the shove land? */
  success: boolean
  outcome: ShoveOutcome
  attacker: CheckResult
  defender: CheckResult
  /** Where the target ends up. Unchanged on a failure or a knock-down. */
  to: { grid_x: number; grid_y: number }
  /** True when the defender chose Acrobatics over Athletics. */
  defendedWithAcrobatics: boolean
  narration: string
}

export interface ShoveArgs {
  shover: SheetSlice & { size?: string | null }
  target: SheetSlice & { size?: string | null }
  from: { grid_x: number; grid_y: number }
  /** The target's square. The push direction is away from the shover, along this line. */
  targetAt: { grid_x: number; grid_y: number }
  outcome: ShoveOutcome
  rng: Rng
  /** Board bounds, so a push cannot leave the map. */
  width: number
  height: number
  /** Squares the target cannot be pushed into — walls, bodies, blocking props. */
  blocked?: Set<string>
}

/**
 * One square directly away from the shover.
 *
 * Sign of the delta only, so a diagonal shove pushes diagonally and a straight
 * one pushes straight. A target somehow on the shover's own square is pushed
 * nowhere rather than to NaN.
 */
export function pushSquare(
  from: { grid_x: number; grid_y: number },
  targetAt: { grid_x: number; grid_y: number },
): { grid_x: number; grid_y: number } {
  const dx = Math.sign(targetAt.grid_x - from.grid_x)
  const dy = Math.sign(targetAt.grid_y - from.grid_y)
  return { grid_x: targetAt.grid_x + dx, grid_y: targetAt.grid_y + dy }
}

/**
 * SRD, Shoving a Creature: "...you make a Strength (Athletics) check contested
 * by the target's Strength (Athletics) or Dexterity (Acrobatics) check (the
 * target chooses the ability to use). You succeed if you win the contest."
 *
 * THE TARGET CHOOSES, and this picks the better of the two for them rather
 * than asking — the choice is never interesting (you always pick your higher
 * modifier) and a prompt for it would stall a fight for nothing. Both rolls
 * are kept in the result so the log can show the contest honestly.
 *
 * Ties go to the DEFENDER: SRD, Contests — "If the contest results in a tie,
 * the situation remains the same as it was before the contest." Nothing moves.
 */
export function resolveShove(args: ShoveArgs): ShoveResult {
  // A contest is two checks against each other, so each is rolled against a
  // nominal DC of 0 and only the totals are compared. Passing the opposing
  // total as the DC instead would be the same arithmetic but would print a
  // "vs DC 17" that no rule ever set.
  const attacker = resolveSkillCheck(args.shover, "athletics", 0, args.rng)
  const athletics = resolveSkillCheck(args.target, "athletics", 0, args.rng)
  const acrobatics = resolveSkillCheck(args.target, "acrobatics", 0, args.rng)
  const useAcro = acrobatics.total > athletics.total
  const defender = useAcro ? acrobatics : athletics

  const sizeOk = canShoveSize(args.shover.size ?? null, args.target.size ?? null)
  const won = attacker.total > defender.total
  const success = sizeOk && won

  let to = args.targetAt
  if (success && args.outcome === "push") {
    const candidate = pushSquare(args.from, args.targetAt)
    const off =
      candidate.grid_x < 0 ||
      candidate.grid_y < 0 ||
      candidate.grid_x >= args.width ||
      candidate.grid_y >= args.height
    const into = args.blocked?.has(`${candidate.grid_x},${candidate.grid_y}`)
    // A shove into a wall is still a successful shove — the target simply has
    // nowhere to go. It is NOT silently converted into a knock-down: that
    // would be inventing a rule, and the log would lie about what happened.
    if (!off && !into) to = candidate
  }

  const name = args.shover.name
  const them = args.target.name
  const narration = !sizeOk
    ? `${name} cannot shove ${them} — too large by more than one size.`
    : !won
      ? `${name} tries to shove ${them} and fails. [${attacker.arithmetic} vs ${defender.arithmetic}]`
      : args.outcome === "prone"
        ? `${name} knocks ${them} prone. [${attacker.arithmetic} vs ${defender.arithmetic}]`
        : to === args.targetAt
          ? `${name} shoves ${them}, but there is nowhere to give. [${attacker.arithmetic} vs ${defender.arithmetic}]`
          : `${name} shoves ${them} back 5 ft. [${attacker.arithmetic} vs ${defender.arithmetic}]`

  return { success, outcome: args.outcome, attacker, defender, to, defendedWithAcrobatics: useAcro, narration }
}

// ------------------------------------------------------------------- jump

export interface JumpResult {
  /** Horizontal distance in feet this creature can clear. */
  longFt: number
  /** Vertical reach in feet. */
  highFt: number
  /** True when the jump was made without a 10-ft run-up, halving the long jump. */
  standing: boolean
  narration: string
}

/**
 * SRD, Movement: Jumping.
 *
 * Long jump: "you can leap a number of feet up to your Strength score if you
 * move at least 10 feet on foot immediately before the jump. When you make a
 * standing long jump, you can leap only half that distance."
 *
 * High jump: "you leap into the air a number of feet equal to 3 + your
 * Strength modifier."
 *
 * Note it is the strength SCORE for the long jump and the MODIFIER for the
 * high jump — the single most commonly mangled pair of numbers in the rule,
 * and the reason this takes a score rather than a modifier and derives the
 * other itself.
 */
export function resolveJump(args: {
  name: string
  strengthScore: number
  /** Did they move at least 10 ft on foot immediately before? */
  runUp: boolean
}): JumpResult {
  const score = Number.isFinite(args.strengthScore) ? Math.max(1, args.strengthScore) : 10
  const mod = Math.floor((score - 10) / 2)
  const longFt = args.runUp ? score : Math.floor(score / 2)
  // "3 + your Strength modifier" can go to zero or below for a feeble
  // creature; the floor is 0, not a negative leap.
  const highFt = Math.max(0, 3 + mod)
  return {
    longFt,
    highFt,
    standing: !args.runUp,
    narration: `${args.name} can clear ${longFt} ft across${args.runUp ? "" : " from standing"} and ${highFt} ft up.`,
  }
}

/** Jumping costs movement foot for foot — SRD: "Each foot you clear costs a foot of movement." */
export const jumpCostFt = (distanceFt: number) => Math.max(0, Math.ceil(distanceFt))
