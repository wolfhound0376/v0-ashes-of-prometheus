// The alchemy bench — the Grid brew, potency and impurity.
//
// Spec: claude/claude_Alchemy_Minigame.md §1 and §5. Grid: claude_Alchemy_Grid.md.
// Absolute failure: claude/claude_Alchemy_Critical_Failure.md.
//
// This is step 3 of the spec's build order and the piece everything else was
// waiting on. Until now the system could TASTE (lib/eat-it-and-see.ts) but
// could not BREW, which meant no brewing check existed, which meant the
// critical-failure cinematic Sam supplied on 30 Sep could never fire: nothing
// could roll a 1.
//
// Pick 2-3 ingredients. ANY effect carried by two or more of them becomes the
// potion. No shared effect, no potion, and the ingredients are gone anyway.
//
// THREE RULES THAT LOOK LIKE BUGS AND ARE NOT:
//
// 1. IMPURITY NEVER DENIES THE POTION. This is the spec's load-bearing rule.
//    A corrupt healing potion still heals; it also leaves you reeking of
//    spoiled fungus in a slave pen. The downside is narrative, never a
//    numerical refusal. The moment impurity can stop a brew working it stops
//    being a cost and becomes a punishment, and the whole ladder dies.
//
// 2. A FAILED CHECK STILL MAKES A POTION. Only two things in the entire
//    system produce nothing: no shared effect, and a natural 1. Everything
//    else hands you a flask of something. That is the one thing this design
//    keeps from Potion Craft — a failure that gives you something rather than
//    nothing.
//
// 3. IMPURITY IS COMPUTED BEFORE THE REVEAL, NOT AFTER. "+1 per ingredient
//    whose effect you used but have not discovered" is scored against what
//    the character knew when they started. Scoring it after would mean the
//    brew that teaches you an effect also retroactively counts you as having
//    known it, and the penalty for brewing blind could never be charged. The
//    ordering is asserted in the tests.
//
// A natural 1 is not modified by proficiency, so absolute failure is the one
// part of alchemy that skill cannot protect anyone from. Skill lowers
// impurity; skill never makes you immune to catastrophe.
//
// PURE — no Supabase, no THREE, no fetch, no dice. The board owns the d20
// (components/dice/dice-provider) and Malachar narrates the exact total and
// never re-rolls it, so this module takes the total the player already
// rolled. The route at app/api/alchemy/brew does the reading and writing.
import { isGrid, type Grid } from "@/lib/eat-it-and-see"

/** Potency tier. Scales duration and magnitude; what the effect IS comes from the grid. */
export type Tier = 1 | 2 | 3

/** CLAUDE'S PROPOSAL, not Sam's ruling. Matches HOUSE_RULES.brewDc in
 *  lib/alchemy.ts rather than inventing a second brewing number. */
export const BREW_DC = 10

/** Beat the DC by this much and the brew comes out a tier stronger. Proposal. */
export const BREW_MARGIN = 5

export const MAX_IMPURITY = 3
export const MIN_INGREDIENTS = 2
export const MAX_INGREDIENTS = 3

/** An effect must appear on this many of the chosen ingredients to land. Spec §1. */
export const SHARED_THRESHOLD = 2

// Absolute failure. Every number here is homebrew from the cinematic doc and
// Sam's to overrule; the natural 1, the save, the fire damage and the
// disadvantage rider are SRD mechanics.
export const CRIT_FAIL_CUE = "alchemy-critical-failure"
export const CRIT_FAIL_SAVE_DC = 13
export const CRIT_FAIL_DAMAGE = "2d6"
export const CRIT_FAIL_DAMAGE_TYPE = "fire"
export const CRIT_FAIL_RADIUS_FT = 5

export type RuneSchool =
  | "abjuration" | "conjuration" | "divination" | "enchantment"
  | "evocation" | "illusion" | "necromancy" | "transmutation"

/** Spec §6. A liar inflates impurity SILENTLY — the brewer is never told. */
export type RecipeReliability = "true" | "drifted" | "sabotaged"

/** Spec §4. Blessed and holy water both cap impurity; water does nothing. */
export type BaseLiquid = "water" | "blessed-water" | "holy-water"

export const BASE_IMPURITY_CAP: Record<BaseLiquid, number> = {
  water: MAX_IMPURITY,
  "blessed-water": 1,
  // Holy water IS blessed water, further along. Claude's reading; the spec
  // table lists holy water's fiend/undead damage and is silent on its cap.
  "holy-water": 1,
}

export interface BenchIngredient {
  slug: string
  name: string
  /** items.alchemy_effects straight off the row. Unknown shape tolerated. */
  grid: unknown
  /** Columns (1-based) this character had discovered BEFORE this brew. */
  knownColumns: readonly number[]
  /** How many of it the character is holding. */
  have: number
}

