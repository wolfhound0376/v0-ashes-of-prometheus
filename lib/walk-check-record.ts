// ============================================================================
// WALK ROLLS → THE EARNED-PROFICIENCY LEDGER
//
// Found 2026-10-30, surveying for the check-system work: the game has THREE
// roll paths, and only two of them reach the ledger.
//
//   1. Malachar's tag   [[1d20+7 | stealth | DC 15]]
//        → roll_requests → /api/rolls/resolve → applyAcceptedRoll
//   2. Exploration      resolveInteraction (lib/game-context)
//        → fromCheckResult → applyResolvedCheck
//   3. THE UNDERWALK    lib/walk-roll.ts WALK_ACTIONS → the dashboard dice
//        → walk-roll-bridge → ... nothing.
//
// Path 3 is where the game is actually played now: the pen gate, pickpocketing,
// the labor details, the falls, Ilvara's chest. It carries everything the
// ledger wants — a closed registry with the skill, the DC and its source, and
// a kept d20 face — and threw all of it away. The live numbers say so: 50
// roll_requests rows against ONE skill_progress row.
//
// So earned proficiency (docs/claude_Earned_Proficiency.md, Sam's call
// 2026-09-26) has been built and unreachable. Its stated prerequisite — "roll
// requests must carry skill + DC" — was met on 2026-09-26 for path 1 and never
// for path 3. This file is the missing adapter: a WALK_ACTIONS roll becomes the
// same ResolvedCheck the other two paths produce, so one tally counts all three.
//
// WHAT DOES NOT COUNT, and why:
//   - tool checks (thieves' tools, cook's utensils) and plain ability checks
//     have no SRD skill. The ladder awards SKILL proficiency; there is no rung
//     for a tool. They return null rather than being forced onto a skill.
//   - the registry's DC rides along as-is. recordCheck applies the homebrew
//     rules (practice needs DC >= min_dc, one success per stake per campaign
//     day, a natural 20 counts at any DC); nothing is re-judged here.
// ============================================================================

import type { ResolvedCheck } from "@/lib/skill-progress"
import type { Skill } from "@/lib/game-context"
import { WALK_ACTIONS, type WalkActionKey } from "@/lib/walk-roll"

/** What the bridge knows once the dice have settled. */
export interface WalkRollOutcome {
  characterId: string
  action: WalkActionKey
  /** The KEPT d20 face — under advantage/disadvantage, the one that counted. */
  natural: number
  total: number
  campaignDay: number
}

/**
 * The stake this roll was against. The action key is already the stake: the pen
 * gate is one stake, a labor water haul another, and pickpocketing a mark with
 * passive 12 the same stake as one with passive 14 (it is the same act). So the
 * pickpocket rows collapse to one key — otherwise a thief could bank eight
 * "fresh" successes in a day by picking marks with different eyesight.
 */
export function walkStakeKey(action: WalkActionKey): string {
  return action.startsWith("pickpocket:pp") ? "walk:pickpocket" : `walk:${action}`
}

/**
 * A settled walk roll as the earned-proficiency ledger reads it, or null when
 * the check was not a skill check (a tool or a bare ability).
 */
export function walkResolvedCheck(outcome: WalkRollOutcome): ResolvedCheck | null {
  const action = WALK_ACTIONS[outcome.action]
  if (!action) return null
  if (action.check.kind !== "skill") return null

  return {
    characterId: outcome.characterId,
    skill: action.check.skill as Skill,
    dc: action.dc,
    keptDie: outcome.natural,
    total: outcome.total,
    campaignDay: outcome.campaignDay,
    stakeKey: walkStakeKey(outcome.action),
    rollRequestId: null,
  }
}
