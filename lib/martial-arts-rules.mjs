// The School of Martial Arts — the rules, pure, in one copy. (Typed face: lib/martial-arts.ts.)
//
// Sam, 2026-09-28, on sneak attacks, punches, kicks and special attacks:
// "That can fall under 'School of Martial Arts'."
//
// WHY THIS FILE IS PLAIN JAVASCRIPT. Same reason as lib/rage.mjs. The painted map
// (scripts/velkynvelve-walk/template.html) is a standalone page built by a Python script on Sam's
// machine, where there is no Node and so no TypeScript compiler. build_walk.py pastes this file into
// the page verbatim at its MARTIAL placeholder (minus the `export` keywords), so the map, the old
// battle board (via lib/martial-arts.ts) and the tests all read the SAME rules. Before this file the
// board knew six strikes and the map knew one: the kick, uppercut and sweep sparks Sam drew
// (2026-10-22) were baked and shipped, and nothing on the map ever asked for them.
//
// WHAT THE SCHOOL IS. A strike has two halves: the body swings, and something lands. What a player
// reads across a table, on a sprite a couple of hundred pixels tall, is the thing that lands. So the
// strikes here are shared hit sparks, attached to whichever sprite throws them — nobody needs a new
// body animation per move. The body still plays its one `attack`.
//
// THE ART. scripts/vfx/sources/unarmedStrikes, cut from Sam's six-pose sheet and baked by
// scripts/vfx/bake_strike_sparks.py. Only the sparks ship; the fighter's body poses are reference.

/** @typedef {"punch" | "kick" | "sneak" | "special" | "uppercut" | "sweep"} MartialArt */

/**
 * Impact sheet key in public/vfx/manifest.json, one per strike.
 * Source move in brackets (bake_strike_sparks.py).
 * @type {Record<MartialArt, string>}
 */
export const MARTIAL_IMPACT = {
  punch: "strikePunch",        // jab
  kick: "strikeKick",          // side kick
  sneak: "strikeSneak",        // flying knee
  special: "strikeSpecial",    // roundhouse
  uppercut: "strikeUppercut",  // uppercut
  sweep: "strikeSweep",        // sweep
}

/**
 * How hard each one hits the screen, against `physical`'s own 1.3.
 * A sneak attack is the biggest because it is the biggest NUMBER.
 * @type {Record<MartialArt, number>}
 */
export const MARTIAL_SCALE = {
  punch: 1.0, kick: 1.25, sneak: 1.6, special: 1.8, uppercut: 1.5, sweep: 1.4,
}

/**
 * The strikes whose spark is an ARC rather than a starburst. An arc is the path the limb swept, so
 * it has a direction: the source art is drawn with the attacker facing right, and a surface mirrors
 * these when the attacker faces left on screen. A starburst reads the same either way.
 * @type {ReadonlySet<MartialArt>}
 */
export const MARTIAL_DIRECTIONAL = new Set(["special", "uppercut", "sweep"])

/**
 * Whether a strike thrown from (fromX, fromZ) at (toX, toZ) travels toward the LEFT of the screen,
 * given the camera's right vector on the floor plane. No sideways component counts as right, which
 * is how the art was drawn.
 * @param {number} fromX @param {number} fromZ @param {number} toX @param {number} toZ
 * @param {number} camRightX @param {number} camRightZ
 * @returns {boolean}
 */
export function strikeFacesLeft(fromX, fromZ, toX, toZ, camRightX, camRightZ) {
  return (toX - fromX) * camRightX + (toZ - fromZ) * camRightZ < 0
}

/** Unarmed strikes, by the names a sheet or the DM actually writes. */
const PUNCH = /\b(punch|fist|jab|hook|knuckle)\b/i
const KICK = /\b(kick|roundhouse|shin|knee|stomp)\b/i
/**
 * The launchers: a blow that drives up and through. Stunning Strike is here rather than with the
 * specials because what it LOOKS like is a monk's rising hit, and the uppercut arc is drawn for it.
 */
const UPPERCUT = /\b(uppercut|launcher|stunning[\s-]?strike)\b/i
/**
 * Moves that put a creature on the floor: a sweep, a trip (Tripping Attack included), or a shove
 * whose stated aim is prone (SRD 5.1 "Shoving a Creature": knock it prone OR push it away). A bare
 * "Shove" is the push and stays an ordinary action.
 */
const SWEEP = /\b(sweep|trip|tripping)\b|\bshove\b.*\bprone\b|\bprone\b.*\bshove\b/i
/** SRD 5.1 Rogue: Sneak Attack. Written a dozen ways at a live table. */
const SNEAK = /\b(sneak[\s-]?attack|backstab|assassinate)\b/i
/**
 * Class-feature strikes that are a cut above a swing. Deliberately a short, named list: a special
 * that fires on every third attack stops being special.
 */
