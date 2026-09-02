// ============================================================================
// WHAT KILLED IT — one normaliser, because three unions disagreed.
//
// Three different vocabularies were in play, and nothing translated between
// them, so the board fell back to "physical" for almost every death:
//
//   the SERVER   13 SRD words, including piercing / slashing / bludgeoning
//                (app/api/combat/route.ts parses them out of "1d6+1 Piercing")
//   the SPELLBOOK 10 magical types - no physical, no weapon damage at all
//   the VFX KIT   13, with "physical", "healing" and "eldritch" but none of
//                the three weapon types
//
// The server already computes the right word and already puts it on the wire.
// It just landed in a union that could not hold it. This is the adapter.
//
// The weapon split is the one that matters for a death, so it is kept:
// piercing is an arrow through the chest, slashing and bludgeoning are being
// opened up or broken. Those are different deaths, so they are different
// words here, and DEATH_KIND below is what decides which body treatment runs.
// ============================================================================

import type { DamageType } from "@/components/tactical/spell-vfx-kit"

/** Every word the SERVER can send, straight out of the SRD damage list. */
export type ServerDamageType =
  | "bludgeoning" | "piercing" | "slashing"
  | "acid" | "cold" | "fire" | "force" | "lightning"
  | "necrotic" | "poison" | "psychic" | "radiant" | "thunder"

/**
 * How a body ends. Finer than the VFX kit's DamageType, because two things
 * that are both "physical" to a sprite sheet are not the same corpse.
 */
export type DeathKind =
  | "burn"      // fire - consumed, ash rising
  | "burst"     // force, thunder - blown apart
  | "melt"      // acid - sinks, dissolving
  | "char"      // lightning - convulses, then blackened
  | "raise"     // necrotic - flesh goes, bone stays
  | "freeze"    // cold - rimed over, still
  | "mangle"    // slashing, bludgeoning - falls open and bleeding
  | "impale"    // piercing - pinned by the shaft that did it
  | "sleep"     // no damage type: drow poison, Sleep - breathing, snoring
  | "anguish"   // psychic - hands to the head, then down
  | "ashes"     // radiant - burns white and is gone
  | "wither"    // poison - goes green and stops
  | "collapse"  // a PLAYER going down. Not a death - see below.

/**
 * The kit's own union, for the sprite sheet a death borrows. The three weapon
 * words collapse here and only here, because there is one physical sheet.
 */
export function toVfxType(t: string | null | undefined): DamageType {
  switch ((t ?? "").toLowerCase()) {
    case "piercing":
    case "slashing":
    case "bludgeoning":
    case "physical":
      return "physical"
    case "fire": return "fire"
    case "cold": return "cold"
    case "lightning": return "lightning"
    case "thunder": return "thunder"
    case "acid": return "acid"
    case "poison": return "poison"
    case "necrotic": return "necrotic"
    case "radiant": return "radiant"
    case "force": return "force"
    case "psychic": return "psychic"
    case "healing": return "healing"
    case "eldritch": return "eldritch"
    default: return "physical"
  }
}

/**
 * How this creature dies.
 *
 * `conditions` is consulted BEFORE the damage type, because a sleeping
 * creature that is then killed did not die of sleep - but a creature dropped
 * BY the sleep (drow poison, the Sleep spell) took no damage at all, so there
 * is no type to read and the condition is the only witness.
 */
export function deathKindFor(
  damage: string | null | undefined,
  conditions?: readonly string[] | null,
): DeathKind {
  const conds = (conditions ?? []).map((c) => c.toLowerCase())
  if (!damage && conds.some((c) => c.includes("asleep") || c.includes("unconscious") || c.includes("sleep"))) {
    return "sleep"
  }
  switch ((damage ?? "").toLowerCase()) {
    case "fire": return "burn"
    case "force":
    case "thunder": return "burst"
    case "acid": return "melt"
    case "lightning": return "char"
    case "necrotic": return "raise"
    case "cold": return "freeze"
    case "piercing": return "impale"
    case "slashing":
    case "bludgeoning":
    case "physical": return "mangle"
    case "psychic": return "anguish"
    case "radiant": return "ashes"
    case "poison": return "wither"
    // Eldritch, healing, and anything unrecognised. A creature killed by
    // something with no name for it still has to fall over, and falling over
    // bleeding is the least surprising way for that to look.
    default: return "mangle"
  }
}

/**
 * The word a player reads. Used in the log line and nowhere decorative.
 */
export const DEATH_LABEL: Record<DeathKind, string> = {
  burn: "burns", burst: "is torn apart", melt: "dissolves", char: "is struck black",
  raise: "withers to bone", freeze: "freezes solid", mangle: "falls", impale: "is run through",
  sleep: "sleeps", anguish: "clutches its head", ashes: "burns to ash", wither: "chokes",
  collapse: "goes down",
}
