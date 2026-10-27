/**
 * Malachar's roll request tag.
 *
 *   [[1d20+7]]                          the dice alone (every existing request)
 *   [[1d20+7 | stealth | DC 15]]        a skill check the engine can read
 *   [[1d20+2 | vs charmed | DC 13]]     a save against a condition a trait cares about
 *
 * The two trailing fields are optional and order-free: any segment that reads
 * "DC 15" is the DC, "vs charmed" / "vs frightened" is what a save is against
 * (lib/traits.mjs: Fey Ancestry and Brave give advantage on those), any other
 * segment is the skill. They exist so a skill
 * check is legible to the engine (docs/claude_Earned_Proficiency.md §2) — the
 * DC is server-only and never reaches the client; `stripRollRequestExtras`
 * cuts the tag back to its bare dice before the text is shown or stored.
 */
import { normalizeAgainst } from "./traits.mjs"

export const ROLL_REQUEST_PATTERN = /\[\[\s*(\d*)\s*d\s*(\d+)\s*([+-]\s*\d+)?\s*((?:\|[^\]|]*)*)\]\]/i

/** The 18 SRD skills, snake_case — the only values roll_requests.skill accepts. */
export const SRD_SKILLS = [
  "athletics",
  "acrobatics", "sleight_of_hand", "stealth",
  "arcana", "history", "investigation", "nature", "religion",
  "animal_handling", "insight", "medicine", "perception", "survival",
  "deception", "intimidation", "performance", "persuasion",
] as const
export type SrdSkill = (typeof SRD_SKILLS)[number]

/** "Sleight of Hand" / "animal-handling" / "STEALTH" -> the snake_case key, or null if it is not a skill. */
export function normalizeSkillName(raw: string): SrdSkill | null {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_")
  return (SRD_SKILLS as readonly string[]).includes(key) ? (key as SrdSkill) : null
}

export interface RollRequestSpec {
  id: string
  correlationId: string
  expression: string
  die: string
  diceCount: number
  modifier: number
  purpose?: string | null
  /** snake_case SRD skill when Malachar named one in the tag. The DC deliberately never rides along. */
  skill?: string | null
  /**
   * What the save is against, when it is a condition a trait answers ("charmed", "frightened"). Rides to
   * the browser only (not stored): the dice engine gives Brave / Fey Ancestry their advantage from it.
   */
  against?: "charmed" | "frightened" | null
  status: "pending" | "resolved" | "consumed" | "rejected"
}

export interface StructuredRollResult {
  die: string
  rolls: number[]
  modifier: number
  total: number
  label?: string
  rollMode?: "normal" | "advantage" | "disadvantage"
}

export interface ParsedRollRequest {
  expression: string
  die: string
  diceCount: number
  modifier: number
  /** null unless the tag named a recognised skill */
  skill: SrdSkill | null
  /** null unless the tag carried "DC n" */
  dc: number | null
  /** null unless the tag carried "vs charmed" / "vs frightened" */
  against: "charmed" | "frightened" | null
}

/** Read the optional "| skill | DC n" fields. Unknown skills and unparseable DCs are dropped, never guessed. */
function parseExtras(suffix: string | undefined): { skill: SrdSkill | null; dc: number | null; against: "charmed" | "frightened" | null } {
  let skill: SrdSkill | null = null
  let dc: number | null = null
  let against: "charmed" | "frightened" | null = null
  if (!suffix) return { skill, dc, against }
  for (const segment of suffix.split("|")) {
    const text = segment.trim()
    if (!text) continue
    const dcMatch = /^dc\s*:?\s*(\d+)$/i.exec(text)
    if (dcMatch) {
      const value = Number.parseInt(dcMatch[1], 10)
      if (Number.isSafeInteger(value) && value >= 1 && value <= 40) dc = value
      continue
    }
    const vs = /^(vs\.?|versus|against)\b/i.test(text) ? normalizeAgainst(text) : null
    if (vs) {
      if (!against) against = vs as "charmed" | "frightened"
      continue
    }
    if (!skill) skill = normalizeSkillName(text)
  }
  return { skill, dc, against }
}

/** Extract Malachar's first explicit [[XdY+Z]] request from a turn. */
export function parseRollRequest(text: string): ParsedRollRequest | null {
  const match = ROLL_REQUEST_PATTERN.exec(text)
  if (!match) return null

  const diceCount = match[1] ? Number.parseInt(match[1], 10) : 1
  const sides = Number.parseInt(match[2], 10)
  const modifier = match[3] ? Number.parseInt(match[3].replace(/\s+/g, ""), 10) : 0
  if (!Number.isSafeInteger(diceCount) || diceCount < 1 || diceCount > 20) return null
  if (!Number.isSafeInteger(sides) || sides < 2 || sides > 100) return null
  if (!Number.isSafeInteger(modifier) || Math.abs(modifier) > 100) return null

  const expression = `${diceCount}d${sides}${modifier > 0 ? `+${modifier}` : modifier < 0 ? modifier : ""}`
  const { skill, dc, against } = parseExtras(match[4])
  return { expression, die: `d${sides}`, diceCount, modifier, skill, dc, against }
}

/**
 * Cut every extended tag back to its bare dice: [[1d20+7 | stealth | DC 15]]
 * -> [[1d20+7]]. Tags with no extras are returned byte-for-byte unchanged, so
 * nothing downstream (the log, the dice parsers, TTS stripping) sees a
 * difference until Malachar actually uses the new form. The DC is the point:
 * it must never reach the table.
 */
export function stripRollRequestExtras(text: string): string {
  return text.replace(/\[\[([^\]|]*)\|[^\]]*\]\]/g, (_whole, dice: string) => `[[${dice.replace(/\s+/g, "")}]]`)
}

/** Fast client-side guard. The server repeats every check before accepting. */
export function rollMatchesRequest(request: RollRequestSpec, result: StructuredRollResult): boolean {
  const sides = Number.parseInt(result.die.replace(/^d/i, ""), 10)
  if (result.rollMode && result.rollMode !== "normal") return false
  if (result.die.toLowerCase() !== request.die.toLowerCase()) return false
  if (result.rolls.length !== request.diceCount) return false
  if (result.modifier !== request.modifier) return false
  if (result.rolls.some((roll) => !Number.isInteger(roll) || roll < 1 || roll > sides)) return false
  return result.total === result.rolls.reduce((sum, roll) => sum + roll, 0) + result.modifier
}

export function resultForTransport(result: StructuredRollResult) {
  return {
    die: result.die,
    rolls: result.rolls,
    modifier: result.modifier,
    total: result.total,
    label: result.label ?? null,
    rollMode: result.rollMode ?? "normal",
  }
}
