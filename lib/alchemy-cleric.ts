// Clerical help at the alchemy bench. A cleric does not brew. A cleric
// consecrates the base before the brew, or purifies the potion after it.
// Sam approved the bench brief's "Clerical help" section, 2026-10-01.
//
//   BLESSED WATER: a cleric's prayer over a glass vial of water, using their
//     camp action. Brewed on, it caps impurity at 1.
//     HOMEBREW: the brief names the cleric and the cap and nothing else. Claude
//     made the cost the vial and the action, with no slot and no silver, so
//     there is a cheap base below the SRD one.
//   HOLY WATER: the PHB ritual. One hour, 25 gp of powdered silver and a
//     1st-level spell slot, over a vial of water. The SOURCE is PHB p.151.
//     Brewed on, it also caps impurity at 1.
//   PURIFICATION: the cleric casts Purify Food and Drink (SRD, 1st level,
//     ritual) on one finished potion. Impurity drops to 0, but potency drops
//     one tier, floor tier I. It costs the cleric's camp action. "Dirty and
//     strong, or clean and weak."
//     The spell is SRD; the tier cost is HOMEBREW.
//
// Pure: rows in, decisions out. The routes do the writing.

import { freeSlot, type RiteSheet } from "@/lib/camp-rites"

export const PURIFY_SPELL = "Purify Food and Drink"
export const HOLY_WATER_SLOT_LEVEL = 1
export const POWDERED_SILVER_SLUG = "powdered-silver"
export const VIAL_SLUG = "glass-vial"
export const BLESSED_WATER_SLUG = "blessed-water"
export const HOLY_WATER_SLUG = "holy-water"

export function isCleric(c: { class?: string | null }): boolean {
  return /\bcleric\b/i.test(c.class ?? "")
}

/** A ritual can be cast only if it is prepared (SRD 5.2.1 Rituals). */
export function hasPrepared(c: RiteSheet, spell: string): boolean {
  const s = c.sheet_spellcasting
  if (!s) return false
  return [...(s.prepared ?? []), ...(s.always_prepared ?? [])].some((x) => x.toLowerCase() === spell.toLowerCase())
}

export interface Holdings {
  vials: number
  silver: number
}

export type Refusal = { ok: false; reason: string }

export function canBless(c: RiteSheet, h: Holdings): { ok: true } | Refusal {
  if (!isCleric(c)) return { ok: false, reason: `${c.name} is not a cleric; only a cleric can bless water.` }
  if (h.vials < 1) return { ok: false, reason: "No glass vial to fill. Blessing needs one vial of water." }
  return { ok: true }
}

export function canMakeHolyWater(c: RiteSheet, h: Holdings): { ok: true; slot: number } | Refusal {
  if (!isCleric(c)) return { ok: false, reason: `${c.name} is not a cleric; only a cleric can make holy water.` }
  if (h.vials < 1) return { ok: false, reason: "No glass vial to fill." }
  if (h.silver < 1) return { ok: false, reason: "Holy water needs 25 gp of powdered silver, and there is none in the pack." }
  const slot = freeSlot(c, HOLY_WATER_SLOT_LEVEL)
  if (slot == null) return { ok: false, reason: "No 1st-level spell slot left. Holy water costs one." }
  return { ok: true, slot }
}

export function canPurify(c: RiteSheet): { ok: true } | Refusal {
  if (!isCleric(c)) return { ok: false, reason: `${c.name} is not a cleric.` }
  if (!hasPrepared(c, PURIFY_SPELL)) {
    return { ok: false, reason: `${c.name} does not have ${PURIFY_SPELL} prepared. It is a ritual, so it costs no slot, but it must be prepared.` }
  }
  return { ok: true }
}

/** Purification: clean but weaker. Impurity 0, potency down a tier, floor I. */
export function purified(brew: { potency: number; impurity: number }): { potency: number; impurity: number } {
  return { potency: Math.max(1, Math.trunc(brew.potency) - 1), impurity: 0 }
}

/** The sheet with one slot of `level` marked used. Returns a new object. */
export function spendSlot<T extends { slots?: Record<string, { max?: number; used?: number }> | null }>(sc: T, level: number): T {
  const slots = { ...(sc.slots ?? {}) }
  const cur = slots[String(level)] ?? { max: 0, used: 0 }
  slots[String(level)] = { ...cur, used: (cur.used ?? 0) + 1 }
  return { ...sc, slots }
}
