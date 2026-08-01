import { createAdminClient } from "@/lib/supabase/admin"

// POST /api/forge/import — the Character Forge importer.
//
// Accepts an `aop-character-v1` payload { character, inventory, forge },
// writes real rows into `characters` and `inventory_items`, and returns a
// claim link. Uses the SERVICE-ROLE client (same pattern as verify-claim)
// because the response includes the freshly-generated claim URL — the anon
// client must never be able to read claim_token.

// Only these columns may be written from the payload. Anything else the client
// sends (id, claim_token, created_at, is_player…) is dropped on the floor.
const CHARACTER_COLUMN_WHITELIST = [
  "name",
  "level",
  "class",
  "xp",
  "xp_to_next",
  "hp_current",
  "hp_max",
  "ac",
  "initiative",
  "proficiency_bonus",
  "passive_perception",
  "str_score", "str_modifier",
  "dex_score", "dex_modifier",
  "con_score", "con_modifier",
  "int_score", "int_modifier",
  "wis_score", "wis_modifier",
  "cha_score", "cha_modifier",
  "weight_current",
  "weight_max",
  "speed",
  "size",
  "senses",
  "skills",
  "languages",
  "conditions",
  "portrait_image_url",
  "avatar_image_url",
  "sheet_species",
  "sheet_background",
  "sheet_alignment",
  "sheet_player_name",
  "sheet_hp_temp",
  "sheet_hit_dice",
  "sheet_heroic_inspiration",
  "sheet_passive_insight",
  "sheet_passive_investigation",
  "sheet_save_proficiencies",
  "sheet_skill_proficiencies",
  "sheet_defenses",
  "sheet_proficiencies",
  "sheet_features",
  "sheet_attacks",
  "sheet_currency",
  "sheet_appearance",
  "sheet_personality",
  "sheet_backstory",
  "sheet_allies_organizations",
  "sheet_additional_notes",
  "sheet_spellcasting",
] as const

const INVENTORY_COLUMN_WHITELIST = [
  "name",
  "quantity",
  "description",
  "weight",
  "value",
  "item_type",
  "equippable_slot",
] as const

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback
  return Math.min(max, Math.max(min, Math.round(v)))
}

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Validate the format tag and the one non-negotiable field.
  if (body?.format !== "aop-character-v1" && body?.character?.format !== "aop-character-v1") {
    return Response.json(
      { error: "Unsupported format — expected an aop-character-v1 export from the Character Forge." },
      { status: 400 },
    )
  }
  const character = body.character
  if (!character || typeof character.name !== "string" || character.name.trim().length === 0) {
    return Response.json({ error: "Character name is required." }, { status: 400 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[v0] forge/import: admin client unavailable:", e)
    return Response.json({ error: "Server not configured" }, { status: 500 })
  }

  const name = character.name.trim()

  // Re-importing the same player character should WARN, not silently duplicate.
  // The client passes ?confirm=duplicate after the player confirms.
  const url = new URL(req.url)
  const confirmDuplicate = url.searchParams.get("confirm") === "duplicate"
  if (!confirmDuplicate) {
    const { data: existing, error: dupError } = await admin
      .from("characters")
      .select("id, name")
      .eq("name", name)
      .eq("is_player", true)
      .limit(1)
      .maybeSingle()
    if (dupError) {
      console.error("[v0] forge/import: duplicate check failed:", dupError)
      return Response.json({ error: "Lookup failed" }, { status: 500 })
    }
    if (existing) {
      return Response.json(
        {
          duplicate: true,
          error: `A player character named "${name}" already exists. Confirm to create a second copy.`,
        },
        { status: 409 },
      )
    }
  }

  // Spread ONLY whitelisted columns; never trust numeric fields blindly.
  const row: Record<string, unknown> = {}
  for (const col of CHARACTER_COLUMN_WHITELIST) {
    if (character[col] !== undefined) row[col] = character[col]
  }
  row.name = name
  row.level = clamp(character.level, 1, 20, 1)
  row.hp_max = clamp(character.hp_max, 1, 999, 10)
  row.hp_current = clamp(character.hp_current, 0, 999, Number(row.hp_max))
  row.ac = clamp(character.ac, 1, 40, 10)
  for (const ab of ["str", "dex", "con", "int", "wis", "cha"] as const) {
    row[`${ab}_score`] = clamp(character[`${ab}_score`], 1, 30, 10)
    row[`${ab}_modifier`] = clamp(character[`${ab}_modifier`], -5, 10, 0)
  }
  // Forced server-side, never client-supplied.
  row.is_player = true
  row.character_type = "player"

  // claim_token populates itself (gen_random_uuid() default) — read it back.
  const { data: inserted, error: insertError } = await admin
    .from("characters")
    .insert(row)
    .select("id, claim_token")
    .single()

  if (insertError || !inserted) {
    console.error("[v0] forge/import: character insert failed:", insertError)
    return Response.json({ error: "Failed to create character" }, { status: 500 })
  }

  // Bulk-insert inventory with the new character_id (whitelisted columns only).
  const inventory: any[] = Array.isArray(body.inventory) ? body.inventory : []
  if (inventory.length > 0) {
    const items = inventory
      .filter((item) => item && typeof item.name === "string" && item.name.trim().length > 0)
      .slice(0, 200)
      .map((item) => {
        const it: Record<string, unknown> = { character_id: inserted.id }
        for (const col of INVENTORY_COLUMN_WHITELIST) {
          if (item[col] !== undefined) it[col] = item[col]
        }
        it.name = item.name.trim()
        it.quantity = clamp(item.quantity, 1, 9999, 1)
        return it
      })
    if (items.length > 0) {
      const { error: invError } = await admin.from("inventory_items").insert(items)
      if (invError) {
        // The character exists; report the partial failure honestly.
        console.error("[v0] forge/import: inventory insert failed:", invError)
        return Response.json(
          { characterId: inserted.id, warning: "Character created but inventory failed to import." },
          { status: 207 },
        )
      }
    }
  }

  // NOTE: the `forge` blob (builder-internal state) is intentionally dropped.

  const origin = url.origin
  const claimUrl = `${origin}/?c=${inserted.id}&k=${inserted.claim_token}`
  return Response.json({ characterId: inserted.id, claimUrl }, { status: 200 })
}
