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
