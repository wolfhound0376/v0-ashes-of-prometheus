/**
 * WHAT A MONSTER IS HOLDING, ACCORDING TO ITS OWN STAT BLOCK.
 *
 * Player tokens have an inventory to read; monsters do not. What they DO have
 * is `bestiary.actions` — the SRD action list, which names the weapon in the
 * first line of every entry. A drow's block says Shortsword and Hand Crossbow,
 * and a drow model standing empty-handed on the board while its log line reads
 * "hits with Shortsword" is the board disagreeing with itself.
 *
 * Two things must not become props:
 *
 *   Multiattack, which is not a weapon but an instruction about weapons; and
 *   NATURAL attacks — a claw, a hook, a bite — which are already the creature's
 *   own body. Prince Derendil attacks with Claw, and a quaggoth issued a sword
 *   because "Claw" was not recognised is a worse picture than an empty hand.
 *
 * This picks the name only. What that name becomes in the fist is
 * archetypeFor's business, and it is the one that decides a claw is nothing.
 */

/** One row of a creature's action list, as the bestiary stores it. */
export interface StatBlockAction {
  name?: string | null
}

/** An instruction about attacks, not an attack. */
// Anchored on the WORD, not the whole string: a stat block writes
// "Multiattack (Humanoid/Hybrid)" for a wererat, and the old ^...$ let that
// through — Topsy and Turvy were both logged holding a weapon called
// "Multiattack (Humanoid/Hybrid)".
const NOT_A_WEAPON = /\bmulti-?attack\b/i

/**
 * Attacks made with the body. `archetypeFor` also refuses most of these, but
 * the two lists exist for different reasons and must both be right: this one
 * stops a natural attack being CHOSEN, that one stops it being DRAWN.
 */
const NATURAL = /\b(claw|claws|bite|hook|hooks|beak|talon|talons|pincer|gore|sting|slam|tail|horn|tentacle|fist|unarmed|punch|kick|spore|breath|touch)\b/i

/** Anything that is plainly a spell rather than an object in a hand. */
const SPELL_LIKE = /\b(ray|bolt|blast|aura|gaze|cloud|summon|command|word|shriek|roar|cry|wail|screech)\b/i

/**
 * The weapon this creature should be seen holding, or null for empty hands.
 *
 * The FIRST qualifying action, because a stat block leads with the attack the
 * creature is built around — a drow's shortsword before its hand crossbow.
 * Reaching past it for something more photogenic would be the board inventing
 * a fact about the monster.
 */
export function weaponFromActions(actions: unknown): string | null {
  if (!Array.isArray(actions)) return null
  for (const raw of actions as StatBlockAction[]) {
    const name = String(raw?.name ?? "").trim()
    if (!name) continue
    if (NOT_A_WEAPON.test(name)) continue
    if (NATURAL.test(name)) continue
    if (SPELL_LIKE.test(name)) continue
    return name
  }
  return null
}
