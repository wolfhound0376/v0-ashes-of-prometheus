import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"

// /api/dm/characters — DM-gated character CRUD.
//
//   POST json: { action, id?, patch? }
//
//   action: "create"  — insert a character   (patch = fields, name required)
//           "update"  — edit a character     (id + patch)
//           "archive" — soft delete          (id; sets archived_at, unseats)
//           "restore" — undo archive         (id; clears archived_at)
//           "delete"  — hard delete          (id; irreversible)
//
// This route exists because of the 2026-08-20 security pass: the public
// "Allow all access to characters" RLS policy is being replaced with
// read-only access, so every character WRITE must come through the server
// with the service-role key. The browser callers (the character admin
// panel, party seating, level-up) all moved here.
//
// AUTHORIZATION mirrors /api/dm/character-sheet: x-dm-key must carry
// DM_ACCESS_CODE. FAIL CLOSED: with the env var unset the route refuses
// everyone — an unset code means the gate is locked, not missing.

export const dynamic = "force-dynamic"

function authorized(request: NextRequest): boolean {
  const dmCode = process.env.DM_ACCESS_CODE
  // Fail closed: if no DM access code is configured, nobody is a DM.
  if (!dmCode) return false
  const supplied = normalizeCode(request.headers.get("x-dm-key"))
  return !!supplied && safeEquals(supplied, normalizeCode(dmCode))
}

// Every column a DM may write through this route. An allowlist means a typo
// or a hostile payload cannot reach a column nobody meant to expose — id,
// created_at, locked_at (the lock functions own it), seat_id and run_id
// (seat/run moves are a different operation) are deliberately absent.
const ALLOWED_FIELDS = new Set([
  // identity & type
  "name", "class", "character_type", "is_player", "in_party", "archived_at",
  // progression
  "level", "xp", "xp_to_next",
  // combat block
  "hp_current", "hp_max", "ac", "initiative", "proficiency_bonus",
  "passive_perception", "conditions",
  // ability scores + modifiers
  "str_score", "dex_score", "con_score", "int_score", "wis_score", "cha_score",
  "str_modifier", "dex_modifier", "con_modifier", "int_modifier",
  "wis_modifier", "cha_modifier",
  // reference stat-block fields
  "speed", "senses", "skills", "size", "cr", "languages",
  "damage_resistances", "damage_immunities", "condition_immunities",
  // encumbrance & presentation
  "weight_current", "weight_max", "avatar_image_url", "portrait_image_url",
  "stage_scale", "stage_offset_y",
  // sheet family (same set the sheet editor may touch)
  "sheet_species", "sheet_background", "sheet_alignment", "sheet_player_name",
  "sheet_hit_dice", "sheet_defenses", "sheet_backstory",
  "sheet_allies_organizations", "sheet_additional_notes", "sheet_hp_temp",
  "sheet_passive_insight", "sheet_passive_investigation",
  "sheet_save_proficiencies", "sheet_skill_proficiencies",
  "sheet_proficiencies", "sheet_features", "sheet_attacks", "sheet_currency",
  "sheet_appearance", "sheet_personality", "sheet_spellcasting",
  "sheet_heroic_inspiration",
  // bookkeeping
  "updated_at",
])

function filterPatch(patch: Record<string, unknown>): {
  clean: Record<string, unknown>
  stripped: string[]
} {
  const clean: Record<string, unknown> = {}
  const stripped: string[] = []
  for (const [key, value] of Object.entries(patch)) {
    if (ALLOWED_FIELDS.has(key)) clean[key] = value
    else stripped.push(key)
  }
  return { clean, stripped }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 })
  }

  let body: { action?: string; id?: string; patch?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { action, id } = body
  const patch = body.patch ?? {}

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[dm-characters] admin client unavailable:", e)
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
  }

  const now = new Date().toISOString()

  if (action === "create") {
    const { clean, stripped } = filterPatch(patch)
    if (typeof clean.name !== "string" || !clean.name.trim()) {
      return NextResponse.json({ error: "A name is required" }, { status: 400 })
    }
    if (stripped.length) console.warn("[dm-characters] create stripped fields:", stripped)
    const { data, error } = await admin
      .from("characters")
      .insert(clean)
      .select("id")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data.id, stripped })
  }

  if (!id) {
    return NextResponse.json({ error: "A character id is required" }, { status: 400 })
  }

  if (action === "update") {
    const { clean, stripped } = filterPatch(patch)
    if (Object.keys(clean).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
    }
    if (stripped.length) console.warn("[dm-characters] update stripped fields:", stripped)
    const { error } = await admin
      .from("characters")
      .update({ ...clean, updated_at: now })
      .eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, stripped })
  }

  if (action === "archive") {
    // Soft delete: the row and its inventory/equipment/abilities all survive.
    // Archived characters cannot hold a party seat.
    const { error } = await admin
      .from("characters")
      .update({ archived_at: now, in_party: false, updated_at: now })
      .eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === "restore") {
    const { error } = await admin
      .from("characters")
      .update({ archived_at: null, updated_at: now })
      .eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === "delete") {
    const { error } = await admin.from("characters").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
