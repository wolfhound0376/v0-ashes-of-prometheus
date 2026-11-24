// ============================================================================
// AN ITEM'S KNACK — a small bonus rolled once for each copy of an item.
//
// Sam, 2026-11-24: the Traveler's Cloak is red, and "passive 1d2 per cloak,
// 1 = +1 Dexterity, 2 = +1 Stealth, while worn." The rule lives on the
// catalogue row, not in code:
//
//   items.properties.benefit_roll = { "die": "1d2", "1": {"dex": 1}, "2": {"stealth": 1} }
//
// so another item can be given a knack by writing its table in the catalogue,
// and nothing here knows what a cloak is.
//
// PASSIVE means the player never rolls it and never sees a die: the game
// rolls once, the first time it meets a copy that has no knack yet, and the
// result stays on that copy (inventory_items.stats_bonus) for good.
//
// NEVER INVENTED. A table this file cannot read — a die that is not 1dN, a
// face with no entry, a bonus that is not a plain number — gives no knack at
// all rather than a guessed one.
//
// This file is pure. lib/item-knack-rows.ts does the reading and writing.
// ============================================================================

export type KnackBonus = Record<string, number>
export interface Knack {
  die: string
  face: number
  bonus: KnackBonus
}

const ABILITY_NAMES: Record<string, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma",
}

function tableOf(properties: unknown): Record<string, unknown> | null {
  const t = (properties as { benefit_roll?: unknown } | null | undefined)?.benefit_roll
  return t && typeof t === "object" && !Array.isArray(t) ? (t as Record<string, unknown>) : null
}

/** True when the catalogue row says each copy of this item rolls for a knack. */
export const hasKnackTable = (properties: unknown): boolean => tableOf(properties) != null

function bonusOf(v: unknown): KnackBonus | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  const out: KnackBonus = {}
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return null
    out[k] = raw
  }
  return Object.keys(out).length ? out : null
}

/**
 * Roll this item's knack from its catalogue `properties`. `rng` is Math.random's shape (0 ≤ n < 1).
 * Null when the item has no table, or the table cannot be read exactly.
 */
export function rollKnack(properties: unknown, rng: () => number = Math.random): Knack | null {
  const table = tableOf(properties)
  if (!table) return null
  const die = String(table.die ?? "").trim().toLowerCase()
  const m = /^1d(\d+)$/.exec(die)
  if (!m) return null
  const sides = parseInt(m[1], 10)
  if (!(sides >= 1)) return null
  const face = Math.min(sides, 1 + Math.floor(rng() * sides))
  const bonus = bonusOf(table[String(face)])
  return bonus ? { die, face, bonus } : null
}

/** "+1 Dexterity", "+1 Stealth", "+2 Sleight of Hand". */
export function knackWords(bonus: KnackBonus): string {
  return Object.entries(bonus)
    .map(([key, value]) => {
      const k = key.toLowerCase()
      const name = ABILITY_NAMES[k] ?? k.split("_").map((w, i) => (i > 0 && w === "of" ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ")
      return `${value >= 0 ? "+" : ""}${value} ${name}`
    })
    .join(", ")
}

/**
 * The copy's own description once its knack is known: the catalogue's first sentence, then what this one does.
 * "A red hooded travelling cloak. +1 Dexterity while worn (passive 1d2 rolled 1)."
 */
export function knackDescription(catalogueDescription: string | null | undefined, knack: Knack): string {
  const first = String(catalogueDescription ?? "").trim().split(/(?<=[.!?])\s/)[0] ?? ""
  return `${first ? first + " " : ""}${knackWords(knack.bonus)} while worn (passive ${knack.die} rolled ${knack.face}).`
}
