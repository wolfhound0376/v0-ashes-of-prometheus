// Dice rolling utilities for World AI

export interface DiceParseResult {
  count: number
  sides: number
  mod: number
  notation: string
}

export interface DiceRollResult {
  rolls: number[]
  total: number
  isCrit: boolean
  isFail: boolean
  notation: string
  name?: string
}

/**
 * Parse a dice notation string like "1d20+5" or "2d6-2"
 */
export function parseDice(notation: string): DiceParseResult | null {
  const m = notation.match(/(\d*)d(\d+)([+-]\d+)?/i)
  if (!m) return null
  return {
    count: parseInt(m[1]) || 1,
    sides: parseInt(m[2]),
    mod: m[3] ? parseInt(m[3]) : 0,
    notation: notation.trim()
  }
}

/**
 * Roll dice based on a notation string
 */
export function rollDice(notation: string, name?: string): DiceRollResult | null {
  const parsed = parseDice(notation)
  if (!parsed) return null

  const rolls: number[] = []
  for (let i = 0; i < parsed.count; i++) {
    rolls.push(Math.floor(Math.random() * parsed.sides) + 1)
  }

  const rollSum = rolls.reduce((a, b) => a + b, 0)
  const total = rollSum + parsed.mod

  // Critical success/failure only on single d20 rolls
  const isCrit = parsed.sides === 20 && parsed.count === 1 && rolls[0] === 20
  const isFail = parsed.sides === 20 && parsed.count === 1 && rolls[0] === 1

  return {
    rolls,
    total,
    isCrit,
    isFail,
    notation: parsed.notation,
    name
  }
}

/**
 * Format a dice result for display
 */
export function formatDiceResult(result: DiceRollResult): string {
  const parsed = parseDice(result.notation)
  if (!parsed) return `${result.total}`

  let formula = `${parsed.count}d${parsed.sides}`
  if (parsed.mod !== 0) {
    formula += ` ${parsed.mod >= 0 ? '+' : ''}${parsed.mod}`
  }

  if (result.rolls.length > 1) {
    return `${formula} [${result.rolls.join(', ')}] = ${result.total}`
  }

  return `${formula} = ${result.total}`
}

/**
 * Extract inline dice notation from text (e.g., [[1d20+5]])
 */
export function extractInlineDice(text: string): { notation: string; name?: string }[] {
  const matches = text.matchAll(/\[\[(\d*d\d+[+-]?\d*)\]\]/gi)
  return Array.from(matches).map(m => ({
    notation: m[1]
  }))
}

/**
 * Replace inline dice notation with clickable elements (returns JSX-compatible data)
 */
export function parseTextWithDice(text: string): Array<{ type: 'text' | 'dice'; content: string; notation?: string }> {
  const parts: Array<{ type: 'text' | 'dice'; content: string; notation?: string }> = []
  let lastIndex = 0
  const regex = /\[\[(\d*d\d+[+-]?\d*)\]\]/gi
  let match

  while ((match = regex.exec(text)) !== null) {
    // Add text before the dice notation
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index)
      })
    }

    // Add the dice notation
    parts.push({
      type: 'dice',
      content: match[1],
      notation: match[1]
    })

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex)
    })
  }

  return parts
}
