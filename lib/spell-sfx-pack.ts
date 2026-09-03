// ============================================================================
// SPELL SFX PACK 01 — the sounds Sam generated per SPELL, not per school.
//
// lib/sfx.ts already has a sound for every school: a windup, a release and a
// tail, chosen by what KIND of magic it is. That is the right default and it
// covers all 44 spells in the book. This is a layer of specificity on top of
// it: nine cues that belong to particular spells, so a Misty Step sounds like
// a teleport rather than like "arcane, released".
//
// THE PACK COVERS 10 OF 44. That is not a gap to apologise for, it is the
// design: the school chain answers everything, and this overrides only where
// there is something better to say. A spell with no pack entry is not
// missing a sound — it is using the one it always had.
//
// GENERATED from spellsfxsound.json, not transcribed. Seventy-three slugs
// hand-copied would be wrong within a week, and the JSON is the artifact Sam
// actually edits.
//
// Files live beside the rest of the bank, under sfx/spells/.
// ============================================================================

import type { SfxName } from "@/lib/sfx"

/** One cue from the pack. */
export interface PackSound {
  id: string
  /** Mixed to sit level with the rest of the bank. */
  volume: number
  seconds: number
}

const SOUNDS: Record<string, PackSound> = {
  "ambience-arcane-shimmer": { id: "ambience-arcane-shimmer", volume: 0.7, seconds: 3.239 },
  "cantrip-soft-sparkle": { id: "cantrip-soft-sparkle", volume: 0.75, seconds: 2.638 },
  "cast-wind-gust": { id: "cast-wind-gust", volume: 0.9, seconds: 3.109 },
  // Sam: "sleep should have a sleep time sound from elevenlabs not an
  // electrical one." Sleep was in no index at all, so it fell through to the
  // ARCANE school release — the same bright sparkle every wizard cantrip
  // makes. A spell whose whole effect is people going quietly limp should not
  // sound like a spark gap.
  //
  // Generated with eleven_text_to_sound_v2, then warmed rather than shipped
  // raw: the take came back with 52% of its energy above 4 kHz, which is
  // exactly the sparkle it was asked not to have. Rolled off above 4.2 kHz
  // with a shelf cut at 6 k, a little weight added at 420 Hz, faded to
  // silence. Measured after: centroid 3626 -> 2125 Hz, HF 52% -> 21%.
  // Bells falling into a hush, and then nothing.
  "control-slumber-fall": { id: "control-slumber-fall", volume: 0.8, seconds: 3.0 },
  "control-time-stop": { id: "control-time-stop", volume: 0.85, seconds: 3.03 },
  "divine-celestial-voice": { id: "divine-celestial-voice", volume: 0.8, seconds: 11.546 },
  "divine-transformation": { id: "divine-transformation", volume: 0.85, seconds: 8.229 },
  "melee-dagger-stab": { id: "melee-dagger-stab", volume: 0.9, seconds: 1.045 },
  "portal-time-tunnel": { id: "portal-time-tunnel", volume: 0.85, seconds: 10.031 },
  "teleport-psychic-charge": { id: "teleport-psychic-charge", volume: 1.0, seconds: 2.038 },
}

/**
 * Spell slug to cue id. The slug is the spell name lowercased with spaces as
 * hyphens, which is the shape the pack was authored in.
 */
