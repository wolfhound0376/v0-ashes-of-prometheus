// ============================================================================
// AREA OF EFFECT — what the ground looks like afterwards.
//
// lib/aoe.ts answers WHICH squares a shape covers. This answers what those
// squares should LOOK like once the spell lands, and for how long.
//
// Kept next to aoe.ts and under the same rule: no Three.js, no React, no
// Supabase. Grid facts in, art facts out. The renderer imports this; so can
// the server, if it ever needs to tell a reconnecting client that a Web is
// still lying on the floor.
//
// WHY THIS FILE EXISTS AT ALL
//
// Until now an area spell drew a template while you aimed and then nothing.
// Fireball bloomed as a single sprite at the centre point and vanished, and
// the twenty squares that actually took 8d6 were never marked. Two things go
// wrong with that on the night: a player cannot tell after the fact which
// squares were in it, and a lingering spell — Web, Spike Growth — leaves no
// trace at all, so the board and the fiction disagree about whether there is
// still a web in the room.
//
// HOW LONG A MARK LASTS IS NOT A NEW FACT
//
// The tempting shape for this table is a `durationSeconds` column, and it
// would be wrong within a week: someone would set Web to 30 and then argue
// with the concentration tracker about whether the web was still there.
//
// The spellbook already records the honest answer. A spell you concentrate on
// persists until concentration drops; a spell you do not is over the instant
// it resolves. So `lingers` is READ from the entry rather than stored here,
// and the renderer holds the mark until it is told the spell ended. One fact,
// one owner — the same discipline aoe.ts applies to the shape itself.
// ============================================================================

import type { SpellEntry } from "./spellbook"
import { spellEntry } from "./spellbook"

/**
 * Which ground sheet to lay down. These are art names, not spell names —
 * several spells legitimately share a look (Web and Entangle both leave
 * clinging growth) and giving each its own texture would be 21 sheets to
 * download for no readable difference.
 */
export type DecalKind =
  | "scorch"   // fire — blackened stone, embers cooling in the cracks
  | "frost"    // cold — rime creeping out from the centre
  | "shock"    // lightning / thunder — a struck, crazed burn
  | "poison"   // poison / acid — pooled, faintly bubbling
  | "web"      // web, entangle, spike growth — clinging growth
  | "gloom"    // necrotic, darkness, fog, silence — a soft dimming
  | "hallowed" // radiant, holy — a lit ring
  | "arcane"   // everything else, and the honest default

export interface AreaVisual {
  decal: DecalKind
  /** Multiplied into the (near-grayscale) baked sheet. */
  tint: number
  /**
   * Seconds the mark burns in — the bloom on arrival, before it either fades
   * or settles into its lingering state.
   */
  bloom: number
  /**
   * Does the mark stay after the bloom?
   *
   * True for concentration spells and nothing else, because that is exactly
   * the set of spells whose area is still there on the next turn. The
   * renderer keeps a lingering mark alive until the caller drops it; it does
   * NOT run a timer, because the timer already exists in the concentration
   * tracker and two timers disagree.
   */
  lingers: boolean
  /** Opacity of the settled mark, once the bloom has finished. */
  restOpacity: number
}

/**
 * Spells whose look does not follow from their damage type.
 *
 * Deliberately short. Most area spells are named by what they are made of and
 * fall out of the damage table below; these are the ones where the type is
 * absent or actively misleading — Web deals no damage at all, Moonbeam is
 * radiant but reads as a cold shaft, Sleep and Colour Spray are arcane
 * nothings that still need to mark ground.
 */
const BY_SPELL: Record<string, DecalKind> = {
  web: "web",
  entangle: "web",
  "spike growth": "web",
  grease: "poison",
  "fog cloud": "gloom",
  silence: "gloom",
  sleep: "gloom",
  "minor illusion": "arcane",
  "colour spray": "arcane",
  "color spray": "arcane",
  "faerie fire": "arcane",
  moonbeam: "hallowed",
  "spirit guardians": "hallowed",
  "cloud of daggers": "arcane",
  "flaming sphere": "scorch",
}

/** The default read, when the spell is only what it is made of. */
const BY_DAMAGE: Record<string, DecalKind> = {
  fire: "scorch",
  cold: "frost",
  lightning: "shock",
  thunder: "shock",
  acid: "poison",
  poison: "poison",
  necrotic: "gloom",
  radiant: "hallowed",
  psychic: "arcane",
  force: "arcane",
}

const TINTS: Record<DecalKind, number> = {
  scorch:   0xff7a3c,
  frost:    0xa8e2ff,
  shock:    0x9fd0ff,
  poison:   0x9ad14a,
  web:      0xd8d2c2,
  gloom:    0x8d7ad0,
  hallowed: 0xffe6a8,
  arcane:   0x9fd8ff,
}

/**
 * How long the burn-in takes. A detonation should land fast and a growth
 * should creep, so this follows the decal rather than being one constant.
 */
const BLOOMS: Record<DecalKind, number> = {
  scorch:   0.45,
  frost:    0.70,
  shock:    0.30,
  poison:   0.60,
  web:      0.90,
  gloom:    0.80,
  hallowed: 0.55,
  arcane:   0.50,
}

/**
 * A settled mark must not compete with the tokens standing on it. These sit
 * low deliberately — the bloom is the moment you are meant to look at; what
 * remains is a reminder, and a Web you cannot see your rogue through is worse
 * than no Web at all.
 */
const REST: Record<DecalKind, number> = {
  scorch:   0.30,
  frost:    0.34,
  shock:    0.22,
  poison:   0.38,
  web:      0.46, // the one you most need to keep reading — it costs movement
  gloom:    0.40,
  hallowed: 0.32,
  arcane:   0.26,
}

function kindFor(name: string, entry: SpellEntry | undefined): DecalKind {
  const key = name.trim().toLowerCase()
  const named = BY_SPELL[key]
  if (named) return named
  if (entry?.heals) return "hallowed"
  if (entry?.school === "eldritch") return "gloom"
  const dmg = entry?.damage
  if (dmg && BY_DAMAGE[dmg]) return BY_DAMAGE[dmg]
  return "arcane"
}

/**
 * The ground treatment for a spell, or null if it has no area.
 *
 * Null is the meaningful answer for Magic Missile and Guiding Bolt — they hit
 * a creature, not a floor — and the renderer uses it to stay out of the way
 * rather than painting a one-square smudge under every cantrip.
 */
export function areaVisualFor(spellName: string): AreaVisual | null {
  const entry = spellEntry(spellName)
  if (!entry?.area) return null
  const decal = kindFor(spellName, entry)
  return {
    decal,
    tint: TINTS[decal],
    bloom: BLOOMS[decal],
    lingers: entry.concentration === true,
    restOpacity: REST[decal],
  }
}

/**
 * The sheet key under public/vfx for a decal kind — "scorch" → "groundScorch".
 *
 * One function rather than a literal in the renderer, so the naming rule lives
 * with the kinds it names and adding a decal is one line in the union.
 */
export function decalSheet(kind: DecalKind): string {
  return `ground${kind[0].toUpperCase()}${kind.slice(1)}`
}
