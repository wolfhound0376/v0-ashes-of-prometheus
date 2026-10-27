// Character traits that change a roll — the rules, pure, in one copy.
//
// WHY THIS FILE EXISTS (Sam, 2026-10-26: "make sure that we have character abilities that are tied to
// rules pop up when they are needed"). Until now a halfling's Lucky trait was a line of text on the
// Forge and a sentence in Malachar's prompt asking him to "honor" it. He never could: every committed
// roll reaches him with "do not re-roll", and the Underwalk resolves its own attacks and saves without
// him at all. A trait that changes a roll has to live where the roll is made.
//
// So this file answers two questions for every roll-maker in the game:
//   1. Which roll-changing traits does this character have?   traitsFor(roller)
//   2. Does one fire on this roll, and what does it change?    luckOnFaces(...)
// and hands back a TraitFiring the caller shows as a popup — the trait announces itself at the moment it
// matters, the way a player at a real table says "I'm a halfling, I reroll that".
//
// WHY PLAIN JAVASCRIPT. Same reason as lib/rage.mjs: the Underwalk (scripts/velkynvelve-walk/template.html)
// is built by Python on Sam's machine, which has no Node. build_walk.py pastes this file into the page at
// its TRAITS placeholder minus the `export` keywords, so the dashboard's dice engine, the Underwalk and the
// tests all read the SAME functions. tsconfig has allowJs; the JSDoc types the exports.
//
// THE SOURCE, ingested in campaign_chunks (id 2322, SRD 5.1 Halfling):
//   "Lucky. When you roll a 1 on the d20 for an attack roll, ability check, or saving throw, you can
//    reroll the die and must use the new roll."
// SRD 5.2.1 (canon, NOT ingested) keeps the same rule as "Luck" on a D20 Test; nothing here quotes it.
//
// RULINGS this file makes, flagged so Sam can overrule them:
//   - "can reroll" is applied AUTOMATICALLY. A reroll of a 1 can never come out worse, so no player
//     ever declines it; asking every time would only slow the table down.
//   - With advantage or disadvantage BOTH d20s are "the d20 for" the roll, so each die showing a 1 is
//     rerolled once (the common table reading, and Sage Advice's). Then the higher/lower is kept as usual.
//   - Once only: "must use the new roll", so a second 1 stands.
//   - Initiative is a Dexterity check, so Luck applies to it.
//   - Not a D20 Test, no Luck: damage, hit dice, random tables (the d20 "Scavenged possession" roll),
//     anything a caller marks test: false.

/** @typedef {{ name?: string | null, species?: string | null, race?: string | null }} Roller */
/**
 * @typedef {{
 *   id: string, name: string, rule: string,
 *   from: number[], to: number[],
 *   line: string,
 * }} TraitFiring
 */

/** The catalog of roll-changing traits the game knows. Each wired trait cites where it is enforced. */
export const TRAITS = {
  halflingLuck: {
    id: "halflingLuck",
    name: "Halfling Luck",
    rule: "A 1 on an attack, check or save is rerolled. The new roll stands.",
    source: "SRD 5.1 Halfling — Lucky (campaign_chunks 2322)",
  },
}

/** "Lightfoot Halfling", "Stout Halfling", "Ghostwise Halfling", plain "Halfling" — any of them. */
export function isHalfling(roller) {
  if (!roller) return false
  const s = `${roller.species ?? ""} ${roller.race ?? ""}`
  return /\bhalfling\b/i.test(s)
}

/**
 * The roll-changing trait ids this character carries.
 * @param {Roller | null | undefined} roller
 * @returns {string[]}
 */
export function traitsFor(roller) {
  const out = []
  if (isHalfling(roller)) out.push(TRAITS.halflingLuck.id)
  return out
}

/**
 * Halfling Luck on a set of physical d20 faces (one die, or the pair under advantage/disadvantage).
 * Each 1 is replaced ONCE by `reroll()`. Returns the new faces and a firing record, or no firing when
 * nothing changed. Pure: the caller decides where the reroll comes from (the 3D dice, or Math.random).
 *
 * @param {number[]} faces
 * @param {() => number} reroll
 * @param {Roller | null | undefined} roller
 * @returns {{ faces: number[], firing: TraitFiring | null }}
 */
export function luckOnFaces(faces, reroll, roller) {
  if (!isHalfling(roller)) return { faces: faces.slice(), firing: null }
  const from = [], to = []
  const out = faces.map((f) => {
    if (f !== 1) return f
    const n = reroll()
    from.push(1)
    to.push(n)
    return n
  })
  if (from.length === 0) return { faces: out, firing: null }
  return { faces: out, firing: luckFiring(roller, to) }
}

/**
 * The firing record for a Luck reroll whose new faces are already known (the 3D dice rolled them).
 * @param {Roller | null | undefined} roller
 * @param {number[]} to  the new face for each 1
 * @returns {TraitFiring}
 */
export function luckFiring(roller, to) {
  const t = TRAITS.halflingLuck
  const who = (roller && roller.name ? String(roller.name).split(" ")[0] : "") || "The halfling"
  const changes = to.map((n) => `1 → ${n}`).join(", ")
  const stood = to.includes(1) ? " The second 1 stands." : ""
  return {
    id: t.id,
    name: t.name,
    rule: t.rule,
    from: to.map(() => 1),
    to: to.slice(),
    line: `${t.name}: ${who} rerolls the 1 (${changes}).${stood}`,
  }
}

/** How many of these faces Luck would reroll — the dice engine throws exactly that many new dice. */
export function luckRerollCount(faces, roller) {
  if (!isHalfling(roller)) return 0
  return faces.filter((f) => f === 1).length
}

/**
 * Put the rerolled faces back in place of the 1s, in order. Used by the 3D dice path, which rolls
 * `luckRerollCount` fresh dice and then needs them spliced in.
 * @param {number[]} faces
 * @param {number[]} fresh
 */
export function spliceLuck(faces, fresh) {
  let i = 0
  return faces.map((f) => (f === 1 && i < fresh.length ? fresh[i++] : f))
}
