/**
 * Is this bestiary row a real stat block, or a placeholder holding a slot?
 *
 * The Underdark expansion (2026-09-26) added rows for creatures no ingested
 * book carries — beholder, intellect devourer, troglodyte, deep rothé, death
 * knight, poltergeist, and the OotA random-table monsters (carrion crawler,
 * grell, piercer, umber hulk). Those rows have a sprite and every stat NULL,
 * marked `stats_status = 'needs_stats'`, until Sam fills them from Roll20.
 *
 * The rule was that such a row never reaches the board, but nothing enforced
 * it: the sandbox listed all of them, and spawning a beholder put a token on
 * the board with no hit points, which /api/combat then gave AC 10 by default.
 * Invented numbers, on the creature most likely to kill the party.
 *
 * Checked on hit points as well as the flag, so a row someone adds by hand
 * without setting stats_status is caught too. Not on AC: the Kenta and Fifi
 * rows are real (homebrew, the NPC turn uses them) and carry HP with no AC.
 */
export type StatsCheckRow = {
  stats_status?: string | null
  hp?: number | null
  ac?: number | null
}

export function hasPlayableStats(row: StatsCheckRow | null | undefined): boolean {
  if (!row) return false
  if (row.stats_status === "needs_stats") return false
  return typeof row.hp === "number"
}

export const NEEDS_STATS_MESSAGE =
  "no stat block yet — this creature is a placeholder until its stats are filled in the bestiary"
