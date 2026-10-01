// The alchemy bench SANDBOX — a practice character for the DM.
//
// Sam, 2026-10-01: "we need a sandbox so I can test the bench."
//
// Rather than teach nine routes a second, pretend inventory, the sandbox is a
// real character the routes treat like any other: the Sandbox Alchemist. So
// what the DM tests IS the bench, end to end, writes included. Three things
// keep it out of the game:
//   * it is never a player and never in the party (is_player false,
//     in_party false), so no dashboard, party list or picker shows it;
//   * every alchemy route refuses it without the DM key
//     (lib/alchemy-sandbox-server.ts), so no player can use it to read the
//     grid or try combinations for free;
//   * nothing it does is written to the shared game log (`dialogue`).
//
// Its stock is built only from catalog rows (AGENTS.md: the AI cannot invent
// items). Nothing here is canon, and Restock puts it all back.

import { isGrid } from "./eat-it-and-see"
import { methodOf, preparedName, type PrepBlob } from "./extraction"
import { RUNE_MATERIALS } from "./alchemy-runes"
import { STILL_SLUG } from "./drink-making"
import { isDrinkData } from "./inebriation"

/** Fixed, so the routes can recognise it without a database flag. */
export const SANDBOX_CHARACTER_ID = "5a4db0c3-a1c4-4e3b-9a7e-5a4db0c3e5a1"
export const SANDBOX_NAME = "Sandbox Alchemist"

export function isSandboxCharacter(id: unknown): boolean {
  return id === SANDBOX_CHARACTER_ID
}

/** Runes need an arcane caster, the rites need a cleric (lib/alchemy-runes,
 *  lib/alchemy-cleric), so the practice character comes as either. */
export type SandboxClass = "Wizard" | "Cleric"
export const SANDBOX_CLASSES: readonly SandboxClass[] = ["Wizard", "Cleric"]
export function isSandboxClass(v: unknown): v is SandboxClass {
  return v === "Wizard" || v === "Cleric"
}

/** A real camp budget, so "no camp action left" can be tested too. */
export const SANDBOX_CAMP_ACTIONS = 2

/** The character row. A level-1 sheet with alchemist's supplies and an
 *  herbalism kit, CON saves for tasting, Arcana for the wizard, and the two
 *  rituals the cleric's rites need prepared. */
export function sandboxSheet(cls: SandboxClass) {
  const wizard = cls === "Wizard"
  return {
    id: SANDBOX_CHARACTER_ID,
    name: SANDBOX_NAME,
    class: cls,
    level: 1,
    character_type: "npc",
    is_player: false,
    in_party: false,
    hp_current: 10,
    hp_max: 10,
    int_score: wizard ? 16 : 12,
    int_modifier: wizard ? 3 : 1,
    con_score: 14,
    con_modifier: 2,
    wis_score: wizard ? 12 : 16,
    wis_modifier: wizard ? 1 : 3,
    proficiency_bonus: 2,
    conditions: [],
    inebriation: null,
    rest_actions_remaining: SANDBOX_CAMP_ACTIONS,
    sheet_proficiencies: { tools: ["Alchemist's Supplies", "Herbalism Kit"] },
    sheet_save_proficiencies: ["con", wizard ? "int" : "wis"],
    sheet_skill_proficiencies: wizard ? { arcana: "proficient" } : { religion: "proficient", medicine: "proficient" },
    sheet_spellcasting: wizard
      ? { ability: "Intelligence", slots: { "1": { max: 2, used: 0 } }, prepared: [] }
      : {
          ability: "Wisdom",
          slots: { "1": { max: 2, used: 0 } },
          // Bless water, holy water and Purify Food and Drink (lib/alchemy-cleric).
          prepared: ["Bless", "Ceremony", "Purify Food and Drink"],
        },
  }
}

/** How much of each thing the practice pack holds. */
export const STOCK = {
  rawIngredient: 3,
  preparedIngredient: 3,
  drink: 2,
  holyWater: 3,
  blessedWater: 3,
  vials: 5,
  silver: 3,
  runeMaterial: 3,
} as const

export interface CatalogRow {
  id: string
  slug: string
  name: string
  description?: string | null
  item_type?: string | null
  weight?: number | string | null
  value?: number | null
  icon_url?: string | null
  alchemy_effects?: unknown
  properties?: unknown
}

export interface StockRow {
  character_id: string
  item_id: string
  name: string
  quantity: number
  description: string | null
  item_type: string | null
  weight: number | string | null
  value: number | null
  icon_url: string | null
  prep?: PrepBlob
}

const BASE_COUNTS: Record<string, number> = {
  "holy-water": STOCK.holyWater,
  "blessed-water": STOCK.blessedWater,
  "glass-vial": STOCK.vials,
  "powdered-silver": STOCK.silver,
  [STILL_SLUG]: 1,
  "alchemists-supplies": 1,
  "herbalism-kit": 1,
  ...Object.fromEntries(RUNE_MATERIALS.map((s) => [s, STOCK.runeMaterial])),
}

/** Every inventory row of a full practice pack, from catalog rows only:
 *  each ingredient raw AND already prepared, every drink, and the bases,
 *  vials, silver, rune materials, still and kits. Pure, so it is tested. */
export function stockRows(
  catalog: CatalogRow[],
  preparedIcon: (slug: string) => string | null = () => null,
  now = new Date().toISOString(),
): StockRow[] {
  const rows: StockRow[] = []
  const row = (c: CatalogRow, quantity: number, extra: Partial<StockRow> = {}): StockRow => ({
    character_id: SANDBOX_CHARACTER_ID,
    item_id: c.id,
    name: c.name,
    quantity,
    description: c.description ?? null,
    item_type: c.item_type ?? null,
    weight: c.weight ?? null,
    value: c.value ?? null,
    icon_url: c.icon_url ?? null,
    ...extra,
  })
  for (const c of [...catalog].sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (isGrid(c.alchemy_effects)) {
      rows.push(row(c, STOCK.rawIngredient))
      const method = methodOf(c.slug, c.properties)
      if (method) {
        rows.push(row(c, STOCK.preparedIngredient, {
          name: preparedName(c.name, method, false),
          icon_url: preparedIcon(c.slug) ?? c.icon_url ?? null,
          prep: { method, bruised: false, prepared_by: SANDBOX_CHARACTER_ID, prepared_at: now },
        }))
      }
      continue
    }
    if (isDrinkData((c.properties as { drink?: unknown } | null)?.drink)) {
      rows.push(row(c, STOCK.drink))
      continue
    }
    const n = BASE_COUNTS[c.slug]
    if (n) rows.push(row(c, n))
  }
  return rows
}

/** The slugs a stock is built from, for the catalog read. */
export const STOCK_BASE_SLUGS = Object.keys(BASE_COUNTS)
