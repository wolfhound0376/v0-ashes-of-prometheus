// Challenge rating is TEXT in Postgres, and arrives in whatever form whoever
// wrote the row used: "8" and "0" from the chat route's stat resolver, "0.5"
// from one seeding pass, and "1/8" / "1/4" straight out of
// migrations/seed_bestiary_act1.sql.
//
// The dashboard's combat test used to be `(challenge_rating ?? 0) > 0`, leaning
// on JavaScript to coerce the string. That works for "8" and even "0.5", but
// Number("1/4") is NaN, and NaN > 0 is false. Every fractional-CR creature in
// the book therefore read as harmless no matter how active it was: no combat
// music, no combat framing.
//
// D&D writes the whole bottom of the ladder as eighths, quarters and halves, so
// fractions are not an edge case here - they are the entire CR 0-to-1 band.

/** CR as a number. Anything unparseable is 0, i.e. "not a threat". */
export function parseChallengeRating(cr: unknown): number {
  if (typeof cr === "number") return Number.isFinite(cr) ? cr : 0
  if (typeof cr !== "string") return 0

  const text = cr.trim()
  if (!text) return 0

  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(text)
  if (fraction) {
    const denominator = Number(fraction[2])
    return denominator === 0 ? 0 : Number(fraction[1]) / denominator
  }

  const value = Number(text)
  return Number.isFinite(value) ? value : 0
}

/**
 * True when a creature is dangerous enough to count as a fight.
 *
 * CR 0 is the campaign's marker for "ally, neutral, or scenery" - the chat
 * route writes 0 deliberately for anyone who should not get an HP bar or award
 * XP - so the threshold stays "greater than zero", exactly as before. The only
 * thing that changed is that "1/4" now reaches the comparison as 0.25.
 */
export function isCombatant(cr: unknown): boolean {
  return parseChallengeRating(cr) > 0
}
