// Runes at the alchemy bench — inscribing one school's mark on the sealed
// vessel. Rules from the approved brief ("Magical sigils") and
// claude/claude_Alchemy_Rune_Marks.md:
//
//   * A rune mostly buys ADVANTAGE ON A ROLL, not strength. Evocation is the one
//     strength rune (+1 tier). Abjuration also cleans (-1 impurity). Necromancy
//     costs (+1 impurity). The arithmetic for those three lives in
//     lib/alchemy-bench.ts; this file is the gate and the riders.
//   * Only ARCANE casters can inscribe. Divine is not arcane, so a cleric never
//     can. A non-caster with Arcana proficiency can inscribe a mark someone
//     TAUGHT them (the "second door", e.g. Fifi).
//   * A mark is knowledge (character_known_runes), found or taught in the
//     world, never bought at level-up. This route never grants one; the DM does.
//   * One rune per potion, and one rune material per rune (drow sigil-wax,
//     rune-chalk or a carved knucklebone: "one stick, one rune").
import type { RuneSchool } from "@/lib/alchemy-bench"

export const RUNE_SCHOOLS: readonly RuneSchool[] = [
  "abjuration", "conjuration", "divination", "enchantment", "evocation", "illusion", "necromancy", "transmutation",
]

export const RUNE_MATERIALS = ["drow-sigil-wax", "rune-chalk", "carved-knucklebone"] as const

/** Full casters and half/pact casters whose magic is arcane (SRD). */
const ARCANE = /\b(sorcerer|wizard|bard|warlock)\b/i

export function isArcane(c: { class?: string | null }): boolean {
  return ARCANE.test(c.class ?? "")
}

/** Divine casters never inscribe, by ruling ("divine is not arcane, so
 *  clerics never do"; a cleric is on the bases track and never learns a mark). */
const DIVINE = /\b(cleric|paladin)\b/i
export function isDivine(c: { class?: string | null }): boolean {
  return DIVINE.test(c.class ?? "")
}

/** sheet_skill_proficiencies keys vary in case and separators ("Arcana",
 *  "arcana", "sleight_of_hand"), so normalise before looking. */
export function hasArcana(skills: unknown): boolean {
  if (!skills || typeof skills !== "object") return false
  return Object.entries(skills as Record<string, unknown>).some(
    ([k, v]) => k.toLowerCase().replace(/[^a-z]/g, "") === "arcana" && Boolean(v),
  )
}

export interface KnownRune {
  school: RuneSchool
  learned_via: "found" | "taught" | "dm"
}

export function canInscribe(
  c: { name: string; class?: string | null; sheet_skill_proficiencies?: unknown },
  known: readonly KnownRune[],
  school: RuneSchool,
  materials: number,
): { ok: true } | { ok: false; reason: string } {
  if (isDivine(c)) return { ok: false, reason: `${c.name}'s magic is divine. Divine is not arcane: clerics consecrate, they do not inscribe.` }
  const mark = known.find((k) => k.school === school)
  if (!mark) return { ok: false, reason: `${c.name} has not learned the ${school} mark. Marks are found or taught in the world.` }
  const arcane = isArcane(c)
  if (!arcane && !(mark.learned_via === "taught" && hasArcana(c.sheet_skill_proficiencies))) {
    return {
      ok: false,
      reason: `${c.name} is not an arcane caster. Without arcane magic, a mark can only be inscribed if it was taught and you are trained in Arcana.`,
    }
  }
  if (materials < 1) return { ok: false, reason: "No rune material: a stick of drow sigil-wax, rune-chalk or a carved knucklebone." }
  return { ok: true }
}

/** What the rune adds for the drinker, as a named condition the sheet shows
 *  and Malachar rules (the same way spells' named states ride as conditions;
 *  there is no duration tracking anywhere in this codebase). Evocation adds
 *  nothing here: its whole effect is the extra tier, already in the potency. */
export const RUNE_RIDER: Record<RuneSchool, string | null> = {
  abjuration: "Abjuration rune: advantage on the next saving throw",
  conjuration: "Conjuration rune: the potion's effects last twice as long",
  divination: "Divination rune: advantage on the next attack roll",
  enchantment: "Enchantment rune: advantage on the next Charisma check",
  evocation: null,
  illusion: "Illusion rune: advantage on Stealth and Deception",
  necromancy: "Necromancy rune: advantage on the next roll",
  transmutation: "Transmutation rune: advantage on the next ability check of your choice",
}

export function isRuneSchool(v: unknown): v is RuneSchool {
  return typeof v === "string" && (RUNE_SCHOOLS as readonly string[]).includes(v)
}
