// The one write path from a Character Forge export to real rows — shared by POST /api/forge/import
// (the DM's direct importer) and POST /api/forge/activate (the DM opening a Forge hero's cell).
//
// Lifted verbatim out of app/api/forge/import/route.ts on 2026-10-25 so activation could not
// drift from import. Behaviour is unchanged: whitelisted columns only, numbers clamped, is_player
// and character_type forced server-side, the Act 1 confiscation (lib/confiscation.ts), and a
// three-word rejoin code — which activation PRESETS to the words the Forge already gave the
// player, so the door at /join opens for them without learning anything new.

import type { SupabaseClient } from "@supabase/supabase-js"
import { generateClaimCode, normalizeCode, safeEquals } from "@/lib/access-code"
import { CONFISCATION_ACTIVE, confiscateOnImport, type ConfiscationResult } from "@/lib/confiscation"

// Only these columns may be written from the payload. Anything else the client
// sends (id, claim_token, created_at, is_player…) is dropped on the floor.
export const CHARACTER_COLUMN_WHITELIST = [
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

export const INVENTORY_COLUMN_WHITELIST = [
  "name",
  "quantity",
  "description",
  "weight",
  "value",
  "item_type",
  "equippable_slot",
] as const

export function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback
  return Math.min(max, Math.max(min, Math.round(v)))
}

export type ImportOutcome =
  | { kind: "bad_format" }
  | { kind: "no_name" }
  | { kind: "duplicate"; name: string }
  | { kind: "insert_failed" }
  | { kind: "created"; characterId: string; claimToken: string | null; claimCode: string | null; confiscation: ConfiscationResult | null; warning?: string }

export interface ImportOptions {
  /** Allow a second character with the same name. */
  confirmDuplicate?: boolean
  /** Use these exact words as the rejoin code (a Forge hero's words) instead of generating fresh ones. */
  presetCode?: string | null
}

/** Write a `{ format, character, inventory }` payload into characters + inventory_items. */
export async function importCharacter(admin: SupabaseClient, body: any, opts: ImportOptions = {}): Promise<ImportOutcome> {
  if (body?.format !== "aop-character-v1" && body?.character?.format !== "aop-character-v1") return { kind: "bad_format" }
  const character = body.character
  if (!character || typeof character.name !== "string" || character.name.trim().length === 0) return { kind: "no_name" }
  const name = character.name.trim()

  // Re-importing the same player character should WARN, not silently duplicate.
  if (!opts.confirmDuplicate) {
    const { data: existing, error: dupError } = await admin
      .from("characters")
      .select("id, name")
      .eq("name", name)
      .eq("is_player", true)
      .limit(1)
      .maybeSingle()
    if (dupError) { console.error("[v0] forge/import: duplicate check failed:", dupError); return { kind: "insert_failed" } }
    if (existing) return { kind: "duplicate", name }
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

  const { data: inserted, error: insertError } = await admin.from("characters").insert(row).select("id").single()
  if (insertError || !inserted) { console.error("[v0] forge/import: character insert failed:", insertError); return { kind: "insert_failed" } }

  // The claim token is created by the characters_create_secrets trigger into
  // character_secrets (which the anon key cannot read) — read it back from there.
  const { data: secretRow, error: secretError } = await admin
    .from("character_secrets")
    .select("claim_token")
    .eq("character_id", inserted.id)
    .maybeSingle()
  if (secretError || !secretRow) {
    console.error("[v0] forge/import: claim token unavailable:", secretError)
    return { kind: "created", characterId: inserted.id, claimToken: null, claimCode: null, confiscation: null, warning: "Character created, but no claim link could be issued." }
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
  let confiscation: ConfiscationResult | null = null
  let warning: string | undefined
  if (CONFISCATION_ACTIVE) {
    confiscation = await confiscateOnImport(admin, inserted.id, items)
    if (!confiscation) console.error("[v0] forge/import: confiscation unavailable, importing inventory as-is")
  }
  if (!confiscation && items.length > 0) {
    const { error: invError } = await admin.from("inventory_items").insert(items)
    if (invError) { console.error("[v0] forge/import: inventory insert failed:", invError); warning = "Character created but inventory failed to import." }
  }

  // Issue (or preset) the three-word rejoin code. Best-effort: a failure here never blocks
  // the import (the claim link still works).
  let claimCode: string | null = null
  const preset = opts.presetCode ? normalizeCode(opts.presetCode) : ""
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = preset || generateClaimCode()
    if (process.env.DM_ACCESS_CODE && safeEquals(candidate, normalizeCode(process.env.DM_ACCESS_CODE))) { if (preset) break; continue }
    if (process.env.FORGE_ACCESS_CODE && safeEquals(candidate, normalizeCode(process.env.FORGE_ACCESS_CODE))) { if (preset) break; continue }
    const { data: taken, error: takenError } = await admin.from("character_secrets").select("character_id").ilike("claim_code", candidate).limit(1).maybeSingle()
    if (takenError) { console.error("[v0] forge/import: claim-code uniqueness check failed:", takenError); break }
    if (taken) { if (preset) { console.error("[v0] forge/import: preset code already taken"); break } continue }
    const { error: codeError } = await admin.from("character_secrets").update({ claim_code: candidate }).eq("character_id", inserted.id)
    if (codeError) { console.error("[v0] forge/import: claim-code write failed:", codeError); break }
    claimCode = candidate
    break
  }

  return { kind: "created", characterId: inserted.id, claimToken: secretRow.claim_token, claimCode, confiscation, warning }
}
