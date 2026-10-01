// Drinking a brew — what the flask actually does to you.
//
// Spec: claude/claude_Alchemy_Minigame.md §5 (impurity) and the effect
// vocabulary in claude/claude_Alchemy_Grid.md. Bench: lib/alchemy-bench.ts.
//
// The bench writes potency, impurity and a list of effect slugs into
// inventory_items.brew. Until this file existed nothing read that column, so a
// tier III clean potion and a tier I corrupt one were the same object with
// different labels. This is the half that makes the two numbers felt.
//
// THE VOCABULARY IS NOT NEW. Every durational effect here is expressed with
// the SpellEffect shapes from lib/spell-effects.ts, because that file already
// solved this exact problem for spells and its central rule applies word for
// word:
//
//   AN EFFECT THE ENGINE CANNOT MECHANISE IS NEVER SILENT. It falls through
//   to `dm` — named, with its description — and Malachar rules it.
//
// So a brew effect with no row below still reaches the table as a ruling
// rather than as nothing. That is why `unknownEffects` exists and why the
// tests assert it is never dropped.
//
// Named states (Resist Poison, Soft Step, Inner Light) are carried as
// CONDITIONS, free-text and displayed on the sheet, exactly as "Faerie Fire"
// and "Disguised" already are in lib/spell-effects.ts. There is no duration
// tracking anywhere in this codebase, so `rounds` is what Malachar and the
// sheet read, not something a timer enforces — same as every spell.
//
// PURE. No Supabase, no dice, no fetch. The route at app/api/alchemy/drink
// reads the row, rolls nothing, and applies what this returns.
import type { SpellEffect } from "@/lib/spell-effects"
import { MAX_IMPURITY, type Tier } from "@/lib/alchemy-bench"
import { TASTE_SAVE_DC } from "@/lib/eat-it-and-see"

/**
 * Duration ladder. HOMEBREW — the spec says potency "scales duration and
 * magnitude" and fixes no numbers. A decade per tier: a minute, ten minutes,
 * an hour.
 */
export const TIER_ROUNDS: Record<Tier, number> = { 1: 10, 2: 100, 3: 600 }

/**
 * Healing by tier. Tiers I and II are the SRD potion of healing and potion of
 * greater healing verbatim. Tier III is deliberately 6d4+6 and NOT the SRD
 * superior potion's 8d4+8: a superior potion is three workweeks of downtime
 * crafting in XGE, and one good roll at a camp bench should not match it.
 * HOMEBREW at tier III, SOURCED at I and II.
 */
export const HEAL_DICE: Record<Tier, string> = { 1: "2d4+2", 2: "4d4+4", 3: "6d4+6" }

/** Harmful dice by tier. HOMEBREW, all three. */
export const HARM_DICE: Record<Tier, string> = { 1: "1d6", 2: "2d6", 3: "3d6" }

/**
 * Save DC for the gated effects, by tier. Sam's ruling, 2026-09-30: a stronger
 * brew IS harder to shrug off.
 *
 * Tier I is not a number of its own -- it IS `TASTE_SAVE_DC`, imported rather
 * than copied, because Sam ruled DC 10 for "column 1 happens to you" and a
 * brew doing the same thing to the same throat is the same event. Change that
 * constant and this moves with it; there is a test holding them together.
 *
 * +2 a tier lands the ladder inside the published poison band rather than
 * beside it: SRD basic poison is DC 10, serpent venom DC 11, drow poison
 * DC 13, wyvern DC 15. Tier III at 14 sits between the drow and the wyvern,
 * which is about right for the worst thing a camp bench can produce.
 * HOMEBREW at tiers II and III.
 */
export const SAVE_DC: Record<Tier, number> = { 1: TASTE_SAVE_DC, 2: 12, 3: 14 }

export interface BrewBlob {
  effects: unknown
  potency: unknown
  impurity: unknown
  base?: unknown
  rune?: unknown
}

/** What one effect does when drunk. Every field optional; a row with only
 *  `dm` is a perfectly good row. */
interface EffectSpec {
  /** Heals, scaling by tier off HEAL_DICE. */
  heals?: boolean
  /** Damages the drinker, scaling off HARM_DICE. */
  harms?: string
  /** A named state laid on the drinker for TIER_ROUNDS. */
  condition?: string
  /** A save to avoid it landing — only the genuinely hostile ones. */
  save?: "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA"
  /** Levels of exhaustion removed (negative) — long-march. */
  exhaustion?: number
  /** What it does, in the DM's hands. Always present: a condition word alone
   *  tells Malachar nothing about what it is supposed to do. */
  dm: string
}

/**
 * The twenty-two effects, from claude_Alchemy_Grid.md.
 *
 * EVERYTHING IN THIS TABLE IS HOMEBREW except the healing dice at tiers I and
 * II and the SRD conditions it leans on (poisoned, restrained, enlarge,
 * reduce, exhaustion). The grid doc gives each effect one line of intent; this
 * turns that line into something the engine can apply. Sam's to redline per
 * row — that is the easiest kind of change to make here, one object each.
 */
