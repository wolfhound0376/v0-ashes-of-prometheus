import type { SupabaseClient } from "@supabase/supabase-js"
import { calculateAC, type ACEquipmentItem } from "./armor-class"
import { withWornGear } from "./worn-bonus"

// ============================================================================
// `characters` rows, dressed. For the server routes that hand a hero's numbers
// to a screen (the painted map's sheet): read what each hero is wearing and
// return the rows as lib/worn-bonus.ts withWornGear sees them.
//
// The `ac` column is a stored number, not a derived one, so it is moved by
// exactly what the worn gear moves the AC formula (lib/armor-class.ts) — a
// Dexterity cloak adds to it under light armour, up to the cap under medium,
// and nothing under heavy.
//
// Best effort: if the worn rows cannot be read, the heroes come back as stored.
// A missing bonus is a smaller number on a sheet; a thrown error here would be
// a map that does not load.
// ============================================================================

type Row = Record<string, unknown>
type WornRow = ACEquipmentItem & { character_id: string; equipped?: boolean | null }

export async function dressRows<T extends object>(db: SupabaseClient, rows: T[]): Promise<T[]> {
  const ids = rows.map((r) => String((r as Row).id ?? "")).filter(Boolean)
  if (!ids.length) return rows
  try {
    const { data, error } = await db.from("equipment_items").select("character_id, slot, name, equipped, stats_bonus").in("character_id", ids)
    if (error || !data?.length) return rows
    const worn = new Map<string, WornRow[]>()
    for (const e of data as WornRow[]) (worn.get(e.character_id) ?? worn.set(e.character_id, []).get(e.character_id)!).push(e)
    return rows.map((own) => {
      const row = own as Row
      const gear = (worn.get(String(row.id)) ?? []).filter((g) => g.equipped !== false)
      const dressed = withWornGear(row, gear)
      if (dressed === row) return own
      const stored = typeof row.ac === "number" ? row.ac : null
      if (stored == null) return dressed as T
      const moved = calculateAC(dressed, gear).total - calculateAC(row, gear).total
      return (moved ? { ...dressed, ac: stored + moved } : dressed) as T
    })
  } catch {
    return rows
  }
}

/**
 * One row, dressed. `characterId` is for a row that was selected without its `id`. Null in, null out, and the same
 * row back when nothing worn changes it.
 */
export async function dressRow<T extends object>(db: SupabaseClient, row: T | null | undefined, characterId?: string | null): Promise<T | null> {
  if (!row) return null
  const own = (row as Row).id
  const id = characterId ?? (typeof own === "string" ? own : "")
  if (!id) return row
  const asked = { ...row, id } as T
  const [dressed] = await dressRows(db, [asked])
  return dressed === asked ? row : dressed
}
