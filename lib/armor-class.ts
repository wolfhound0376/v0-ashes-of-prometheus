import type { Character, EquipmentItem } from "@/lib/types/database"

// ============================================================================
// Derived Armour Class (D&D 5e).
//
// characters.ac is a hand-entered column that is wrong for every player — it
// reads 10 regardless of Dexterity. Rather than trust it, we DERIVE AC from the
// character's ability modifiers and whatever armour is actually equipped in
// equipment_items. This has a deliberate side effect the campaign depends on:
// the party are prisoners whose gear sits in a drow storeroom, so with only
// prison "Rags" equipped every player correctly falls back to 10 + Dex, and the
// moment their real armour is confiscated (removed from equipment_items) it
// stops contributing automatically.
//
// The schema does not store an armour's base AC or its category, only the item
// name and a stats_bonus map. We therefore recognise armour by name against the
// standard 5e table below; a `stats_bonus.ac` on a recognised piece is treated
// as a magic bonus on top of its printed base, and on any other slot (rings,
// cloaks, amulets) as a flat item bonus. Anything unrecognised — Rags included —
// is clothing and contributes nothing, leaving Unarmoured Defense intact.
// ============================================================================

type ArmorCategory = "light" | "medium" | "heavy"

// Ordered most-specific-first so "half plate" beats "plate" and "studded"
// (studded leather) beats "leather". First keyword contained in the item name
// wins.
const ARMOR_TABLE: Array<{ key: string; category: ArmorCategory; base: number }> = [
  { key: "half plate", category: "medium", base: 15 },
  { key: "splint", category: "heavy", base: 17 },
  { key: "plate", category: "heavy", base: 18 },
  { key: "ring mail", category: "heavy", base: 14 },
  { key: "chain mail", category: "heavy", base: 16 },
  { key: "chain shirt", category: "medium", base: 13 },
  { key: "scale mail", category: "medium", base: 14 },
  { key: "breastplate", category: "medium", base: 14 },
  { key: "hide", category: "medium", base: 12 },
  { key: "studded", category: "light", base: 12 },
  { key: "leather", category: "light", base: 11 },
  { key: "padded", category: "light", base: 11 },
]

function classifyArmor(name?: string | null): { category: ArmorCategory; base: number } | null {
  if (!name) return null
  const n = name.toLowerCase()
  for (const entry of ARMOR_TABLE) {
    if (n.includes(entry.key)) return { category: entry.category, base: entry.base }
  }
  return null
}

// Minimal shape accepted from equipment_items rows (or any object carrying the
// same fields). Kept loose so callers can pass DB rows or lighter view models.
export interface ACEquipmentItem {
  slot?: string | null
  name?: string | null
  stats_bonus?: Record<string, number> | null
}

export interface ACBreakdownPart {
  label: string
  value: number
}

export interface ACResult {
  total: number
  parts: ACBreakdownPart[]
  /** Human-checkable formula, e.g. "10 base + 3 DEX = 13". */
  text: string
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// Render the parts into a checkable string. The first part prints with its own
// sign ("10 base"); the rest join with + / - and the absolute value so a
// negative Dex reads "10 base - 1 DEX = 9" rather than "10 base + -1 DEX".
function formatParts(parts: ACBreakdownPart[], total: number): string {
  if (parts.length === 0) return `${total}`
  let text = `${parts[0].value} ${parts[0].label}`
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i]
    text += `${p.value >= 0 ? " + " : " - "}${Math.abs(p.value)} ${p.label}`
  }
  return `${text} = ${total}`
}

/**
 * Derive Armour Class and a human-readable breakdown from the character's
 * ability modifiers and equipped armour. Never reads characters.ac.
 *
 * Rules:
 *  - Unarmoured base: 10 + DEX
 *  - Monk Unarmoured Defense (no armour, no requirement on shield): 10 + DEX + WIS
 *  - Barbarian Unarmoured Defense (no armour): 10 + DEX + CON
 *  - Light armour: base + DEX
 *  - Medium armour: base + min(DEX, 2)
 *  - Heavy armour: base only (no DEX)
 *  - Shield: +2, stacks with any of the above
 */
export function calculateAC(
  character: Partial<Character> | undefined | null,
  equipment: ACEquipmentItem[] | undefined | null,
): ACResult {
  const dex = num(character?.dex_modifier)
  const wis = num(character?.wis_modifier)
  const con = num(character?.con_modifier)
  const cls = String(character?.class ?? "").toLowerCase()
  const items = Array.isArray(equipment) ? equipment : []

  // First equipped item recognisable as body armour defines the base.
  let bodyArmor: ACEquipmentItem | undefined
  let armorInfo: { category: ArmorCategory; base: number } | null = null
  for (const item of items) {
    const info = classifyArmor(item?.name)
    if (info) {
      bodyArmor = item
      armorInfo = info
      break
    }
  }

  // A shield is any equipped item whose name says so (normally off_hand).
  const shield = items.find((item) => /shield/i.test(String(item?.name ?? "")))

  const parts: ACBreakdownPart[] = []

  if (armorInfo && bodyArmor) {
    parts.push({ label: bodyArmor.name || "armor", value: armorInfo.base })
    const dexPart =
      armorInfo.category === "heavy" ? 0 : armorInfo.category === "medium" ? Math.min(dex, 2) : dex
    parts.push({ label: armorInfo.category === "heavy" ? "DEX (heavy)" : "DEX", value: dexPart })
    const magic = num(bodyArmor.stats_bonus?.ac)
    if (magic) parts.push({ label: "armor bonus", value: magic })
  } else {
    parts.push({ label: "base", value: 10 })
    parts.push({ label: "DEX", value: dex })
    if (cls === "monk") parts.push({ label: "WIS", value: wis })
    else if (cls === "barbarian") parts.push({ label: "CON", value: con })
  }

  if (shield) {
    parts.push({ label: "shield", value: 2 })
    const shieldMagic = num(shield.stats_bonus?.ac)
    if (shieldMagic) parts.push({ label: "shield bonus", value: shieldMagic })
  }

  // Flat AC bonuses from any other equipped item (ring/cloak/amulet of
  // protection, etc). The body-armour and shield rows are already counted.
  for (const item of items) {
    if (item === bodyArmor || item === shield) continue
    const bonus = num(item?.stats_bonus?.ac)
    if (bonus) parts.push({ label: item?.name || "item", value: bonus })
  }

  const total = parts.reduce((sum, p) => sum + p.value, 0)
  return { total, parts, text: formatParts(parts, total) }
}