export const DRINK_EFFECTS: Record<string, EffectSpec> = {
  // --- Restorative and protective ---
  "restore-health": { heals: true, dm: "Hit points back, rolled on the tier's dice. Nothing else — this is the prize effect and deliberately the plainest one in the table." },
  "purge-disease": { dm: "Ends one disease affecting the drinker. At tier II and III the drinker is also immune to new disease for the duration." },
  "resist-poison": { condition: "Resist Poison", dm: "Advantage on saving throws against poison for the duration." },
  "iron-stomach": { condition: "Iron Stomach", dm: "Advantage on Constitution saves against anything swallowed, for the duration." },
  "steady-nerve": { condition: "Steady Nerve", dm: "Advantage on saving throws against being frightened, for the duration." },
  "long-march": { exhaustion: -1, dm: "Removes one level of exhaustion, or ignores a day's travel fatigue if the drinker has none." },
  wakefulness: { condition: "Wakeful", dm: "No sleep needed, and advantage against magical sleep, for the duration. A long rest taken under it still counts — this is not a substitute for rest." },

  // --- Sensory and social ---
  darksight: { condition: "Darkvision", dm: "Darkvision 60 ft for the duration, or +60 ft to existing darkvision." },
  "keen-scent": { condition: "Keen Scent", dm: "Advantage on Perception checks that rely on smell, and on tracking by scent." },
  // The one effect in the table with a built-in cost, kept that way on
  // purpose: the grid doc flags it, and it is the only reason a light source
  // is ever a decision rather than a free yes.
  "inner-light": { condition: "Inner Light", dm: "The drinker sheds bright light in a 15-ft radius and dim light 15 ft beyond, AND has disadvantage on Stealth checks, for the duration. Both halves, always — this effect cuts both ways." },
  "soft-step": { condition: "Soft Step", dm: "Advantage on Stealth checks for the duration." },
  "silver-tongue": { condition: "Silver Tongue", dm: "Advantage on Charisma checks for the duration." },
  "mind-link": { condition: "Mind-Linked", dm: "Brief telepathy with one willing creature the drinker can see, for the duration. Language is not required; the link does not read unwilling minds." },

  // --- Harmful ---
  // NO DAMAGE. The grid doc gives sicken the poisoned CONDITION and nothing
  // else; `numbing-venom` is the row that deals poison damage. An earlier
  // draft gave sicken both, which is a rule nobody wrote.
  sicken: { condition: "Poisoned", save: "CON", dm: "The drinker is poisoned on a failed Constitution save. SRD condition, no damage of its own." },
  "numbing-venom": { harms: "poison", dm: "Poison damage to the drinker." },
  "burning-blood": { harms: "fire", dm: "Fire damage to the drinker." },
  corrode: { harms: "acid", dm: "Acid damage to the drinker, and it eats at metal it touches on the way down — a held flask, worn gear at the DM's call." },
  rot: { harms: "necrotic", dm: "Necrotic damage to the drinker." },
  seize: { condition: "Restrained", save: "CON", dm: "Restrained on a failed Constitution save; a second failure at the end of the next turn escalates to paralyzed. A success at the end of any turn ends it." },
  confuse: { condition: "Confused", save: "WIS", dm: "As the confusion effect, briefly: the drinker acts unpredictably for the duration, DM rolling behaviour each round. A Wisdom save avoids it." },

  // --- Strange ---
  swell: { condition: "Enlarged", dm: "As the SRD enlarge effect: size category up, +1d4 damage on weapon hits, advantage on Strength checks and saves, for the duration." },
  shrink: { condition: "Reduced", dm: "As the SRD reduce effect: size category down, -1d4 damage on weapon hits, advantage on Dexterity checks and saves, for the duration." },
}

/** Spec §5. The rider is the whole reason impurity is a cost rather than a
 *  number, and it NEVER stops the potion working — the effects above all land
 *  regardless of what is in here. */
export const RIDERS: Record<number, { condition: string; text: string }> = {
  1: {
    condition: "Residue",
    text: "Residue: ONE of — disadvantage on the drinker's next ability check of a type the DM names, or -1d4 on their next saving throw, or an hour of sluggishness. The DM picks which; the engine does not choose for them.",
  },
  2: {
    condition: "Tainted",
    text: "Taint: the residue above, AND the drinker is marked. It smells. NPCs notice and react, and drow notice immediately — a slave who reeks of a botched brew has been somewhere they should not have been.",
  },
  3: {
    condition: "Corrupted",
    text: "Corruption: the residue and the taint above, AND a condition the DM names that does not clear on its own — it needs a long rest or a specific remedy. This is the only rider that outlives the night.",
  },
}

