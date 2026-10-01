// Drink — the inebriation ladder (claude_Alchemy_Minigame.md §7).
//
// Sam's rulings: alchemy makes beer, wine and liquor; level 1 affects
// DEXTERITY; beer DC 10 / wine DC 12 / liquor DC 14, liquor two steps a drink.
//
//   1 Warm    advantage on saves vs fear, disadvantage on Dexterity checks
//   2 Drunk   disadvantage on Dexterity checks and attack rolls, advantage on Charisma checks
//   3 Soused  the poisoned condition, disadvantage on everything
//   4 Ruined  unconscious; hangover through the next long rest
//
// One Constitution save per drink at the drink's DC. Fail and you climb the
// drink's steps (1, or 2 for high-proof liquor); succeed and you hold where
// you are. A drink with a `max_level` (Sporebread Small Beer: 1) can never
// take you past it. The level rides on the sheet as a named condition, the
// same way every other named state does — and Soused and Ruined also carry
// the real SRD conditions (Poisoned, Unconscious) so the board and the
// rules engine see them.
//
// HOMEBREW throughout except the SRD conditions themselves.

export const LEVEL_NAME = ["", "Warm", "Drunk", "Soused", "Ruined"] as const
export const MAX_LEVEL = 4

export const LEVEL_EFFECT: Record<number, string> = {
  1: "advantage on saves vs. fear, disadvantage on Dexterity checks",
  2: "disadvantage on Dexterity checks and attack rolls, advantage on Charisma checks",
  3: "poisoned, disadvantage on everything",
  4: "unconscious, hangover through the next long rest",
}

/** The named condition for a level, e.g. "Drunk (inebriated 2)". */
export function levelCondition(level: number): string | null {
  if (level < 1 || level > MAX_LEVEL) return null
  return `${LEVEL_NAME[level]} (inebriated ${level})`
}

const LEVEL_RE = /\(inebriated ([1-4])\)/i

/** The current level, read off the sheet's conditions. */
export function currentLevel(conditions: readonly string[]): number {
  let lvl = 0
  for (const c of conditions) {
    const m = LEVEL_RE.exec(c)
    if (m) lvl = Math.max(lvl, Number(m[1]))
  }
  return lvl
}

/** Real SRD conditions a level also imposes, on top of its named one. */
export function srdConditionsFor(level: number): string[] {
  if (level >= 4) return ["Unconscious", "Poisoned"]
  if (level === 3) return ["Poisoned"]
  return []
}

export interface DrinkData {
  class: "beer" | "wine" | "liquor" | string
  save_dc: number
  steps_per_drink: number
  max_level?: number
  made_from?: string[]
  maker?: string
}

export function isDrinkData(v: unknown): v is DrinkData {
  const d = v as DrinkData | null
  return !!d && typeof d === "object" && Number.isFinite(Number(d.save_dc)) && Number.isFinite(Number(d.steps_per_drink))
}

export interface QuaffResult {
  before: number
  after: number
  resisted: boolean
  capped: boolean
  summary: string
}

export function quaff(before: number, save: number, drink: DrinkData): QuaffResult {
  const dc = Number(drink.save_dc)
  const resisted = save >= dc
  const cap = Math.min(MAX_LEVEL, Number(drink.max_level ?? MAX_LEVEL))
  const climbed = resisted ? before : before + Number(drink.steps_per_drink)
  const after = Math.max(before, Math.min(cap, climbed))
  const capped = !resisted && climbed > cap && after === cap
  const where = after === 0 ? "still sober" : `${LEVEL_NAME[after]} (${LEVEL_EFFECT[after]})`
  const summary = resisted
    ? `CON ${save} vs DC ${dc}: holds it. ${after === 0 ? "Still sober." : `Still ${LEVEL_NAME[after]}.`}`
    : `CON ${save} vs DC ${dc}: it goes to the head — now ${where}.`
  return { before, after, resisted, capped, summary }
}

/** The sheet's conditions with the old level swapped for the new one. */
export function withLevel(conditions: readonly string[], level: number): string[] {
  const drop = new Set(["poisoned", "unconscious"])
  const prev = currentLevel(conditions)
  const kept = conditions.filter((c) => {
    if (LEVEL_RE.test(c)) return false
    // Only clear the SRD conditions THIS ladder put there.
    if (prev >= 3 && drop.has(c.toLowerCase()) && !srdConditionsFor(level).map((x) => x.toLowerCase()).includes(c.toLowerCase())) return false
    return true
  })
  const named = levelCondition(level)
  const out = named ? [...kept, named] : kept
  for (const c of srdConditionsFor(level)) if (!out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c)
  return out
}
