// Velkynvelve confiscation — the Act 1 starting condition.
//
// "Out of the Abyss" opens with the party already captured. The drow stripped
// them at the surface and locked their gear in the outpost storeroom. A newly
// imported character must therefore arrive at the slave pen owning NOTHING but
// the rags they were issued, with their real kit sitting recoverable in a
// stash they can rob later.
//
// This is the CODE half of that rule. The DATA half — the one-time cleanup of
// characters that already existed — is
// `supabase/migrations/velkynvelve_confiscation.sql`. The two must agree:
// same stash name, same rags catalog row, same "move, never destroy" contract.
// If you change one, change the other.
//
// Server-only. Takes the service-role client because it writes across two
// characters' rows.

import type { createAdminClient } from "@/lib/supabase/admin"

type Admin = ReturnType<typeof createAdminClient>

/** The NPC row that owns every confiscated item. Matches the SQL migration. */
export const CONFISCATION_STASH_NAME = "Velkynvelve Equipment Stash"

/** Catalog slug for the prison rags each captive is issued. */
export const PRISONER_ISSUE_SLUG = "rags"

/**
 * Master switch. Act 1 opens with the party imprisoned, so confiscation is on.
 * Once the party escapes Velkynvelve and recovers their gear this becomes
 * wrong — set `CONFISCATE_STARTING_INVENTORY=false` in Vercel to retire it
 * without a code change.
 */
export const CONFISCATION_ACTIVE = process.env.CONFISCATE_STARTING_INVENTORY !== "false"

export type ConfiscationResult = {
  /** Items moved into the stash rather than onto the character. */
  confiscated: number
  /** Whether the character was issued rags (carried + worn). */
  issuedRags: boolean
  /** Non-fatal problems worth surfacing to the importer. */
  notes: string[]
}

/**
 * Resolve the stash character row, creating it if this is the first import on
 * a database where the SQL migration has not been pasted in yet.
 *
 * Idempotent: the lookup runs first, so repeat imports reuse the same row.
 * Returns null only if the row genuinely cannot be created, in which case the
 * caller must NOT silently drop the player's items.
 */
async function resolveStashId(admin: Admin): Promise<string | null> {
  // Never a bare .single() — see AGENTS.md §8. Duplicate stash rows would
  // throw and take the whole import down with them.
  const { data: existing, error: lookupError } = await admin
    .from("characters")
    .select("id")
    .eq("name", CONFISCATION_STASH_NAME)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (lookupError) {
    console.error("[v0] confiscation: stash lookup failed:", lookupError)
    return null
  }
  if (existing?.id) return existing.id as string

  // Column-for-column identical to velkynvelve_confiscation.sql.
  const { data: created, error: createError } = await admin
    .from("characters")
    .insert({
      name: CONFISCATION_STASH_NAME,
      class: "Storage",
      level: 0,
      hp_current: 1,
      hp_max: 1,
      ac: 10,
      initiative: 0,
      proficiency_bonus: 0,
      passive_perception: 0,
      str_score: 10, str_modifier: 0,
      dex_score: 10, dex_modifier: 0,
      con_score: 10, con_modifier: 0,
      int_score: 10, int_modifier: 0,
      wis_score: 10, wis_modifier: 0,
      cha_score: 10, cha_modifier: 0,
      xp: 0,
      xp_to_next: 0,
      weight_current: 0,
      weight_max: 10000,
      is_player: false,
      character_type: "npc",
    })
    .select("id")
    .single()

  if (createError || !created) {
    console.error("[v0] confiscation: stash creation failed:", createError)
    return null
  }
  return created.id as string
}

/**
 * Resolve the rags catalog row, creating it if absent. Mirrors the migration's
 * `on conflict (slug) do nothing` insert. `icon_url` stays null until the
 * artwork is uploaded through admin — per AGENTS.md, item art is never
 * AI-generated.
 */
async function resolveRags(admin: Admin) {
  const columns = "id, name, description, weight, value, item_type, equippable_slot, icon_url"

  const { data: existing, error: lookupError } = await admin
    .from("items")
    .select(columns)
    .eq("slug", PRISONER_ISSUE_SLUG)
    .limit(1)
    .maybeSingle()

  if (lookupError) {
    console.error("[v0] confiscation: rags lookup failed:", lookupError)
    return null
  }
  if (existing) return existing as any

  const { data: created, error: createError } = await admin
    .from("items")
    .insert({
      name: "Rags",
      slug: PRISONER_ISSUE_SLUG,
      item_type: "armor",
      equippable_slot: "torso",
      rarity: "common",
      weight: 2,
      value: 0,
      condition: "damaged",
      description: "Damaged prison rags issued to captives at Velkynvelve.",
      icon_url: null,
    })
    .select(columns)
    .single()

  if (createError || !created) {
    console.error("[v0] confiscation: rags creation failed:", createError)
    return null
  }
  return created as any
}

/**
 * Apply the starting condition to a freshly imported character.
 *
 * `inventoryRows` are the already-whitelisted, already-clamped rows the
 * importer built — but they get written carrying the STASH's character_id,
 * not the player's. Nothing is deleted: the player's kit is recoverable in
 * full.
 *
 * Failure policy: if the stash cannot be resolved we return null and let the
 * caller fall back to the normal import. Losing a player's gear because a
 * lookup blipped is far worse than a character starting with a backpack.
 */
export async function confiscateOnImport(
  admin: Admin,
  characterId: string,
  inventoryRows: Record<string, unknown>[],
): Promise<ConfiscationResult | null> {
  const notes: string[] = []

  const stashId = await resolveStashId(admin)
  if (!stashId) return null

  let confiscated = 0
  if (inventoryRows.length > 0) {
    const stashed = inventoryRows.map((row) => ({ ...row, character_id: stashId }))
    const { error: stashError } = await admin.from("inventory_items").insert(stashed)
    if (stashError) {
      console.error("[v0] confiscation: stash insert failed:", stashError)
      return null
    }
    confiscated = stashed.length
  }

  // Issue the rags: one carried row, one worn paper-doll row. Rags grant no AC
  // bonus, so the sheet derives 10 + Dexterity as normal.
  let issuedRags = false
  const rags = await resolveRags(admin)
  if (rags) {
    const { error: carriedError } = await admin.from("inventory_items").insert({
      character_id: characterId,
      item_id: rags.id,
      name: rags.name,
      quantity: 1,
      icon_url: rags.icon_url,
      icon_type: "preset",
      preset_icon: "shirt",
      description: rags.description,
      weight: rags.weight,
      value: rags.value,
      item_type: rags.item_type,
      equippable_slot: rags.equippable_slot,
    })
    const { error: wornError } = await admin.from("equipment_items").insert({
      character_id: characterId,
      slot: "torso",
      name: rags.name,
      icon_url: rags.icon_url,
      equipped: true,
      description: rags.description,
      stats_bonus: { ac: 0 },
    })
    if (carriedError || wornError) {
      console.error("[v0] confiscation: rags issue failed:", carriedError ?? wornError)
      notes.push("Character was stripped but could not be issued rags.")
    } else {
      issuedRags = true
    }
  } else {
    notes.push("Rags catalog entry unavailable — character starts with nothing worn.")
  }

  // Carried weight is now the rags alone, or zero.
  const { error: weightError } = await admin
    .from("characters")
    .update({ weight_current: issuedRags ? Number(rags?.weight ?? 0) : 0 })
    .eq("id", characterId)
  if (weightError) {
    console.error("[v0] confiscation: weight reset failed:", weightError)
    notes.push("Carried weight may be stale until the sheet next saves.")
  }

  return { confiscated, issuedRags, notes }
}
