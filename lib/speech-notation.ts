/**
 * Dice/DC notation → spoken form for the ElevenLabs pipeline. (PR-1)
 *
 * Malachar writes `1d20+3` correctly and the UI must keep that exact written
 * form — but ElevenLabs mangles the pronunciation. This helper rewrites the
 * notation on the string headed to the voice pipeline, and nowhere else.
 *
 *   1d20+3  → "one dee twenty plus three"
 *   2d6     → "two dee six"
 *   d20     → "dee twenty"
 *   DC 15   → "difficulty class fifteen"
 *   AC 16   → "armor class sixteen"
 *
 * Advantage/disadvantage already read fine and are deliberately left alone.
 */

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
]
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]

/** 0–999 in words; anything larger falls back to digits (TTS reads those fine). */
function numberToWords(n: number): string {
  if (n < 0 || !Number.isInteger(n)) return String(n)
  if (n < 20) return ONES[n]
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)]
    const rest = n % 10
    return rest === 0 ? tens : `${tens} ${ONES[rest]}`
  }
  if (n < 1000) {
    const hundreds = `${ONES[Math.floor(n / 100)]} hundred`
    const rest = n % 100
    return rest === 0 ? hundreds : `${hundreds} ${numberToWords(rest)}`
  }
  return String(n)
}

/**
 * Rewrite dice and DC/AC notation to spoken form. Pure function; call it only
 * on the string handed to the voice pipeline — the UI keeps `1d20+3` as-is.
 */
export function toSpokenNotation(text: string): string {
  return (
    text
      // A whole dice expression chain: 1d20+3, 2d6, d20, 2d6+2d4, 1d8-2 …
      // Matched as one unit, then tokenized, so mixed chains of dice and flat
      // riders all come out right. A +N/-N is only spoken as plus/minus when
      // it is attached to a die expression — a lone "+3" in prose is left be.
      .replace(/\b(?:\d+)?[dD]\d+(?:\s*[+-]\s*\d+(?:[dD]\d+)?)*/g, (expr) =>
        expr
          .split(/\s*([+-])\s*/)
          .map((tok) => {
            if (tok === "+") return "plus"
            if (tok === "-") return "minus"
            const die = tok.match(/^(\d+)?[dD](\d+)$/)
            if (die) {
              const spoken = `dee ${numberToWords(Number(die[2]))}`
              return die[1] ? `${numberToWords(Number(die[1]))} ${spoken}` : spoken
            }
            return numberToWords(Number(tok))
          })
          .join(" "),
      )
      // DC 15 → difficulty class fifteen
      .replace(/\bDC\s*:?\s*(\d+)\b/gi, (_m, n) => `difficulty class ${numberToWords(Number(n))}`)
      // AC 16 → armor class sixteen
      .replace(/\bAC\s*:?\s*(\d+)\b/gi, (_m, n) => `armor class ${numberToWords(Number(n))}`)
  )
}
