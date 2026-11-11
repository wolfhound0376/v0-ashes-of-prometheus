// THE FLOOR HOLDS REAL ITEMS — step 2 of claude/Item_Identity_Design_2026-11-10.md (Sam, 2026-11-10: "Go").
//
// Until now a thing put down or thrown had its `inventory_items` row DELETED, and picking it up made a new row: the
// item's ID, its condition, its upgrades and its history ended at the floor. Now the row is PARKED instead: it moves to
// a holder character, exactly as the party's confiscated gear already lives on the "Velkynvelve Equipment Stash"
// (lib/confiscation.ts), and the pile on the floor (`walk-floor` world flag) carries the row's id. Picking the pile
// up moves that same row into the taker's pack.
//
// WHY A HOLDER AND NOT NEW COLUMNS. The design doc proposed `location_kind` / `location_ref` columns and a nullable
// `character_id`. That changes the table every inventory screen reads, and every reader would have to learn to filter
// on location. A holder needs no schema change and no reader changes: a hero's pack is still "rows whose character_id
// is mine", and the floor's rows belong to nobody who has a sheet. Same outcome, far less to break.
//
// The holder is created on first use, column for column like the stash. It is not a player and is never seated.

export const FLOOR_HOLDER_NAME = "Velkynvelve Floor"
// Step 3: what is still in a chest, on a body or in a guard's pockets. Same pattern, a second holder, so "on the floor"
// and "not yet taken" are never confused. Which container a row belongs to is kept in the `walk-loot` world flag
// (`rows[container][slug]`), beside the counts that already live there.
export const LOOT_HOLDER_NAME = "Velkynvelve Loot"

type Db = { from: (t: string) => any }   // eslint-disable-line @typescript-eslint/no-explicit-any

/** The floor holder's character id; created the first time something is put down. null = could not (the caller falls back). */
export const floorHolderId = (db: Db, create = true) => holderId(db, FLOOR_HOLDER_NAME, create)
export const lootHolderId = (db: Db, create = true) => holderId(db, LOOT_HOLDER_NAME, create)
async function holderId(db: Db, name: string, create: boolean): Promise<string | null> {
  try {
    const { data } = await db.from("characters").select("id").eq("name", name).order("created_at", { ascending: true }).limit(1).maybeSingle()
    if (data?.id) return data.id as string
    if (!create) return null
    const { data: made } = await db.from("characters").insert({
      name, class: "Storage", level: 0, hp_current: 1, hp_max: 1, ac: 10, initiative: 0,
      proficiency_bonus: 0, passive_perception: 0,
      str_score: 10, str_modifier: 0, dex_score: 10, dex_modifier: 0, con_score: 10, con_modifier: 0,
      int_score: 10, int_modifier: 0, wis_score: 10, wis_modifier: 0, cha_score: 10, cha_modifier: 0,
      xp: 0, xp_to_next: 0, weight_current: 0, weight_max: 100000, is_player: false, character_type: "npc",
    }).select("id").maybeSingle()
    return (made?.id as string) ?? null
  } catch { return null }
}

/** How many rows a container still needs minted for one unique kind: what is left of it, less the rows it already has. */
export function rowsToMint(o: { qty: number; taken: number; have: number; stackable: boolean; inCatalogue: boolean }): number {
  if (o.stackable || !o.inCatalogue) return 0          // stacks stay stacks; nothing is invented
  return Math.max(0, o.qty - o.taken - o.have)
}

/** What a pickup does with the row parked under a pile. Pure, so the rule is tested. */
export type ParkedPlan = "move-row" | "merge-into-stack" | "mint-new"
export function pickupPlan(o: { parkedRowFound: boolean; stackable: boolean; takerHasStack: boolean }): ParkedPlan {
  if (!o.parkedRowFound) return "mint-new"                          // an old pile, or the DM's "put something down": no row yet
  if (o.stackable && o.takerHasStack) return "merge-into-stack"     // stacks stay stacks (Sam's ruling 1)
  return "move-row"                                                 // the same item, the same id, into new hands
}