export interface BrewInput {
  ingredients: readonly BenchIngredient[]
  /** The d20 TOTAL for the brewing check, already rolled by the board. */
  check: number
  /** The raw die face. 1 is absolute failure and nothing modifies it. */
  die: number
  /** Proficient with alchemist's supplies or a herbalism kit. */
  proficient: boolean
  /** The earned-proficiency milestone (claude/claude_Earned_Proficiency.md). */
  milestone?: boolean
  /** A recipe being followed, if any. Its reliability is NOT shown to the player. */
  recipe?: { slug: string; reliability: RecipeReliability } | null
  /** One rune, inscribed before sealing. Spec §3 — ONE per potion, never two.
   *  The route does not expose this yet; the rune system is the next piece.
   *  Only the three schools that touch the two numbers are arithmetic here. */
  rune?: RuneSchool | null
  base?: BaseLiquid
}

export type BrewRefusal = {
  ok: false
  reason:
    | "too_few_ingredients"
    | "too_many_ingredients"
    | "duplicate_ingredient"
    | "bad_grid"
    | "not_held"
    | "bad_check"
  detail?: string
}

export interface CriticalFailure {
  cue: typeof CRIT_FAIL_CUE
  saveDc: number
  damage: string
  damageType: string
  radiusFt: number
  vesselDestroyed: true
  /** A rune-sealed vessel takes the rune with it — what makes a 1 hurt a caster. */
  runeSpent: RuneSchool | null
  disadvantageNextBrew: true
}

export interface Reveal {
  itemSlug: string
  /** 1-based grid column. */
  column: number
  effect: string
}

export interface BrewOutcome {
  ok: true
  /** potion = a flask of something. inert = nothing shared. critical_failure = a nat 1. */
  outcome: "potion" | "inert" | "critical_failure"
  /** Consumed on EVERY outcome, including the ones that give nothing back. */
  consumed: string[]
  /** Every effect carried by two or more of the chosen ingredients. */
  effects: string[]
  potency: Tier
  impurity: number
  /** One line per point charged or forgiven, for the DM log. Never shown raw
   *  to the player: a sabotaged recipe's line would give the liar away. */
  impurityReasons: string[]
  /** Columns this brew taught. Empty unless the outcome is a potion. */
  revealed: Reveal[]
  critical: CriticalFailure | null
  dc: number
  beat: boolean
  summary: string
}

export type BrewResult = BrewOutcome | BrewRefusal

/** Effects carried by at least SHARED_THRESHOLD of the chosen grids.
 *  Returned in the order they first appear, so a brew reads the way the
 *  bench was loaded rather than alphabetically. */
export function sharedEffects(grids: readonly Grid[]): string[] {
  const count = new Map<string, number>()
  const order: string[] = []
  for (const g of grids) {
    // A grid's four effects are distinct, so one pass per grid cannot
    // double-count an ingredient against itself.
    for (const e of g) {
      if (!count.has(e)) order.push(e)
      count.set(e, (count.get(e) ?? 0) + 1)
    }
  }
  return order.filter((e) => (count.get(e) ?? 0) >= SHARED_THRESHOLD)
}

/** Which of this ingredient's columns the brew used but the brewer had not
 *  discovered. Each such ingredient costs a point of impurity: you got lucky,
 *  not skilled. */
export function blindColumns(ing: BenchIngredient, used: readonly string[]): number[] {
  if (!isGrid(ing.grid)) return []
  const known = new Set(ing.knownColumns)
  const out: number[] = []
  ing.grid.forEach((e, i) => {
    if (used.includes(e) && !known.has(i + 1)) out.push(i + 1)
  })
  return out
}

/** Spec §5, in order, floor 0 and capped by the base liquid. */
export function impurityOf(input: BrewInput, used: readonly string[]): { value: number; reasons: string[] } {
  const reasons: string[] = []
  let n = 0

  if (!input.proficient) {
    n += 1
    reasons.push("+1 no proficiency with the tools")
  }

  for (const ing of input.ingredients) {
    if (blindColumns(ing, used).length > 0) {
      n += 1
      reasons.push(`+1 ${ing.name} — used an effect this brewer had not discovered`)
    }
  }

  // CLAUDE'S ADDITION, not in the spec: a missed check costs a point rather
  // than the potion, which keeps rule 2 above intact while still making the
  // roll matter. Sam's to cut.
  if (Number.isFinite(input.check) && input.check < BREW_DC) {
    n += 1
    reasons.push(`+1 the check missed DC ${BREW_DC}`)
  }

  if (input.recipe?.reliability === "drifted") {
    n += 1
    reasons.push("+1 the recipe is a bad copy")
  }
  if (input.recipe?.reliability === "sabotaged") {
    // Spec §6 says +2; spec §5's summary line says +1. The dedicated cookbook
    // table wins as the more specific statement, and the discrepancy is
    // flagged in claude/claude_Alchemy_Bench.md for Sam to settle.
    n += 2
    reasons.push("+2 the recipe is sabotaged")
  }

  if (input.rune === "necromancy") {
    n += 1
    reasons.push("+1 necromantic mark — power with a bill")
  }
  if (input.rune === "abjuration") {
    n -= 1
    reasons.push("-1 abjuration mark")
  }
  if (input.milestone) {
    n -= 1
    reasons.push("-1 earned-proficiency milestone")
  }

  const cap = BASE_IMPURITY_CAP[input.base ?? "water"]
  const floored = Math.max(0, Math.min(MAX_IMPURITY, n))
  const value = Math.min(floored, cap)
  if (value < floored) reasons.push(`capped at ${cap} by the blessed base`)
  return { value, reasons }
}

