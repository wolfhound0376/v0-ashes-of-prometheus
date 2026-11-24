import type { SupabaseClient } from "@supabase/supabase-js"
import { hasKnackTable, knackDescription, rollKnack, type KnackBonus } from "./item-knack"

// ============================================================================
// Knacks, written down. The reading-and-writing half of lib/item-knack.ts.
//
// ensureKnacks(db, characterId) looks through what a character carries, and
// for every copy whose catalogue row has a knack table and which has not been
// rolled yet, rolls it ONCE and writes the result on that copy
// (inventory_items.stats_bonus, with a description line that says what it
// does). It returns each carried copy's bonus by row id.
//
// WHY HERE and not at every place an item is created: there are two dozen of
// those (loot, awards, pickups, gifts, the Forge, the admin page) and the next
// one written would forget. Instead the roll happens the first time the game
// LOOKS at the pack (/api/equipment) or equips from it — which, for a roll
// the player never sees, is the same moment as "when it is found".
//
// ONE ROLL, even if two screens look at once: the write only lands on a row
// whose stats_bonus is still null, and whoever loses that race reads the
// winner's result back instead of keeping their own.
//
// BEST EFFORT. Until migrations/inventory_items_stats_bonus.sql has been run
// the column does not exist; that, and any other failure, means "no knacks"
// and an empty map. It must never stop a pack from loading.
// ============================================================================

type Catalogue = { description: string | null; properties: unknown }
type CarriedRow = { id: string; stats_bonus: unknown; items: Catalogue | Catalogue[] | null }

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)
const isBonus = (v: unknown): v is KnackBonus => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length > 0

export async function ensureKnacks(db: SupabaseClient, characterId: string, rng: () => number = Math.random): Promise<Map<string, KnackBonus>> {
  const known = new Map<string, KnackBonus>()
  try {
    const { data, error } = await db.from("inventory_items")
      .select("id, stats_bonus, items(description, properties)")
      .eq("character_id", characterId)
    if (error || !data) return known
    for (const row of data as unknown as CarriedRow[]) {
      if (isBonus(row.stats_bonus)) { known.set(row.id, row.stats_bonus); continue }
      const cat = one(row.items)
      if (row.stats_bonus != null || !cat || !hasKnackTable(cat.properties)) continue
      const knack = rollKnack(cat.properties, rng)
      if (!knack) continue
      const { data: won } = await db.from("inventory_items")
        .update({ stats_bonus: knack.bonus, description: knackDescription(cat.description, knack), updated_at: new Date().toISOString() })
        .eq("id", row.id).is("stats_bonus", null)
        .select("id")
      if (won?.length) { known.set(row.id, knack.bonus); continue }
      // another screen rolled it first: theirs stands
      const { data: theirs } = await db.from("inventory_items").select("stats_bonus").eq("id", row.id).maybeSingle()
      const settled = (theirs as { stats_bonus?: unknown } | null)?.stats_bonus
      if (isBonus(settled)) known.set(row.id, settled)
    }
  } catch {
    /* no knacks */
  }
  return known
}
