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

// ---------------------------------------------------------------------------
// TIME SOBERS YOU UP (Sam, 2026-10-01).
//
// 5E has no core intoxication rules (PHB/DMG mention drinking contests as a
// Constitution check and stop there). The one published mechanic is Lost Mine
// of Phandelver's dwarven brandy: two glasses within an hour and you are
// poisoned FOR 1 HOUR. That hour is the anchor here: each level wears off
// after one hour without a drink. Drinking again restarts the clock.
//
// Ruined is Sam's "hangover through the next long rest": coming round from
// Ruined leaves `Hungover` for 8 hours, the length of a long rest. What a
// hangover does is the DM's to rule; nothing here invents a number for it.
//
// Time is the GAME clock when there is one (game_clock, minutes), otherwise
// real elapsed time. game_clock is empty today, so the table runs on real time.

export const MINUTES_PER_LEVEL = 60
export const HANGOVER_MINUTES = 8 * 60
export const HUNGOVER = "Hungover"

export interface InebriationRecord {
  level: number
  /** When the level was last set (real time, ISO). */
  since: string
  /** The same moment on the game clock, in absolute minutes, when known. */
  since_game?: number | null
  /** Real ISO time the hangover ends, if Ruined has worn off. */
  hangover_until?: string | null
  hangover_until_game?: number | null
}

export function isInebriationRecord(v: unknown): v is InebriationRecord {
  const r = v as InebriationRecord | null
  return !!r && typeof r === "object" && Number.isFinite(Number(r.level)) && typeof r.since === "string"
}

/** Minutes between two moments: the game clock when both ends have it, else real time. */
function elapsedMinutes(fromReal: string, fromGame: number | null | undefined, nowReal: Date, nowGame: number | null): number {
  if (typeof fromGame === "number" && typeof nowGame === "number") return Math.max(0, nowGame - fromGame)
  return Math.max(0, (nowReal.getTime() - new Date(fromReal).getTime()) / 60000)
}

/** The record as it stands NOW: levels worn off by time, hangover expired or begun. */
export function sober(rec: InebriationRecord, nowReal: Date, nowGame: number | null): InebriationRecord {
  const mins = elapsedMinutes(rec.since, rec.since_game, nowReal, nowGame)
  const gone = Math.floor(mins / MINUTES_PER_LEVEL)
  let out: InebriationRecord = { ...rec }
  if (gone > 0 && rec.level > 0) {
    const level = Math.max(0, rec.level - gone)
    // The clock keeps its remainder, so 90 minutes is one level and a half-hour banked.
    const used = Math.min(gone, rec.level) * MINUTES_PER_LEVEL
    const sinceReal = new Date(new Date(rec.since).getTime() + used * 60000).toISOString()
    const sinceGame = typeof rec.since_game === "number" ? rec.since_game + used : rec.since_game ?? null
    out = { ...out, level, since: sinceReal, since_game: sinceGame }
    if (rec.level >= MAX_LEVEL && level < MAX_LEVEL) {
      // Came round from Ruined: the hangover runs a long rest's length from the moment you woke.
      const wokeReal = new Date(new Date(rec.since).getTime() + MINUTES_PER_LEVEL * 60000)
      out.hangover_until = new Date(wokeReal.getTime() + HANGOVER_MINUTES * 60000).toISOString()
      out.hangover_until_game = typeof rec.since_game === "number" ? rec.since_game + MINUTES_PER_LEVEL + HANGOVER_MINUTES : null
    }
  }
  if (out.hangover_until) {
    const left =
      typeof out.hangover_until_game === "number" && typeof nowGame === "number"
        ? out.hangover_until_game - nowGame
        : (new Date(out.hangover_until).getTime() - nowReal.getTime()) / 60000
    if (left <= 0) out = { ...out, hangover_until: null, hangover_until_game: null }
  }
  return out
}

/** The sheet's conditions for a record: the level's named condition, its SRD
 *  conditions, and Hungover while it lasts. */
export function conditionsFor(conditions: readonly string[], rec: InebriationRecord): string[] {
  const base = withLevel(conditions.filter((c) => c !== HUNGOVER), rec.level)
  return rec.hangover_until ? [...base, HUNGOVER] : base
}
