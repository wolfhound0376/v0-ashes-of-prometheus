// Small, careful pack writes the alchemy routes share. Server-only (takes the
// service-role client). Every taker writes nothing if it cannot find the thing,
// and every giver stacks onto a PLAIN row only — never onto a prepared
// ingredient (prep) or a brewed flask (brew), which are instances.
import type { createAdminClient } from "@/lib/supabase/admin"

type Db = ReturnType<typeof createAdminClient>

export interface CatalogRow {
  id: string
  slug: string
  name: string
  description?: string | null
  item_type?: string | null
  weight?: number | string | null
  value?: number | null
  icon_url?: string | null
  stackable?: boolean | null
}

export interface PackRow {
  id: string
  name: string
  quantity: number | null
  item_id: string | null
  prep?: unknown
  brew?: unknown
}

export async function catalogRow(db: Db, slug: string): Promise<CatalogRow | null> {
  const { data } = await db
    .from("items")
    .select("id, slug, name, description, item_type, weight, value, icon_url, stackable")
    .eq("slug", slug)
    .maybeSingle()
  return (data as CatalogRow | null) ?? null
}

/** Plain (not prepared, not brewed) rows of this catalogue item in the pack. */
export async function plainHeld(db: Db, characterId: string, item: CatalogRow): Promise<PackRow[]> {
  const { data } = await db
    .from("inventory_items")
    .select("id, name, quantity, item_id, prep, brew")
    .eq("character_id", characterId)
  return ((data ?? []) as PackRow[]).filter(
    (r) => (r.item_id ? r.item_id === item.id : r.name === item.name) && !r.prep && !r.brew && (r.quantity ?? 1) > 0,
  )
}

export function count(rows: PackRow[]): number {
  return rows.reduce((n, r) => n + (r.quantity ?? 1), 0)
}

export async function takeOne(db: Db, row: PackRow): Promise<string | null> {
  const left = (row.quantity ?? 1) - 1
  const { error } =
    left <= 0
      ? await db.from("inventory_items").delete().eq("id", row.id)
      : await db.from("inventory_items").update({ quantity: left }).eq("id", row.id)
  return error?.message ?? null
}

export async function giveOne(db: Db, characterId: string, item: CatalogRow): Promise<string | null> {
  if (item.stackable !== false) {
    const [existing] = await plainHeld(db, characterId, item)
    if (existing) {
      const { error } = await db.from("inventory_items").update({ quantity: (existing.quantity ?? 1) + 1 }).eq("id", existing.id)
      return error?.message ?? null
    }
  }
  const { error } = await db.from("inventory_items").insert({
    character_id: characterId,
    name: item.name,
    quantity: 1,
    item_id: item.id,
    description: item.description ?? null,
    item_type: item.item_type ?? null,
    weight: item.weight ?? null,
    value: item.value ?? null,
    icon_url: item.icon_url ?? null,
  })
  return error?.message ?? null
}
