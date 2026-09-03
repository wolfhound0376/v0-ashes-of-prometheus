// Stabilizing a creature, SRD 5.1:
//
//   "You can use your action to administer first aid to an unconscious
//    creature and attempt to stabilize it, which requires a successful DC 10
//    Wisdom (Medicine) check."
//
// A stable creature does not make death saving throws, stays at 0 hit
// points and unconscious, and regains 1 hit point after 1d4 hours - the last
// part belongs to resting, not to this file. Damage ends the stability
// (lib/death-saves handles that).
//
// The check needs three things off the sheet: the Wisdom modifier, the
// proficiency bonus, and whether Medicine is a proficiency or an expertise.
// Samson carries Medicine; that is who this is for at the table.
//
// Pure. The route reads rows and rolls the die; the board aims it like a
// touch spell. lib/__tests__/stabilize.test.mjs covers it.

import type { SpellEntry } from "./spellbook"

export const STABILIZE_DC = 10
/** First aid is hands-on. */
export const STABILIZE_REACH_FT = 5
/** The rack's name for it, and the word the board and the route agree on. */
export const STABILIZE = "stabilize"

export type Proficiency = "none" | "proficient" | "expertise"

/**
 * Medicine, read off `sheet_skill_proficiencies`. Samson's row says
 * "Medicine", another might say "medicine"; both are in production, so
 * this reads either - the same tolerance lib/hiding gives Stealth.
 */
export function medicineProficiency(sheet: Record<string, unknown> | null | undefined): Proficiency {
  if (!sheet) return "none"
  for (const [k, v] of Object.entries(sheet)) {
    if (k.trim().toLowerCase() !== "medicine") continue
    const val = String(v).trim().toLowerCase()
    return val === "expertise" ? "expertise" : val === "proficient" ? "proficient" : "none"
  }
  return "none"
}

/** WIS modifier, plus the proficiency bonus once or twice. */
export function medicineBonus(a: { wisMod: number | null | undefined; proficiencyBonus: number | null | undefined; proficiency: Proficiency }): number {
  const wis = a.wisMod ?? 0
  const pb = a.proficiencyBonus ?? 0
  return wis + (a.proficiency === "expertise" ? pb * 2 : a.proficiency === "proficient" ? pb : 0)
}

export function stabilizeCheck(a: { roll: number; bonus: number }): { total: number; success: boolean } {
  const total = a.roll + a.bonus
  return { total, success: total >= STABILIZE_DC }
}

/**
 * How the board aims it: a helpful touch on one creature. Not a spell - it
 * costs no slot and rolls no dice on the target - but the rack's targeting
 * already knows how to ask "who, within 5 ft" for a helpful thing, and a
 * downed ally wears the amber ring for exactly this.
 */
export const STABILIZE_ENTRY: SpellEntry = {
  level: 0,
  school: "holy",
  rangeFt: STABILIZE_REACH_FT,
  target: "creature",
  helpful: true,
  resolve: "auto",
}
