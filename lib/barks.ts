/**
 * WHAT THE MONSTERS SAY WHILE THEY FIGHT.
 *
 * Sam: "The drow, derendil, jimjar need to be more animated, speak every so
 * often." A board where nine figures trade dice in silence reads as a
 * spreadsheet with models on it.
 *
 * This is the games industry's oldest trick for making a world feel inhabited:
 * the BARK — a short, canned line fired on an event, on a cooldown, chosen so
 * it is never the same twice running. It is what makes a Diablo dungeon sound
 * occupied rather than populated, and what carries a Baldur's Gate fight
 * between dice rolls.
 *
 * Two rules the research is unanimous about, and both are enforced here:
 *
 *   1. A bark that fires every time stops being a bark and becomes noise.
 *      Barks are SPACED — the standard is one every several beats, per
 *      speaker, not per event.
 *   2. The same voice must not repeat itself back to back. Repetition is what
 *      makes canned lines sound canned.
 *
 * Deterministic on purpose. Every browser at the table runs this over the same
 * (creature, round) and gets the same answer, so the line is the same for
 * everyone with nothing stored and nothing synchronised. It is also why this
 * is a pure function and not a `Math.random()` at the call site.
 */

/** One creature's repertoire, in its own register. */
const BARKS: Record<string, string[]> = {
  // The drow of Velkynvelve: contemptuous, devout, bored by the surfacers.
  drow: [
    "Squirm, surface filth.",
    "Lolth is watching. Try to be interesting.",
    "You bleed slowly. I approve.",
    "Back to your cage.",
  ],
  "drow elite warrior": [
    "Hold the line.",
    "You are nothing. Stand still and be nothing quietly.",
    "I have killed better on a slow day.",
  ],
  "drow priestess of lolth": [
    "The Spider Queen sees you.",
    "Your struggling pleases her. Continue.",
    "You were promised to the Web. Come along.",
  ],
  // A quaggoth who believes, with his whole heart, that he is an elf prince.
  // The tragedy is that he is entirely sincere, so the lines are noble and
  // the body saying them is not.
  "prince derendil": [
    "I am DERENDIL! Prince of Nelrindenvane!",
    "Stand aside — I am no beast!",
    "When I am restored, I will remember who stood with me.",
    "This shape is a lie. My blood is elven.",
  ],
  // A deep gnome who will bet on absolutely anything, including this.
  jimjar: [
    "Two gold says I hit.",
    "Care to wager on that one?",
    "I had money on you lasting longer. No offence.",
    "Odds are shifting. I like them.",
  ],
  // A derro who is quietly certain he is a god, and quietly murderous.
  buppido: [
    "You cannot kill what is divine.",
    "Diinkarazan's blood runs in me.",
    "Soon. Soon I will show you all.",
  ],
  // A kuo-toa pacifist who fights only because he must.
  "shuushar the awakened": [
    "I take no joy in this.",
    "Peace would have cost you nothing.",
    "The water remembers every blow.",
  ],
  // An orc who has been bullied and passes it downward.
  ront: [
    "Weak. All of you.",
    "Ront breaks you.",
    "Move and I hit you again.",
  ],
  // A shield dwarf who would rather be anywhere else, with an axe.
  "eldeth feldrun": [
    "For Gauntlgrym!",
    "Come on then, you spider-loving wretch.",
    "I'll be carrying you out, mark me.",
  ],
  "sarith kzekarit": [
    "Do not look at me. Fight.",
    "Something is wrong with me. Later. Later.",
  ],
}

/** Every creature that has anything to say. */
export const BARKING = Object.keys(BARKS)

/** Stable, order-independent hash. Two creatures must not share a rhythm. */
function hashOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** The registry's key for a label, so "Drow Guard" still finds the drow. */
export function barkKeyFor(label: string | null | undefined): string | null {
  const name = String(label ?? "").trim().toLowerCase()
  if (!name) return null
  if (BARKS[name]) return name
  // Longest match first: "drow elite warrior" must win over "drow".
  const byLength = BARKING.slice().sort((a, b) => b.length - a.length)
  return byLength.find((k) => name.includes(k)) ?? null
}

/**
 * How often one creature speaks. Every third round of its own turns — often
 * enough to have a personality, rare enough that the fourth time you hear it
 * is not in the same fight.
 */
export const BARK_EVERY = 3

/**
 * What this creature says on this round, or null for "nothing, this time".
 *
 * The hash offsets each creature's cycle, so three drow in a room do not all
 * speak on round 3 and then all fall silent together — one talks on round 1,
 * another on round 2, and the room sounds like a room.
 */
export function barkFor(label: string | null | undefined, round: number): string | null {
  const key = barkKeyFor(label)
  if (!key || !Number.isFinite(round) || round < 1) return null
  const lines = BARKS[key]
  if (!lines.length) return null
  // The token's own name, not the key: two drow guards on the same board are
  // different speakers and must not chorus.
  const seed = hashOf(String(label))
  if ((round + (seed % BARK_EVERY)) % BARK_EVERY !== 0) return null
  // Walk the list rather than picking at random, so a creature never says the
  // same thing twice running however long the fight lasts.
  const step = Math.floor((round + (seed % BARK_EVERY)) / BARK_EVERY)
  return lines[(step + (seed % lines.length)) % lines.length]
}

/**
 * THE ONES THAT HAVE ACTUALLY BEEN RECORDED.
 *
 * Sam asked for the barks spoken rather than printed, and said to use the
 * premade voices first — which was right: every creature here already had an
 * ElevenLabs voice chosen for it in `npc_encounters`, with a hand-written
 * description to match. Nothing needed inventing. The drow speak in the voice
 * assigned to the Drow Guard, Derendil in the one built for him, Jimjar in
 * his own.
 *
 * A key is in this set ONLY when every one of its lines exists in the bucket.
 * A half-recorded creature would speak aloud on one round and silently on the
 * next, which is worse than staying quiet — so the rest print their line and
 * wait their turn to be cut.
 */
export const RECORDED = new Set(["drow", "prince derendil", "jimjar"])

/**
 * The sound file for a line that has just been spoken, or null.
 *
 * Matched on the TEXT rather than carried on the row, so nothing had to be
 * added to the dialogue table and an older seat inserting a bark still makes
 * a newer board play it. The index is the line's position in the repertoire,
 * which is exactly how the files were cut and named.
 */
export function barkAudioFor(
  speaker: string | null | undefined,
  text: string | null | undefined,
): string | null {
  const key = barkKeyFor(speaker)
  if (!key || !RECORDED.has(key)) return null
  const i = BARKS[key].indexOf(String(text ?? "").trim())
  if (i < 0) return null
  return `barks/${key.replace(/\s+/g, "-")}_${i}`
}
