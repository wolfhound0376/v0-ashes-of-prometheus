// A spell's SCHOOL, and the rune that stands for it.
//
// Sam, 2026-09-28: "we can make the spells and animate them and then just
// attach the effect to a sprite — that way we don't need to generate as many
// variations per character."
//
// That is the whole design. A cast has two halves: what the CASTER does with
// their body, and what the MAGIC looks like. Only the first is per-character,
// and it barely varies — a wizard flicking out a Fire Bolt and flicking out a
// Chill Touch move the same way. The second is what a player actually reads,
// and it is the same for everyone: necromancy looks like necromancy whether
// Kenta or Ilvara casts it.
//
// So the school lives in ONE shared rune disc, generated once and spun up off
// whichever hand is casting, and no caster needs eight cast animations. Eight
// runes cover every caster in the campaign, now and forever.
//
// ── three vocabularies, and this file is the third ──────────────────────────
//
// The codebase already had two things called a spell's "school", and neither
// is the book's:
//
//   lib/spellbook.ts  School = "arcane" | "holy" | "nature" | "necrotic" | …
//                     an SFX family — it maps 1:1 to sfx/magic/<school>_*.
//   spell-vfx-kit.ts  DamageType = fire | cold | necrotic | …
//                     picks the route, the impact sheet and the floor decal.
//
// Neither is the 5E school, and the real one was sitting unused in
// lib/data/spells.json all along. This file is the only place that reads it.
// The kit keeps choosing route/impact/decal by damage type — a Fireball and a
// Scorching Ray should still both fly and burn — and only the RUNE changes.
import { SPELL_SCHOOL_CODES } from "./spell-school-data"

/** The eight schools of magic. SRD 5.1. */
export type MagicSchool =
  | "abjuration" | "conjuration" | "divination" | "enchantment"
  | "evocation" | "illusion" | "necromancy" | "transmutation"

const BY_CODE: Record<string, MagicSchool> = {
  A: "abjuration", C: "conjuration", D: "divination", E: "enchantment",
  V: "evocation", I: "illusion", N: "necromancy", T: "transmutation",
}

/** Rune sheet key in public/vfx/manifest.json, one per school. */
export const SCHOOL_RUNE: Record<MagicSchool, string> = {
  abjuration: "runeAbjuration",
  conjuration: "runeConjuration",
  divination: "runeDivination",
  enchantment: "runeEnchantment",
  evocation: "runeEvocation",
  illusion: "runeIllusion",
  necromancy: "runeNecromancy",
  transmutation: "runeTransmutation",
}

/**
 * The school of a spell, or null when the name is not one of the 556 in
 * lib/data/spells.json.
 *
 * Null rather than a guess: a homebrew name, a monster's innate ability or a
 * typo has no school, and inventing one would put a necromancy rune under a
 * cleric's Bless. The caller falls back to the damage-type rune, which is what
 * shipped before any of this existed.
 */
export function schoolOf(spellName: string | null | undefined): MagicSchool | null {
  if (!spellName) return null
  const code = SPELL_SCHOOL_CODES[spellName.trim().toLowerCase()]
  return code ? BY_CODE[code] ?? null : null
}

/**
 * The rune for a spell, or null to leave the kit's damage-type rune alone.
 *
 * Deliberately not "return a default rune": a spell nobody wrote down should
 * look like it always has, not like a generic school.
 */
export function schoolRuneFor(spellName: string | null | undefined): string | null {
  const school = schoolOf(spellName)
  return school ? SCHOOL_RUNE[school] : null
}

/** Every rune key this module can ask for — the art checklist. */
export const ALL_SCHOOL_RUNES: string[] = Object.values(SCHOOL_RUNE)