const INDEX: Record<string, string> = {
  "alarm": "ambience-arcane-shimmer",
  "alter-self": "divine-transformation",
  "arcane-gate": "portal-time-tunnel",
  "arcane-lock": "ambience-arcane-shimmer",
  "astral-projection": "portal-time-tunnel",
  "banishment": "portal-time-tunnel",
  "bless": "divine-celestial-voice",
  "blink": "teleport-psychic-charge",
  "booming-blade": "melee-dagger-stab",
  "commune": "divine-celestial-voice",
  "contingency": "control-time-stop",
  "dancing-lights": "ambience-arcane-shimmer",
  "demiplane": "portal-time-tunnel",
  "detect-magic": "ambience-arcane-shimmer",
  "detect-thoughts": "teleport-psychic-charge",
  "dimension-door": "teleport-psychic-charge",
  "disguise-self": "divine-transformation",
  "divine-intervention": "divine-transformation",
  "divine-word": "divine-celestial-voice",
  "dominate-person": "teleport-psychic-charge",
  "druidcraft": "cantrip-soft-sparkle",
  "eldritch-blast": "cast-wind-gust",
  "expeditious-retreat": "cast-wind-gust",
  "feather-fall": "cast-wind-gust",
  "fly": "cast-wind-gust",
  "foresight": "control-time-stop",
  "gate": "portal-time-tunnel",
  "greater-restoration": "divine-transformation",
  "green-flame-blade": "melee-dagger-stab",
  "guardian-of-faith": "divine-celestial-voice",
  "guidance": "ambience-arcane-shimmer",
  "gust-of-wind": "cast-wind-gust",
  "hallow": "divine-celestial-voice",
  "haste": "control-time-stop",
  "heal": "divine-celestial-voice",
  "hold-monster": "control-time-stop",
  "hold-person": "control-time-stop",
  "holy-aura": "divine-celestial-voice",
  "inflict-wounds": "melee-dagger-stab",
  "light": "ambience-arcane-shimmer",
  "mage-hand": "cantrip-soft-sparkle",
  "magic-missile": "cast-wind-gust",
  "mending": "cantrip-soft-sparkle",
  "message": "cantrip-soft-sparkle",
  "mind-spike": "teleport-psychic-charge",
  "minor-illusion": "cantrip-soft-sparkle",
  "misty-step": "teleport-psychic-charge",
  "nystuls-magic-aura": "ambience-arcane-shimmer",
  "planar-ally": "divine-celestial-voice",
  "plane-shift": "portal-time-tunnel",
  "polymorph": "divine-transformation",
  "prestidigitation": "cantrip-soft-sparkle",
  "raise-dead": "divine-transformation",
  "resurrection": "divine-celestial-voice",
  "revivify": "divine-transformation",
  "see-invisibility": "ambience-arcane-shimmer",
  "shadow-blade": "melee-dagger-stab",
  "sleep": "control-slumber-fall",
  "slow": "control-time-stop",
  "sneak-attack": "melee-dagger-stab",
  "spare-the-dying": "cantrip-soft-sparkle",
  "telekinesis": "teleport-psychic-charge",
  "teleport": "teleport-psychic-charge",
  "teleportation-circle": "portal-time-tunnel",
  "thaumaturgy": "cantrip-soft-sparkle",
  "thunderwave": "cast-wind-gust",
  "time-stop": "control-time-stop",
  "true-polymorph": "divine-transformation",
  "true-strike": "melee-dagger-stab",
  "vampiric-touch": "melee-dagger-stab",
  "warding-wind": "cast-wind-gust",
  "wild-shape": "divine-transformation",
  "wind-wall": "cast-wind-gust",
  "wish": "portal-time-tunnel",
}

/** The pack's own naming: a spell name as it appears in the spellbook. */
const slugify = (name: string) =>
  name.trim().toLowerCase().replace(/['']/g, "").replace(/\s+/g, "-")

/**
 * The pack cue for a spell, or null when the pack has nothing to say about it.
 *
 * NULL IS THE COMMON ANSWER and callers must keep their existing behaviour
 * for it. Thirty-four of the book's spells are not in the pack; returning a
 * fallback cue here would silently replace every school sound in the game
 * with one of nine, which is the opposite of what a specificity layer is for.
 *
 * (The pack declares its own `fallbackSound`. It is deliberately ignored:
 * that fallback exists for a standalone player with no other sound bank, and
 * this app has one.)
 */
export function packSoundFor(spellName: string | null | undefined): PackSound | null {
  if (!spellName) return null
  const id = INDEX[slugify(spellName)]
  return id ? SOUNDS[id] ?? null : null
}

/**
 * Bucket path for a cue, under the same root as every other sound.
 *
 * Typed as SfxName rather than string so the call sites need no cast — a cast
 * would compile just as well and would stop the compiler noticing the day
 * somebody renames the prefix.
 */
export const packKey = (s: PackSound): SfxName => `spells/${s.id}` as SfxName