/** CLAUDE'S PROPOSAL. The spec says proficiency, runes and bases decide how
 *  strong, and fixes no arithmetic. A missed check pins the brew at tier I
 *  rather than destroying it. */
export function potencyOf(input: BrewInput): Tier {
  if (input.check < BREW_DC) return 1
  let t = 1
  if (input.proficient) t += 1
  if (input.check >= BREW_DC + BREW_MARGIN) t += 1
  if (input.rune === "evocation") t += 1
  return Math.min(3, t) as Tier
}

const ROMAN: Record<Tier, string> = { 1: "I", 2: "II", 3: "III" }

/** Resolve one brew. */
export function brewAtBench(input: BrewInput): BrewResult {
  const { ingredients } = input

  if (!Array.isArray(ingredients) || ingredients.length < MIN_INGREDIENTS) {
    return { ok: false, reason: "too_few_ingredients" }
  }
  if (ingredients.length > MAX_INGREDIENTS) {
    return { ok: false, reason: "too_many_ingredients" }
  }
  if (new Set(ingredients.map((i) => i.slug)).size !== ingredients.length) {
    // Two of the same mushroom share all four effects with themselves and
    // would brew a guaranteed four-effect potion out of one ingredient.
    return { ok: false, reason: "duplicate_ingredient" }
  }
  for (const ing of ingredients) {
    if (!isGrid(ing.grid)) return { ok: false, reason: "bad_grid", detail: ing.slug }
    if (!Number.isFinite(ing.have) || ing.have < 1) return { ok: false, reason: "not_held", detail: ing.slug }
  }
  if (!Number.isFinite(input.check) || !Number.isFinite(input.die)) {
    return { ok: false, reason: "bad_check" }
  }
  if (input.die < 1 || input.die > 20 || !Number.isInteger(input.die)) {
    return { ok: false, reason: "bad_check", detail: "die must be the face, 1-20" }
  }

  const consumed = ingredients.map((i) => i.slug)
  const beat = input.check >= BREW_DC

  // A natural 1 ends it here. No potion, no partial, no salvage, and nothing
  // learned — the only outcome in the whole system that gives you nothing.
  if (input.die === 1) {
    return {
      ok: true,
      outcome: "critical_failure",
      consumed,
      effects: [],
      potency: 1,
      impurity: 0,
      impurityReasons: [],
      revealed: [],
      critical: {
        cue: CRIT_FAIL_CUE,
        saveDc: CRIT_FAIL_SAVE_DC,
        damage: CRIT_FAIL_DAMAGE,
        damageType: CRIT_FAIL_DAMAGE_TYPE,
        radiusFt: CRIT_FAIL_RADIUS_FT,
        vesselDestroyed: true,
        runeSpent: input.rune ?? null,
        disadvantageNextBrew: true,
      },
      dc: BREW_DC,
      beat: false,
      summary: `Natural 1. The bench goes up. Everything in it is gone.`,
    }
  }

  const grids = ingredients.map((i) => i.grid as Grid)
  const effects = sharedEffects(grids)

  if (effects.length === 0) {
    return {
      ok: true,
      outcome: "inert",
      consumed,
      effects: [],
      potency: 1,
      impurity: 0,
      impurityReasons: [],
      revealed: [],
      critical: null,
      dc: BREW_DC,
      beat,
      summary: `Nothing these ${ingredients.length} have in common. Sludge, and the ingredients are gone.`,
    }
  }

  // Impurity FIRST — see note 3 at the top of this file.
  const { value: impurity, reasons: impurityReasons } = impurityOf(input, effects)
  const potency = potencyOf(input)

  const revealed: Reveal[] = []
  for (const ing of ingredients) {
    const g = ing.grid as Grid
    for (const column of blindColumns(ing, effects)) {
      revealed.push({ itemSlug: ing.slug, column, effect: g[column - 1] })
    }
  }

  const effectList = effects.join(", ")
  const summary =
    `Brewed ${effectList} at tier ${ROMAN[potency]}, impurity ${impurity}. ` +
    `Check ${input.check} vs DC ${BREW_DC}: ${beat ? "held together" : "barely held together"}.`

  return {
    ok: true,
    outcome: "potion",
    consumed,
    effects,
    potency,
    impurity,
    impurityReasons,
    revealed,
    critical: null,
    dc: BREW_DC,
    beat,
    summary,
  }
}
