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
 * THE SCHOOL PALETTE — sampled straight off Sam's eight-emblem reference
 * sheet (2026-09-28), not eyeballed. He asked for the reference colours
 * exactly, with shading, and these are measured values.
 *
 * HOW THEY WERE TAKEN, because a naive sample gets this wrong twice:
 *
 *   Each emblem's dominant hue is found over the EMBLEM INTERIOR only (the
 *   inner 72 percent of the disc). Sampling the whole panel pulls in the gold
 *   ring that all eight emblems share, which dragged evocation to a muddy tan.
 *
 *   `glow` is the median of the top CHROMA DECILE, not the median of the
 *   cluster. These emblems sit on black and are mostly antialiasing, so an
 *   ordinary median desaturates every school toward the backdrop — the first
 *   pass produced a greyed-out ramp that looked nothing like the sheet. What
 *   the eye actually reads is the neon linework, and that is the top decile.
 *
 *   `deep` comes from the annulus OUTSIDE the ring: that is the smoke each
 *   emblem sits in, and it is what the rune's outer falloff should be.
 *
 * WHAT EACH STOP DRIVES:
 *   glow  the rune disc's tint. This is the colour a player reads.
 *   core  the cast's PointLight, so the centre blooms hot instead of the disc
 *         being one flat colour. This is the shading.
 *   deep  the outer falloff. Canon here and used when the rune sheets are
 *         re-baked against this sheet; nothing renders it yet, and it is
 *         recorded rather than pretended into use.
 *
 * ONE HONEST CAVEAT: abjuration and illusion land five degrees apart in hue
 * (207.5 and 212.5) because on the reference they ARE both blue. They are
 * separated by VALUE — abjuration the deeper cobalt, illusion the paler ice —
 * and that separation is asserted in the tests. If they read too alike in
 * play, it is the reference that needs changing, not this table.
 */
export interface SchoolRamp {
  /** Outer falloff, from the smoke around the emblem. */
  deep: number
  /** The signature colour. Tints the rune disc. */
  glow: number
  /** The hot centre. Drives the cast light. */
  core: number
}

export const SCHOOL_RAMP: Record<MagicSchool, SchoolRamp> = {
  abjuration:    { deep: 0x0b1e2f, glow: 0x2479b0, core: 0x99ddee }, // warding shield, silver star
  conjuration:   { deep: 0x132e13, glow: 0x92ce5a, core: 0xdffba4 }, // the summoning spiral
  divination:    { deep: 0x16152e, glow: 0x7542b8, core: 0xdeb2fd }, // eye in the triangle
  enchantment:   { deep: 0x2d131e, glow: 0xd0407c, core: 0xfeb7d5 }, // the charmed heart
  evocation:     { deep: 0x36120e, glow: 0xe87618, core: 0xffd76b }, // the sunburst
  illusion:      { deep: 0x0d1d31, glow: 0x3e96df, core: 0x9cf4fe }, // the crescent moon
  necromancy:    { deep: 0x1b172b, glow: 0x853cb1, core: 0xeba3fc }, // the violet-eyed skull
  transmutation: { deep: 0x311f10, glow: 0xdf9c31, core: 0xfff793 }, // gears and triquetra
}

/** Back-compat and the common case: the colour a school reads as. */
export const SCHOOL_COLOR: Record<MagicSchool, number> = {
  abjuration: SCHOOL_RAMP.abjuration.glow,
  conjuration: SCHOOL_RAMP.conjuration.glow,
  divination: SCHOOL_RAMP.divination.glow,
  enchantment: SCHOOL_RAMP.enchantment.glow,
  evocation: SCHOOL_RAMP.evocation.glow,
  illusion: SCHOOL_RAMP.illusion.glow,
  necromancy: SCHOOL_RAMP.necromancy.glow,
  transmutation: SCHOOL_RAMP.transmutation.glow,
}

/** The full ramp for a spell, or null when the school is unknown. */
export function schoolRampFor(spellName: string | null | undefined): SchoolRamp | null {
  const school = schoolOf(spellName)
  return school ? SCHOOL_RAMP[school] : null
}

/**
 * The colour a spell's rune should glow, or null when the school is unknown —
 * in which case the caller keeps the damage type's own tint and nothing about
 * the effect changes.
 */
export function schoolColorFor(spellName: string | null | undefined): number | null {
  return schoolRampFor(spellName)?.glow ?? null
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
