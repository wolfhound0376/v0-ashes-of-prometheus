// ============================================================================
// SCAVENGED POSSESSIONS — the opening fortune roll (Out of the Abyss, ch.1).
//
// Each prisoner rolls 1d20 and ADDS the number of days they have been held,
// which is itself 1d10 (rolled separately for each character). Totals run
// 2–30. Source: the campaign book, held in `campaign_chunks` ("Velkynvelve
// Mechanics - Scavenged Possessions") — and the same chunk's warning, which is
// why this file exists:
//
//   "There is NO d100 scavenged items table in this campaign. If a d100 table
//    is referenced, it is fabricated and must be rejected."
//
// A fake d100 table ran in Malachar's prompt for months and turned one
// poisoned BOLT into a whole hand crossbow. Sam, 2026-10-14: "do the 1d20 +
// days imprisoned (1d10)". The app rolls both dice on the shared roller, this
// module turns the total into a row, and /api/fortune-roll awards the row's
// item from the canonical catalog by slug — never by a name Malachar wrote.
// ============================================================================

export type ScavengedRow = {
  min: number
  max: number
  /** The book's wording, for the log and for Malachar. */
  text: string
  /** `items.slug` in the canonical catalog; null for "nothing at all". */
  slug: string | null
}

export const SCAVENGED_TABLE: readonly ScavengedRow[] = [
  { min: 2, max: 9, text: "nothing at all", slug: null },
  { min: 10, max: 12, text: "a single gold coin", slug: "gold-coin" },
  { min: 13, max: 15, text: "a living spider about the size of a tarantula", slug: "small-spider" },
  { min: 16, max: 18, text: "a five-foot strand of silk rope", slug: "silk-rope" },
  { min: 19, max: 21, text: "a flawed carnelian gemstone worth 10 gp", slug: "carnelian-gem" },
  { min: 22, max: 24, text: "a rusted iron bar, usable as a club", slug: "rusted-iron-bar" },
  { min: 25, max: 27, text: "a shard of flint, usable as a dagger", slug: "flint-shard" },
  // ONE bolt. Not a hand crossbow; nothing to fire it with.
  { min: 28, max: 30, text: "a single hand crossbow bolt coated in drow poison", slug: "hand-crossbow-bolt-drow-poison" },
]

export const DAYS_DIE = 10
export const FORTUNE_DIE = 20

/** The row for a total, or null when the total is outside 2–30 (a bad roll from a client). */
export function scavengedRow(total: number): ScavengedRow | null {
  if (!Number.isInteger(total)) return null
  return SCAVENGED_TABLE.find((r) => total >= r.min && total <= r.max) ?? null
}

/** The flag key that records a character's roll for the run (cleared by a restart with every other flag). */
export const fortuneFlagKey = (characterId: string) => `fortune:${characterId}`

/** One line for the shared log. */
export function fortuneLine(name: string, days: number, d20: number, row: ScavengedRow): string {
  return `🎲 ${name} has been a prisoner for ${days} day${days === 1 ? "" : "s"} (d10 ${days}) and rolls d20 ${d20} — total ${days + d20}: ${row.text}.`
}
