export const ROLL_REQUEST_PATTERN = /\[\[\s*(\d*)\s*d\s*(\d+)\s*([+-]\s*\d+)?\s*\]\]/i

export interface RollRequestSpec {
  id: string
  correlationId: string
  expression: string
  die: string
  diceCount: number
  modifier: number
  purpose?: string | null
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
  return { expression, die: `d${sides}`, diceCount, modifier }
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
