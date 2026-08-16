import { createAdminClient } from "@/lib/supabase/admin"
import { generateClaimCode, normalizeCode, safeEquals } from "@/lib/access-code"
import { CONFISCATION_ACTIVE, confiscateOnImport, type ConfiscationResult } from "@/lib/confiscation"

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
  "sheet_subclass",
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

  // ---- Authorization ------------------------------------------------------
  // When a gate is armed (FORGE_ACCESS_CODE or DM_ACCESS_CODE set), an import
  // must carry ONE of:
  //   1. x-forge-key — the forge or DM access code (normalised, timing-safe);
  //   2. x-character-id + x-claim-token — a claimed player's own verified pair.
  // With NEITHER env var set the importer stays open — the same fail-open rule
  // as the /join gate: a forgotten env var must never lock Sam out of his game.
  const forgeCode = process.env.FORGE_ACCESS_CODE
  const dmCode = process.env.DM_ACCESS_CODE
  if (forgeCode || dmCode) {
    let authorized = false
    const suppliedKey = normalizeCode(req.headers.get("x-forge-key"))
    if (suppliedKey) {
      if (forgeCode && safeEquals(suppliedKey, normalizeCode(forgeCode))) authorized = true
      if (!authorized && dmCode && safeEquals(suppliedKey, normalizeCode(dmCode))) authorized = true
    }
    if (!authorized) {
      const ownCharacterId = req.headers.get("x-character-id")
      const ownClaimToken = req.headers.get("x-claim-token")
      if (ownCharacterId && ownClaimToken) {
        const { data: ownSecret } = await admin
          .from("character_secrets")
          .select("claim_token")
          .eq("character_id", ownCharacterId)
          .maybeSingle()
        if (ownSecret?.claim_token && ownSecret.claim_token === ownClaimToken) authorized = true
      }
    }
    if (!authorized) {
      return Response.json(
        { error: "The forge is barred. Enter through /join with a forge code, or claim your seat first." },
        { status: 403 },
      )
    }
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

  const { data: inserted, error: insertError } = await admin
    .from("characters")
    .insert(row)
    .select("id")
    .single()

  if (insertError || !inserted) {
    console.error("[v0] forge/import: character insert failed:", insertError)
    return Response.json({ error: "Failed to create character" }, { status: 500 })
  }

  // The claim token is created by the characters_create_secrets trigger into
  // character_secrets (which the anon key cannot read) — read it back from there.
  const { data: secretRow, error: secretError } = await admin
    .from("character_secrets")
    .select("claim_token")
    .eq("character_id", inserted.id)
    .maybeSingle()

  if (secretError || !secretRow) {
    console.error("[v0] forge/import: claim token unavailable:", secretError)
    return Response.json(
      { characterId: inserted.id, warning: "Character created, but no claim link could be issued." },
      { status: 207 },
    )
  }

  // Build the inventory rows (whitelisted columns only). Where they land is
  // decided below — on the character normally, in the Velkynvelve stash while
  // the campaign's confiscation rule is active.
  const inventory: any[] = Array.isArray(body.inventory) ? body.inventory : []
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

  // Act 1 starting condition: the drow took everything. The kit is moved into
  // the stash, never destroyed, and the character is issued rags instead.
  // See lib/confiscation.ts.
  let confiscation: ConfiscationResult | null = null
  if (CONFISCATION_ACTIVE) {
    confiscation = await confiscateOnImport(admin, inserted.id, items)
    if (!confiscation) {
      // Stash unreachable. Fall through to the ordinary import rather than
      // silently vaporising the player's gear.
      console.error("[v0] forge/import: confiscation unavailable, importing inventory as-is")
    }
  }

  if (!confiscation && items.length > 0) {
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

  // NOTE: the `forge` blob (builder-internal state) is intentionally dropped.

  // Issue a three-word rejoin code so the player can claim this seat from any
  // other device via /join — same shape as the hand-issued codes. Best-effort:
  // a failure here never blocks the import (the claim link still works).
  let claimCode: string | null = null
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = generateClaimCode()
    // Never collide with the env-gate codes, however unlikely.
    if (process.env.DM_ACCESS_CODE && safeEquals(candidate, normalizeCode(process.env.DM_ACCESS_CODE))) continue
    if (process.env.FORGE_ACCESS_CODE && safeEquals(candidate, normalizeCode(process.env.FORGE_ACCESS_CODE))) continue
    const { data: taken, error: takenError } = await admin
      .from("character_secrets")
      .select("character_id")
      .ilike("claim_code", candidate)
      .limit(1)
      .maybeSingle()
    if (takenError) {
      console.error("[v0] forge/import: claim-code uniqueness check failed:", takenError)
      break
    }
    if (taken) continue
    const { error: codeError } = await admin
      .from("character_secrets")
      .update({ claim_code: candidate })
      .eq("character_id", inserted.id)
    if (codeError) {
      console.error("[v0] forge/import: claim-code write failed:", codeError)
      break
    }
    claimCode = candidate
    break
  }

  const origin = url.origin
  const claimUrl = `${origin}/?c=${inserted.id}&k=${secretRow.claim_token}`
  return Response.json(
    {
      characterId: inserted.id,
      claimUrl,
      claimCode,
      ...(confiscation
        ? {
            confiscated: confiscation.confiscated,
            issuedRags: confiscation.issuedRags,
            ...(confiscation.notes.length > 0 ? { confiscationNotes: confiscation.notes } : {}),
          }
        : {}),
    },
    { status: 200 },
  )
}
