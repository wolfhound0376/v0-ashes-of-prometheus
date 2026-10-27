/**
 * Roll maths OUT of anything spoken aloud.
 *
 * Sam, 9/26: "no one, not even Malachar, should talk about rolls - just the
 * consequences of the roll." The written log and the UI keep every number;
 * this runs only on the string headed to the voice pipeline (lib/tts
 * sanitizeForTTS), and removes the mechanics rather than pronouncing them.
 *
 * It used to do the opposite - read `1d20+3` as "one dee twenty plus three",
 * "DC 15" as "difficulty class fifteen" - which is how roll maths reached the
 * table's ears in Malachar's voice. The prompt now forbids the numbers; this
 * is the net under it, for anything that slips through or was written before.
 *
 *   "Roll for Stealth. [[1d20+7]]"                 -> "Roll for Stealth."
 *   "hits Kenta (14+5 = 19 vs AC 15) for 7 damage" -> "hits Kenta"
 *   "a natural 20!"                                -> "a critical!"
 *   "The drow bleeds. (Drow: 4/13 HP)"             -> "The drow bleeds."
 */
// ---------------------------------------------------------------------------
// Rolls and checks are never dialogue (Sam, 2026-10-26: "rolls, types of checks
// (insight, stealth) are not used as dialogue in bubbles, speech, in the pixel
// map as speech or the dashboard UI"). The dice panel and the roll prompt are
// where a check lives; a mouth, a speech bubble or the conversation log never
// carries one. Two helpers:
//
//   isRollLine(text)   a whole row that is a roll announcement or the roll's
//                      report to Malachar ("🎲 …", "[Dice Roll] …") — drop it.
//   stripRollTalk(t)   any sentence that calls for or reports a check is cut
//                      ("Roll for Stealth.", "Make a Wisdom (Insight) check."),
//                      then the leftover maths goes (stripRollMath). An empty
//                      result means the line had nothing but mechanics in it.
// ---------------------------------------------------------------------------

const ABILITY_WORDS = "strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha"
const CHECK_WORDS =
  "athletics|acrobatics|sleight of hand|stealth|arcana|history|investigation|nature|religion|animal handling|" +
  "insight|medicine|perception|survival|deception|intimidation|performance|persuasion|thieves'? tools|initiative"
const CHECK_NAME = `(?:${ABILITY_WORDS}|${CHECK_WORDS})`

/** A sentence that is mechanics, not speech: it names a check, a save, a DC, or carries a roll tag. */
const CHECK_SENTENCE: RegExp[] = [
  /\[\[[^\]]*\]\]/,                                                                     // [[1d20+3]]
  new RegExp(`\\b${CHECK_NAME}\\s*(?:\\([^)]*\\)\\s*)?(?:check|save|saving throw|roll)s?\\b`, "i"),   // "Wisdom (Insight) check", "Stealth roll"
  new RegExp(`\\b(?:roll|check)s?\\s+(?:for|on|with)\\s+(?:your\\s+)?${CHECK_NAME}\\b`, "i"),          // "Roll for Stealth"
  /\bsaving throws?\b/i,
  /\b(?:ability|skill) checks?\b/i,
  /\b(?:AC|DC)\s*:?\s*\d+/,
]

/** True for a row that is a roll announcement or a roll result sent to Malachar — never a line anyone said. */
export function isRollLine(text: string | null | undefined): boolean {
  const t = String(text ?? "").trimStart()
  return t.startsWith("🎲") || /^(?:\[ROLL_RESULT:[^\]]*\]\s*)?\[\s*dice\s*roll\s*\]/i.test(t)
}

/** The words of a line with every check call and roll figure removed. "" when nothing but mechanics was there. */
export function stripRollTalk(text: string | null | undefined): string {
  const raw = String(text ?? "")
  if (!raw.trim() || isRollLine(raw)) return ""
  // A check named in passing in brackets: "(Insight)", "(Wisdom save)".
  const unbracketed = raw.replace(new RegExp(`\\s*\\(\\s*${CHECK_NAME}[^()]*\\)`, "gi"), "")
  // Sentences, each with its closing punctuation and any closing quote.
  const sentences = unbracketed.match(/[^.!?…]+(?:[.!?…]+|$)["”’']?\s*/g) ?? [unbracketed]
  const kept = sentences.filter((s) => !CHECK_SENTENCE.some((re) => re.test(s))).join("")
  return stripRollMath(kept)
}

export function stripRollMath(text: string): string {
  return (
    text
      // The roll-request tag: it puts dice in a player's hand, it is not words.
      .replace(/\[\[[^\]]*\]\]/g, "")
      // Any bracketed mechanical tag that reached this far ([DAMAGE: 7 fire]).
      .replace(/\[[A-Z][A-Z_ ]*:[^\]]*\]/g, "")
      // A parenthetical carrying numbers is a workings-out, never speech:
      // (14+5 = 19 vs AC 15), (Hook Horror: 63/75 HP), (Stealth: 12).
      .replace(/\s*\([^()]*\d[^()]*\)/g, "")
      // Rolls as words.
      .replace(/\bnat(?:ural)?\s*20\b/gi, "critical")
      .replace(/\bnat(?:ural)?\s*1\b/gi, "fumble")
      // Dice notation: 1d20+3, 2d6, d20, 2d6+2d4.
      .replace(/\b\d*[dD]\d+(?:\s*[+-]\s*\d+(?:[dD]\d+)?)*/g, "")
      // Target numbers: "vs AC 15", "against DC 13", "DC 12", "AC 16".
      .replace(/\s*\b(?:vs\.?|versus|against)\s+(?:AC|DC)\s*:?\s*\d+/gi, "")
      .replace(/\b(?:AC|DC)\s*:?\s*\d+/g, "")
      // Totals and damage figures: "= 19", "for 7 damage", "takes 12".
      .replace(/\s*=\s*\d+/g, "")
      .replace(/\s*\bfor\s+\d+(?:\s+points?\s+of)?(?:\s+\w+)?\s+damage\b/gi, "")
      .replace(/\b(takes?|deals?)\s+\d+(?:\s+\w+)?\s+damage\b/gi, "$1 a wound")
      // Hit points: "63/75 HP", "4 HP".
      .replace(/\s*\b\d+\s*\/\s*\d+\s*(?:HP|hit points)\b/gi, "")
      .replace(/\s*\b\d+\s*(?:HP|hit points)\b/gi, "")
      // "rolled a 17", "rolls 12+3" - who rolled survives, the number does not.
      .replace(/\b(roll(?:s|ed)?)\s+(?:an?\s+)?\d+(?:\s*[+-]\s*\d+)*/gi, "$1")
      // Tidy what the removals left behind.
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/([—-])\s*([.,;:!?])/g, "$2")
      .replace(/\s{2,}/g, " ")
      .trim()
  )
}
