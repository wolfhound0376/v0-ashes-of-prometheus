// The School of Martial Arts.
//
// Sam, 2026-09-28, on sneak attacks, punches, kicks and special attacks:
// "That can fall under 'School of Martial Arts'."
//
// Which is the same trick as the eight magic schools in lib/spell-school, and
// it works for the same reason. A cast has two halves — the body and the
// magic — and only the magic needs to be recognisable, so the school lives in
// one shared rune rather than in eight cast animations per caster. A STRIKE
// has the same two halves: the body swings, and something lands.
//
// What a player reads across a table, on a sprite a couple of hundred pixels
// tall, is the thing that lands. So the four strikes here are shared effects,
// generated once, attached to whichever sprite is throwing them — and nobody
// needs four new body animations.
//
// WHAT THIS HONESTLY DOES NOT DO
// ------------------------------
// The body still plays its one `attack`. A punch and a kick share a windup,
// and at the board's camera distance the effect is what sells them apart —
// which is exactly how a fighting game does it, and it is on screen for under
// a second. If a kick ever needs its own drawn windup, that is a per-character
// animation and no amount of shared effect will stand in for it. This buys the
// read, not the choreography, and it buys it for four generations' worth of art
// instead of four per character.
//
// The kit already had the hook: `physical` is a DamageType with no rune and a
// charge short enough to read as a swing. These are its variants.

/**
 * The strikes. Named for what a player would call them, not for a stat.
 *
 * Sam, 2026-10-22, supplied drawn hit sparks for six moves. The four
 * originals took four of them and the other two became strikes of their own:
 * an uppercut for the launchers (Stunning Strike) and a sweep for the moves
 * that put someone on the floor.
 */
export type MartialArt = "punch" | "kick" | "sneak" | "special" | "uppercut" | "sweep"

/** Impact sheet key in public/vfx/manifest.json, one per strike. */
export const MARTIAL_IMPACT: Record<MartialArt, string> = {
  punch: "strikePunch",
  kick: "strikeKick",
  sneak: "strikeSneak",
  special: "strikeSpecial",
  uppercut: "strikeUppercut",
  sweep: "strikeSweep",
}

/**
 * How hard each one hits the screen, against `physical`'s own 1.3.
 *
 * A sneak attack is the biggest because it is the biggest NUMBER — a rogue's
 * whole turn is that one die pool, and the board should say so.
 */
export const MARTIAL_SCALE: Record<MartialArt, number> = {
  punch: 1.0, kick: 1.25, sneak: 1.6, special: 1.8, uppercut: 1.5, sweep: 1.4,
}

/**
 * The strikes whose spark is an ARC rather than a starburst. An arc is the
 * path the limb swept, so it has a direction: the source art is drawn with
 * the attacker facing right, and the kit mirrors these when the attacker
 * faces left on screen. A starburst reads the same either way and is left be.
 */
export const MARTIAL_DIRECTIONAL: ReadonlySet<MartialArt> = new Set<MartialArt>(["special", "uppercut", "sweep"])

/**
 * Whether a strike thrown from (fromX, fromZ) at (toX, toZ) travels toward the
 * LEFT of the screen, given the camera's right vector on the floor plane.
 *
 * The same test the kit already uses to turn Vicious Mockery's ghosts toward
 * their victim: the board's left and right are the camera's, so the sign of
 * the offset along camera-right is the whole answer. A strike with no
 * sideways component (straight into or out of the screen) counts as right,
 * which is how the art was drawn.
 */
export function strikeFacesLeft(
  fromX: number, fromZ: number, toX: number, toZ: number,
  camRightX: number, camRightZ: number,
): boolean {
  return (toX - fromX) * camRightX + (toZ - fromZ) * camRightZ < 0
}

/** Unarmed strikes, by the names a sheet or the DM actually writes. */
const PUNCH = /\b(punch|fist|jab|hook|knuckle)\b/i
const KICK = /\b(kick|roundhouse|shin|knee|stomp)\b/i
/**
 * The launchers: a blow that drives up and through. Stunning Strike is here
 * rather than with the specials because what it LOOKS like is a monk's
 * rising hit, and the uppercut arc is drawn for exactly that.
 */
const UPPERCUT = /\b(uppercut|launcher|stunning[\s-]?strike)\b/i
/**
 * Moves that put a creature on the floor: a sweep, a trip (Tripping Attack
 * included), or a shove whose stated aim is prone (SRD 5.1 "Shoving a
 * Creature": knock it prone OR push it away). A bare "Shove" is the push and
 * stays an ordinary action.
 */
const SWEEP = /\b(sweep|trip|tripping)\b|\bshove\b.*\bprone\b|\bprone\b.*\bshove\b/i
/** SRD 5.1 Rogue: Sneak Attack. Written a dozen ways at a live table. */
const SNEAK = /\b(sneak[\s-]?attack|backstab|assassinate)\b/i
/**
 * Class-feature strikes that are a cut above a swing. Deliberately a short,
 * named list rather than "anything unusual": a special that fires on every
 * third attack stops being special.
 */
const SPECIAL = /\b(smite|divine[\s-]?strike|flurry|rage[\s-]?attack|brutal[\s-]?critical|action[\s-]?surge)\b/i

/**
 * Which strike this attack is, or null for an ordinary weapon swing.
 *
 * Null rather than a default: a longsword hit should look exactly as it
 * always has. Only a named move earns its own effect.
 *
 * Order matters. "Sneak attack with a kick" is a sneak attack — the rogue
 * feature is the headline, the limb is incidental — so SNEAK is tested first.
 * The two named shapes come next (an uppercut or a sweep is a specific
 * picture, and Stunning Strike is a launcher before it is a special), then
 * the specials, then the plain limbs.
 */
export function martialArtFor(move: string | null | undefined): MartialArt | null {
  if (!move) return null
  const s = move.trim()
  if (!s) return null
  if (SNEAK.test(s)) return "sneak"
  if (UPPERCUT.test(s)) return "uppercut"
  if (SWEEP.test(s)) return "sweep"
  if (SPECIAL.test(s)) return "special"
  if (KICK.test(s)) return "kick"
  if (PUNCH.test(s)) return "punch"
  // "Unarmed Strike" with no limb named: SRD 5.1 lets it be a punch, kick,
  // head-butt or anything else, and a punch is the one everybody pictures.
  if (/\bunarmed\b/i.test(s)) return "punch"
  return null
}

/** The impact sheet for an attack, or null to leave the kit's `physical` alone. */
export function martialImpactFor(move: string | null | undefined): string | null {
  const art = martialArtFor(move)
  return art ? MARTIAL_IMPACT[art] : null
}

/** Every impact key this module can ask for — the art checklist. */
export const ALL_MARTIAL_IMPACTS: string[] = Object.values(MARTIAL_IMPACT)
