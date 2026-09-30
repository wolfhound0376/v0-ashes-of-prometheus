// Eat It And See — the discovery half of alchemy.
//
// Spec: claude/claude_Alchemy_Minigame.md §2. Grid: claude_Alchemy_Grid.md.
//
// Every ingredient carries FOUR effects in a fixed order. Column 1 is what
// TASTING reveals; columns 2-4 come from a successful brew, an NPC, or a
// recipe. Knowledge is PER CHARACTER by design -- Kenta learning what bluecap
// does teaches Fifi nothing. That is the whole progression: the character
// never gets stronger, the player learns the map.
//
// Sam's ruling (29 Sep): tasting an unknown is a DC 10 Constitution save, or
// column 1 happens to you at tier I.
//
// TWO THINGS THAT LOOK LIKE BUGS AND ARE NOT:
//
// 1. The reveal happens whether the save passes or fails. You learn what the
//    mushroom does by finding out. Failing means you ALSO get it. Gating the
//    reveal behind the save would make a failed taste cost you the ingredient
//    and teach you nothing, which is the one outcome with no story in it.
//
// 2. Column 1 is not always the good one. `bluecap` tastes of `sicken`
//    because its own catalogue row says it is inedible raw. That is the
//    lesson the mechanic teaches, and code must never "helpfully" reorder a
//    grid to put a pleasant effect first.
//
// This module is PURE -- no Supabase, no THREE, no fetch. It decides; the
// route at app/api/alchemy/taste does the reading and writing.

/** The four effects of one ingredient, in grid order. */
export type Grid = readonly [string, string, string, string]

/** DC for the Constitution save when tasting. Sam's ruling, not the SRD. */
export const TASTE_SAVE_DC = 10

/** Tier a tasted effect lands at when the save fails. Always the weakest. */
export const TASTE_EFFECT_TIER = 1

export type LearnedVia = "taste" | "brew" | "taught" | "recipe" | "dm"

export interface TasteInput {
  /** items.alchemy_effects, straight off the row. Unknown shape tolerated. */
  grid: unknown
  /** Column indices (1-based) this character already knows for this item. */
  known: readonly number[]
  /** The d20 total for the Constitution save, already rolled by the client. */
  save: number
  /** True when the effect is flagged is_harmful in alchemy_effects. */
  harmful: boolean
}

export type TasteRefusal =
  | { ok: false; reason: "not_an_ingredient" }
  | { ok: false; reason: "bad_grid" }
  | { ok: false; reason: "bad_save" }

export interface TasteOutcome {
  ok: true
  /** The effect slug column 1 names. */
  effect: string
  /** True when this taste taught the character something new. */
  revealed: boolean
  /** False when they already knew column 1 and only ate it again. */
  firstTime: boolean
  /** Did the Constitution save beat the DC? */
  resisted: boolean
  /** Applied only on a failed save. */
  applied: { effect: string; tier: number } | null
  dc: number
  /** For the DM/board log. Never shown as a rules explanation to players. */
  summary: string
}

export type TasteResult = TasteOutcome | TasteRefusal

/** A grid is exactly four distinct non-empty strings. Mirrors the DB CHECK
 *  (items_alchemy_effects_shape) rather than trusting it -- a row could have
 *  been written before the constraint landed. */
export function isGrid(v: unknown): v is Grid {
  if (!Array.isArray(v) || v.length !== 4) return false
  if (!v.every((e) => typeof e === "string" && e.trim().length > 0)) return false
  return new Set(v as string[]).size === 4
}

/** What tasting reveals: column 1, always. */
export function tastedEffect(grid: unknown): string | null {
  return isGrid(grid) ? grid[0] : null
}

/** Column index (1-based) of an effect in a grid, or null. Used when a brew
 *  reveals a column and we need to know which one it was. */
export function columnOf(grid: unknown, effect: string): number | null {
  if (!isGrid(grid)) return null
  const i = grid.indexOf(effect)
  return i === -1 ? null : i + 1
}

/** Which columns remain unknown. For the dashboard's "3 of 4 known" line. */
export function unknownColumns(known: readonly number[]): number[] {
  const seen = new Set(known)
  return [1, 2, 3, 4].filter((c) => !seen.has(c))
}

/**
 * Resolve one taste.
 *
 * The save is passed in rather than rolled here: the board already owns the
 * dice (components/dice/dice-provider), and Malachar narrates the exact total
 * and never re-rolls it. A module that rolled its own d20 would be a second
 * source of truth for the same number.
 */
export function taste(input: TasteInput): TasteResult {
  const { grid, known, save, harmful } = input

  if (grid == null) return { ok: false, reason: "not_an_ingredient" }
  if (!isGrid(grid)) return { ok: false, reason: "bad_grid" }
  if (!Number.isFinite(save)) return { ok: false, reason: "bad_save" }

  const effect = grid[0]
  const firstTime = !known.includes(1)
  const resisted = save >= TASTE_SAVE_DC

  // The reveal is unconditional -- see note 1 at the top of this file.
  const revealed = firstTime

  const applied = resisted ? null : { effect, tier: TASTE_EFFECT_TIER }

  const summary = !firstTime
    ? resisted
      ? `Tasted again; already knew it carries ${effect}. Save ${save} vs DC ${TASTE_SAVE_DC}: no effect.`
      : `Tasted again; already knew it carries ${effect}. Save ${save} vs DC ${TASTE_SAVE_DC}: ${effect} at tier ${TASTE_EFFECT_TIER}.`
    : resisted
      ? `Learned it carries ${effect}. Save ${save} vs DC ${TASTE_SAVE_DC}: shrugged it off.`
      : `Learned it carries ${effect}${harmful ? " the hard way" : ""}. Save ${save} vs DC ${TASTE_SAVE_DC}: ${effect} at tier ${TASTE_EFFECT_TIER}.`

  return { ok: true, effect, revealed, firstTime, resisted, applied, dc: TASTE_SAVE_DC, summary }
}