const SPECIAL = /\b(smite|divine[\s-]?strike|flurry|rage[\s-]?attack|brutal[\s-]?critical|action[\s-]?surge)\b/i

/**
 * Which strike this attack is, or null for an ordinary weapon swing.
 *
 * Null rather than a default: a longsword hit should look exactly as it always has. Only a named
 * move earns its own effect.
 *
 * Order matters. "Sneak attack with a kick" is a sneak attack — the rogue feature is the headline —
 * so SNEAK is tested first. The two named shapes come next (Stunning Strike is a launcher before it
 * is a special), then the specials, then the plain limbs.
 * @param {string | null | undefined} move
 * @returns {MartialArt | null}
 */
export function martialArtFor(move) {
  if (!move) return null
  const s = move.trim()
  if (!s) return null
  if (SNEAK.test(s)) return "sneak"
  if (UPPERCUT.test(s)) return "uppercut"
  if (SWEEP.test(s)) return "sweep"
  if (SPECIAL.test(s)) return "special"
  if (KICK.test(s)) return "kick"
  if (PUNCH.test(s)) return "punch"
  // "Unarmed Strike" with no limb named: SRD 5.1 lets it be a punch, kick, head-butt or anything
  // else, and a punch is the one everybody pictures.
  if (/\bunarmed\b/i.test(s)) return "punch"
  return null
}

/**
 * The impact sheet for an attack, or null to leave the surface's ordinary physical hit alone.
 * @param {string | null | undefined} move
 * @returns {string | null}
 */
export function martialImpactFor(move) {
  const art = martialArtFor(move)
  return art ? MARTIAL_IMPACT[art] : null
}

/** Every impact key this module can ask for — the art checklist. @type {string[]} */
export const ALL_MARTIAL_IMPACTS = Object.values(MARTIAL_IMPACT)

/**
 * A plain "Unarmed Strike" — no limb named — as the painted map throws it in a real fight.
 *
 * SRD 5.1 Unarmed Strike is "a punch, kick, head-butt, or similar forceful blow", so the map does
 * not have to pick one forever. A fighter trading blows alternates fist and foot (`nth` is how many
 * unarmed blows this attacker has landed this fight, counting from 0), and a critical hit lands as
 * the uppercut, the biggest picture the sheet has. Presentation only: the roll, the damage and the
 * rules are the same Unarmed Strike whichever spark plays.
 *
 * Claude's call (2026-10-25), not Sam's: he asked for Street Fighter-like swipes on melee
 * (2026-10-13) and supplied the art; the alternation and the crit rule are this file's reading of it.
 * @param {number} nth
 * @param {boolean} crit
 * @returns {MartialArt}
 */
export function unarmedBlow(nth, crit) {
  if (crit) return "uppercut"
  return (nth | 0) % 2 === 0 ? "punch" : "kick"
}

/**
 * The spark the painted map plays for a melee hit. One function so the map has no rule of its own.
 *
 * Order:
 *   1. a Sneak Attack that actually applied (the map decides that, once per turn) → the sneak spark;
 *   2. claws and bites → the roundhouse arc, the walk's beast-swipe since 2026-10-22 (Sam's swipe
 *      ruling for monster claws, 2026-10-15) — kept exactly as it was;
 *   3. a named move (Kick, Stunning Strike, Trip, Flurry of Blows, Divine Smite…) → its own spark,
 *      by martialArtFor, the same rule the board used;
 *   4. a plain Unarmed Strike → unarmedBlow (fist, foot, and the uppercut on a crit);
 *   5. anything else (a sword, a club) → null, and the map plays its ordinary physical impact.
 * @param {string} name the attack's name as the sheet writes it
 * @param {{sneak?: boolean, crit?: boolean, nth?: number}} [o]
 * @returns {MartialArt | null}
 */
export function walkStrike(name, o) {
  const opt = o || {}
  if (opt.sneak) return "sneak"
  const n = String(name || "")
  if (/\b(claws?|bite)\b/i.test(n)) return "special"
  if (isPlainUnarmed(n)) return unarmedBlow(opt.nth || 0, !!opt.crit)
  // a NAMED move keeps its own spark: a "Kick" stays a kick, a "Punch" a punch
  return martialArtFor(n)
}

/**
 * An unarmed strike that names no move ("Unarmed Strike") — the one whose limb the map is free to
 * vary. "Punch", "Kick", "Stunning Strike" and friends are named moves and are not plain.
 * @param {string | null | undefined} name
 * @returns {boolean}
 */
export function isPlainUnarmed(name) {
  const n = String(name || "")
  return /\bunarmed\b/i.test(n) && martialArtFor(n) === "punch" && !PUNCH.test(n)
}
