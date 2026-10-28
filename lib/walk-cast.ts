// ============================================================================
// CASTING OUTSIDE A FIGHT — the rules half of /api/walk-cast.
//
// Sam, 2026-10-23: "there should be a way for the magic users to use magic that
// they've memorized when out of the sigil." On the painted map a spell could only
// be cast from the combat menu, and only the handful the map resolves itself.
// Out of a fight, a caster outside the pen's ward now casts anything on their
// own sheet (cantrips, prepared, always prepared), and it is REAL: a levelled
// spell spends the slot on `sheet_spellcasting`, a healing spell puts the hit
// points back on the target's `characters` row, and Malachar is told in the
// dialogue so the story knows it happened. Those are the same records the
// dashboard and the combat route read; the map no longer keeps its own copy.
//
// What a spell DOES beyond healing (Mage Hand lifting a key, Guidance on a check,
// Disguise Self at the gate) is Malachar's to rule on — the cast is announced to
// him, it is not resolved here. A harmful spell aimed at an enemy is not cast
// here either: the map opens the fight, and the fight resolves it.
// ============================================================================

import { knowsSpell, slotsLeft, rollDice, normSpell, SPELLBOOK, DEFAULT_ENTRY, type SpellEntry, type Spellcasting } from "./spellbook"
import SPELL_DATA from "./data/spells.json"

type SpellRow = { name: string; level: number | string; damage?: unknown; attack_roll?: unknown; save?: unknown; components?: unknown }
const DATA: Map<string, SpellRow> = new Map(
  ((Array.isArray(SPELL_DATA) ? SPELL_DATA : Object.values(SPELL_DATA as Record<string, unknown>)) as SpellRow[])
    .filter((r) => r && typeof r.name === "string").map((r) => [normSpell(r.name), r]),
)

/**
 * The spell's entry. lib/spellbook first (it carries the board's targeting and dice); for a spell it has no row
 * for, its LEVEL and whether it harms come from lib/data/spells.json (556 spells). Without this, a levelled spell
 * the spellbook lacks (Magic Missile, Shield, Sanctuary, Thunderwave…) would fall to the spellbook's default —
 * level 0 — and be cast for free.
 */
export function entryFor(name: string): SpellEntry {
  const own = SPELLBOOK[normSpell(name)]
  if (own) return own
  const row = DATA.get(normSpell(name))
  if (!row) return DEFAULT_ENTRY
  const level = Number(row.level) || 0
  const dmg = Array.isArray(row.damage) && row.damage.length ? (row.damage[0] as { type?: string })?.type : undefined
  return { ...DEFAULT_ENTRY, level, damage: dmg as SpellEntry["damage"], resolve: row.attack_roll === true ? "attack" : row.save ? "save" : "none" }
}

export type CastKind = "heal" | "fight" | "utility"

/** How a spell behaves when cast out of combat. */
export function castKind(entry: SpellEntry): CastKind {
  if (entry.heals) return "heal"
  if (!entry.helpful && (entry.damage || entry.resolve === "attack" || entry.resolve === "save")) return "fight"
  return "utility"
}

/**
 * Healing dice for the spells the party can heal with, as SRD 5.2.1 states them — the edition Sam ruled canon
 * (2026-10-01). lib/spellbook is SRD 5.1 (Healing Word 1d4, Cure Wounds 1d8); 5.2.1 doubled both. NOTE: SRD 5.2.1
 * is not ingested in this project, so these two numbers are recalled, not quoted. They match the painted map's
 * own spell table (template.html SPELLS: Healing Word "2d4"). Any other healing spell uses lib/spellbook's dice.
 */
const HEAL_DICE_521: Record<string, string> = { "healing word": "2d4", "cure wounds": "2d8" }

export function healDice(name: string, entry: SpellEntry): string {
  return HEAL_DICE_521[normSpell(name)] ?? entry.dice ?? "1d4"
}

export type CastPlan =
  | { ok: true; name: string; level: number; kind: CastKind; entry: SpellEntry }
  | { ok: false; why: string }

/** Can this caster cast this spell right now, outside a fight? Pure. */
export function planCast(sc: Spellcasting | null | undefined, name: string): CastPlan {
  if (!sc) return { ok: false, why: "They have no spells." }
  if (!knowsSpell(sc, name)) return { ok: false, why: `${name} is not one of their memorized spells.` }
  const entry = entryFor(name)
  const kind = castKind(entry)
  if (slotsLeft(sc, entry.level) <= 0) return { ok: false, why: `No level ${entry.level} spell slots left. A long rest brings them back.` }
  return { ok: true, name, level: entry.level, kind, entry }
}

/** The sheet with one slot of `level` spent. A cantrip spends nothing. Pure. */
export function spendSlot(sc: Spellcasting, level: number): Spellcasting {
  if (level <= 0) return sc
  const slots = { ...(sc.slots ?? {}) }
  const cur = slots[String(level)] ?? {}
  slots[String(level)] = { ...cur, used: (cur.used ?? 0) + 1 }
  return { ...sc, slots }
}

/** Hit points restored: the spell's dice plus the caster's spellcasting modifier, at least 1. */
export function healAmount(name: string, entry: SpellEntry, castingMod: number, rng: () => number = Math.random): number {
  return Math.max(1, rollDice(healDice(name, entry), rng) + castingMod)
}

/** A spell's components (V, S, M) from lib/data/spells.json, or null for a spell the data does not have. */
export type Components = { v: boolean; s: boolean; m: boolean }
export function componentsOf(name: string): Components | null {
  const raw = DATA.get(normSpell(name))?.components
  if (typeof raw !== "string" || !raw.trim()) return null
  const head = raw.split("(")[0].toUpperCase().split(",").map((t) => t.trim())
  return { v: head.includes("V"), s: head.includes("S"), m: head.includes("M") }
}

/**
 * MANACLED (Sam, 2026-10-27, on a work detail): only a spell that needs nothing but the voice can be cast — no
 * gesture (the hands are chained to the belt, OotA p.11) and no material (the drow took them). A spell the data does
 * not know is not castable in chains: we cannot show it needs no hands.
 */
export const castableInChains = (c: Components | null): boolean => !!c && c.v && !c.s && !c.m

/** Every spell on the sheet, with what the map needs to offer it. Pure. */
export function castList(sc: Spellcasting | null | undefined) {
  const names = [...(sc?.cantrips ?? []), ...(sc?.always_prepared ?? []), ...(sc?.prepared ?? [])]
    .filter((n, i, all) => typeof n === "string" && n.trim() && all.findIndex((m) => normSpell(m) === normSpell(n)) === i)
  return names.map((name) => {
    const entry = entryFor(name)
    return { name, level: entry.level, kind: castKind(entry), target: entry.target, left: entry.level === 0 ? null : slotsLeft(sc, entry.level), components: componentsOf(name) }
  })
}
