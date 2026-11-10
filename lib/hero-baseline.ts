// A HERO'S BASELINE — the sheet they start every game with.
//
// Sam, 2026-11-10: "New game restarts EVERYTHING." A restart used to keep "character rows, stats, XP and
// levels" on purpose, so Fifi woke up in the slave pen on day one of a new game at level 3 with 1,540 XP.
//
// A level-up cannot be un-done by rule without guessing: nothing records which prepared spell was added at
// level 2, or which features a subclass brought. So the starting sheet is KEPT rather than recomputed: one row
// per hero in `character_baselines` (the whole characters row as jsonb), and a New Game copies the columns
// below back from it. A hero with no baseline who is still level 1 has one taken at the next restart; a hero
// with no baseline who has already levelled is left alone and reported — never invented.
//
// Pure: no Supabase, no window. lib/restart-campaign.ts does the reading and writing.

/** Everything a level-up, a purse or an earned proficiency can change. Identity, art, voice and seat are not here. */
export const BASELINE_COLUMNS = [
  "level", "xp", "xp_to_next", "proficiency_bonus",
  "hp_max", "sheet_hit_dice", "hit_dice_remaining",
  "str_score", "str_modifier", "dex_score", "dex_modifier", "con_score", "con_modifier",
  "int_score", "int_modifier", "wis_score", "wis_modifier", "cha_score", "cha_modifier",
  "initiative", "passive_perception", "sheet_passive_insight", "sheet_passive_investigation",
  "skills", "languages", "speed",
  "sheet_save_proficiencies", "sheet_skill_proficiencies", "sheet_proficiencies",
  "sheet_features", "sheet_attacks", "sheet_spellcasting", "sheet_currency",
] as const

export type HeroRow = { id: string; name?: string | null; level?: number | null } & Record<string, unknown>

/** The update that puts a hero back on their baseline. XP is always 0; they wake at full hit points. */
export function baselinePatch(sheet: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!sheet || typeof sheet !== "object") return null
  const patch: Record<string, unknown> = {}
  for (const col of BASELINE_COLUMNS) if (col in sheet) patch[col] = sheet[col]
  if (!("level" in patch) || !("hp_max" in patch)) return null   // not a characters row: refuse rather than half-write
  patch.xp = 0
  patch.hp_current = patch.hp_max
  return patch
}

export type BaselinePlan = {
  /** Has a baseline: copy it back. */
  restore: HeroRow[]
  /** No baseline yet and still level 1: this row IS the starting sheet — keep it (with XP zeroed). */
  capture: HeroRow[]
  /** No baseline and already levelled: nothing to restore from. Reported, never guessed. */
  missing: HeroRow[]
}

export function baselinePlan(heroes: readonly HeroRow[], haveBaseline: ReadonlySet<string>): BaselinePlan {
  const plan: BaselinePlan = { restore: [], capture: [], missing: [] }
  for (const h of heroes) {
    if (haveBaseline.has(h.id)) plan.restore.push(h)
    else if ((Number(h.level) || 1) <= 1) plan.capture.push(h)
    else plan.missing.push(h)
  }
  return plan
}