export type DrinkRefusal = { ok: false; reason: "not_a_brew" | "no_effects" }

export interface Dose {
  ok: true
  potency: Tier
  impurity: number
  /** Dice for the board to roll, or null. NOT rolled here. */
  heal: string | null
  harm: { dice: string; type: string } | null
  /** Conditions, buffs and rulings, in lib/spell-effects vocabulary. */
  effects: SpellEffect[]
  /** Negative removes levels. */
  exhaustionDelta: number
  /** DC for every save-gated effect in this dose. Scales with potency. */
  saveDc: number
  rider: { condition: string; text: string } | null
  /** Effect slugs with no row in DRINK_EFFECTS. Handed to the DM, never dropped. */
  unknownEffects: string[]
  /** Every condition word this dose lays on the drinker, rider included. */
  conditions: string[]
  summary: string
  /** Homebrew notices, carried into the response for the DM. */
  flags: string[]
}

export type DrinkResult = Dose | DrinkRefusal

function asTier(v: unknown): Tier | null {
  return v === 1 || v === 2 || v === 3 ? v : null
}

const ROMAN: Record<Tier, string> = { 1: "I", 2: "II", 3: "III" }

/**
 * Resolve one dose.
 *
 * ORDER MATTERS AND IS DELIBERATE: healing is reported before harm, and the
 * route applies it in that order. A brew that both heals and rots — which the
 * grid genuinely produces, e.g. ripplebark + edible-mushrooms sharing
 * restore-health AND rot — mends the drinker first and then bites. Applied the
 * other way a drinker at 1 hp would drop before the healing landed, which
 * turns an interesting potion into a coin flip on unconsciousness.
 */
export function drinkBrew(blob: unknown): DrinkResult {
  if (blob == null || typeof blob !== "object") return { ok: false, reason: "not_a_brew" }
  const b = blob as BrewBlob

  const potency = asTier(b.potency)
  if (potency == null) return { ok: false, reason: "not_a_brew" }

  const raw = b.effects
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, reason: "no_effects" }
  const effectSlugs = raw.filter((e): e is string => typeof e === "string" && e.length > 0)
  if (effectSlugs.length === 0) return { ok: false, reason: "no_effects" }

  const impurity = Math.max(
    0,
    Math.min(MAX_IMPURITY, Number.isFinite(Number(b.impurity)) ? Math.trunc(Number(b.impurity)) : 0),
  )

  const rounds = TIER_ROUNDS[potency]
  const effects: SpellEffect[] = []
  const conditions: string[] = []
  const unknownEffects: string[] = []
  const flags: string[] = ["Every effect row and the whole duration ladder are HOMEBREW; healing at tiers I and II is SRD."]

  let heal: string | null = null
  let harmType: string | null = null
  let exhaustionDelta = 0

  for (const slug of effectSlugs) {
    const spec = DRINK_EFFECTS[slug]
    if (!spec) {
      // Never silent — see the note at the top of this file.
      unknownEffects.push(slug)
      effects.push({ kind: "dm", text: `The brew carries "${slug}", which the engine has no rule for. Rule it from the grid and narrate it.` })
      continue
    }
    if (spec.heals) heal = HEAL_DICE[potency]
    if (spec.harms) harmType = spec.harms
    if (spec.exhaustion) exhaustionDelta += spec.exhaustion
    if (spec.condition) {
      conditions.push(spec.condition)
      effects.push({ kind: "condition", condition: spec.condition, rounds, ...(spec.save ? { save: spec.save, saveEnds: true } : {}) })
    }
    effects.push({ kind: "dm", text: `${slug} (tier ${ROMAN[potency]}): ${spec.dm}` })
  }

  const rider = impurity > 0 ? RIDERS[impurity] ?? null : null
  if (rider) {
    conditions.push(rider.condition)
    effects.push({ kind: "dm", text: rider.text })
  }

  const harm = harmType ? { dice: HARM_DICE[potency], type: harmType } : null

  const parts: string[] = []
  if (heal) parts.push(`heals ${heal}`)
  if (harm) parts.push(`${harm.dice} ${harm.type} to the drinker`)
  if (exhaustionDelta < 0) parts.push(`${-exhaustionDelta} level(s) of exhaustion lifted`)
  if (conditions.length > 0) parts.push(conditions.join(", "))

  const summary =
    `Tier ${ROMAN[potency]}, impurity ${impurity}. ` +
    (parts.length > 0 ? parts.join("; ") + "." : "Nothing the engine can apply — the DM rules it.") +
    (rider ? ` ${rider.condition} sets in.` : "")

  return {
    ok: true,
    potency,
    impurity,
    heal,
    harm,
    effects,
    exhaustionDelta,
    saveDc: SAVE_DC[potency],
    rider,
    unknownEffects,
    conditions,
    summary,
    flags,
  }
}
