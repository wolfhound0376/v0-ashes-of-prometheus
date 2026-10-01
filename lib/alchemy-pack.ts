// Pure helpers for the player's view of the bench (app/api/alchemy/pack).
// Kept out of the route so the one rule that matters — an unknown column
// never leaves the server — can be tested without a database.

/** Spec §5 names these two. Poisoner's kit is NOT a bench tool (Sam's
 *  ruling 4, claude/claude_Alchemy_Bench.md). */
export const BENCH_TOOLS = ["alchemists supplies", "herbalism kit"] as const

/** Sheet tool strings are hand-entered and inconsistent ("Light armor" vs
 *  "Light Armor", ' vs ’). Compare on letters and digits only. */
export function normalizeTool(s: string): string {
  // Apostrophes are DELETED, not turned into spaces: the earlier version in
  // the brew route mapped "Alchemist's Supplies" to "alchemist s supplies",
  // which never matched, so Fifi — the party's only bench proficiency — was
  // brewing as if untrained. Fixed 2026-10-01.
  return s.toLowerCase().replace(/['\u2018\u2019`]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
}

export function benchProficient(sheetProficiencies: unknown): boolean {
  const tools = (sheetProficiencies as { tools?: unknown } | null)?.tools
  if (!Array.isArray(tools)) return false
  return tools.some(
    (t) => typeof t === "string" && (BENCH_TOOLS as readonly string[]).includes(normalizeTool(t)),
  )
}

/** The four columns of a grid with every column the character has NOT
 *  learned replaced by null. Columns are 1-based, as character_known_effects
 *  stores them. */
export function maskGrid(grid: readonly string[], knownColumns: readonly number[]): (string | null)[] {
  const known = new Set(knownColumns)
  return grid.slice(0, 4).map((effect, i) => (known.has(i + 1) ? effect : null))
}
