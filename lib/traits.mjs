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
//   - Brave / Fey Ancestry need to know what a save is AGAINST. Malachar says it in his roll tag
//     ("| vs charmed"); the Underwalk passes the spell's or rider's condition. A save that names no
//     condition gets no advantage — the engine never guesses that a WIS save "was probably a charm".
//   - Fey Ancestry is a species rule, so it applies to foes too: the Underwalk's drow stat blocks carry
//     race "drow" (SRD drow 1608; OotA ch.1 1178 gives it to the priestesses). Magic Sleep leaves them,
//     and half-elf heroes, untouched (SRD 5.2.1's Sleep agrees: creatures that don't sleep succeed).

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
  // SRD 5.1 Halfling (campaign_chunks 2322): "Brave. You have advantage on saving throws against being
  // frightened."
  brave: {
    id: "brave",
    name: "Brave",
    rule: "Advantage on saving throws against being frightened.",
    source: "SRD 5.1 Halfling — Brave (campaign_chunks 2322)",
  },
  // SRD 5.1 Elf (2315) and Half-Elf (2320): "Fey Ancestry. You have advantage on saving throws against
  // being charmed, and magic can't put you to sleep." The drow stat block (1608) carries the same words,
  // and OotA ch.1 (1178) adds it to the Velkynvelve priestesses.
  feyAncestry: {
    id: "feyAncestry",
    name: "Fey Ancestry",
    rule: "Advantage on saving throws against being charmed, and magic can't put them to sleep.",
    source: "SRD 5.1 Elf/Half-Elf (campaign_chunks 2315, 2320); drow stat block (1608)",
  },
}

const speciesText = (roller) => (roller ? `${roller.species ?? ""} ${roller.race ?? ""}` : "")

/** "Lightfoot Halfling", "Stout Halfling", "Ghostwise Halfling", plain "Halfling" — any of them. */
export function isHalfling(roller) {
  return /\bhalfling\b/i.test(speciesText(roller))
}

/**
 * Elves, half-elves and drow ("Half-Elf", "High Elf", "Wood Elf", "Dark Elf (Drow)", "drow"). Not
 * "Shadar-kai" or a half-orc: the word must be elf/elven/drow on its own.
 */
export function hasFeyAncestry(roller) {
  return /\b(elf|elven|drow)\b/i.test(speciesText(roller))
}

/**
 * The roll-changing trait ids this character carries.
 * @param {Roller | null | undefined} roller
 * @returns {string[]}
 */
export function traitsFor(roller) {
  const out = []
  if (isHalfling(roller)) out.push(TRAITS.halflingLuck.id, TRAITS.brave.id)
  if (hasFeyAncestry(roller)) out.push(TRAITS.feyAncestry.id)
  return out
}

/** What a saving throw can be "against" that a trait cares about. Anything else is left alone. */
export const SAVE_AGAINST = ["charmed", "frightened"]

/** "vs charmed", "Charm", "frighten", "fear" → the condition, or null. */
export function normalizeAgainst(raw) {
  const s = String(raw ?? "").trim().toLowerCase().replace(/^(vs\.?|versus|against)\s+/, "").replace(/^being\s+/, "")
  if (/^charm/.test(s)) return "charmed"
  if (/^(fright|fear)/.test(s)) return "frightened"
  return null
}

/**
 * The advantage a trait grants on a save against a condition — Brave vs frightened, Fey Ancestry vs
 * charmed — or no firing. The caller combines it with any other advantage/disadvantage the usual way
 * (one of each cancels).
 * @param {Roller | null | undefined} roller
 * @param {string | null | undefined} against
 * @returns {{ advantage: boolean, firing: TraitFiring | null }}
 */
export function saveEdge(roller, against) {
  const vs = normalizeAgainst(against)
  const t =
    vs === "frightened" && isHalfling(roller) ? TRAITS.brave :
    vs === "charmed" && hasFeyAncestry(roller) ? TRAITS.feyAncestry : null
  if (!t) return { advantage: false, firing: null }
  return { advantage: true, firing: edgeFiring(t, roller, `advantage on the save against being ${vs}`) }
}

/** A creature whose Fey Ancestry means magic can't put it to sleep: the firing to show, or null. */
export function sleepProof(roller) {
  if (!hasFeyAncestry(roller)) return null
  return edgeFiring(TRAITS.feyAncestry, roller, "magic can't put them to sleep")
}

/** Combine the trait's edge with the roll's own: +1 advantage, -1 disadvantage, 0 straight (they cancel). */
export function withEdge(adv, edge) {
  return Math.sign((Math.sign(adv || 0)) + (edge ? 1 : 0))
}

function edgeFiring(t, roller, what) {
  const who = (roller && roller.name ? String(roller.name).split(" ")[0] : "") || "They"
  return { id: t.id, name: t.name, rule: t.rule, from: [], to: [], line: `${t.name}: ${who} — ${what}.` }
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
