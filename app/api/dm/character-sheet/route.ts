import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"

// /api/dm/character-sheet — DM-only override for a seated character's sheet.
//
//   POST json: { id, reason, patch: { ...fields } }
//
// Once start_campaign() runs, every seated player character is locked by the
// enforce_character_lock trigger: 28 build fields (class, level, ability
// scores, proficiency, hp_max, features, spellcasting, seat, run) can no longer
// be written. HP, XP and conditions stay open so Malachar can still hurt people.
//
// This route is the sanctioned way through that lock. It calls the functions
// that were built for it and never touched locked_at directly:
//
//   dm_unlock_character(id, reason)  snapshots the row into characters_history
//   ...apply the patch...            trigger permits it while unlocked
//   dm_relock_character(id)          snapshots again, restores the lock
//
// The reason is mandatory because dm_unlock_character rejects a blank one, and
// because a sheet edit with no recorded justification is exactly the thing the
// audit trail exists to prevent. The original lock state is restored either
// way: a sheet that was unlocked before the edit stays unlocked after it.

export const dynamic = "force-dynamic"

function authorized(request: NextRequest): boolean {
  const dmCode = process.env.DM_ACCESS_CODE
  // Fail closed: if no DM access code is configured, nobody is a DM.
  if (!dmCode) return false
  const supplied = normalizeCode(request.headers.get("x-dm-key"))
  return !!supplied && safeEquals(supplied, normalizeCode(dmCode))
}

// Everything a DM may write. Deliberately explicit: an allowlist means a typo
// or a hostile payload cannot reach a column nobody meant to expose.
const TEXT_FIELDS = [
  "name", "class", "speed", "senses", "skills", "size", "languages",
  "damage_resistances", "damage_immunities", "condition_immunities",
  "sheet_species", "sheet_background", "sheet_alignment", "sheet_player_name",
  "sheet_hit_dice", "sheet_defenses", "sheet_backstory",
  "sheet_allies_organizations", "sheet_additional_notes", "cr",
] as const

const INT_FIELDS = [
  "level", "xp", "xp_to_next", "hp_current", "hp_max", "ac", "initiative",
  "proficiency_bonus", "passive_perception", "sheet_hp_temp",
  "sheet_passive_insight", "sheet_passive_investigation",
  "str_score", "dex_score", "con_score", "int_score", "wis_score", "cha_score",
  "str_modifier", "dex_modifier", "con_modifier", "int_modifier",
  "wis_modifier", "cha_modifier",
] as const

const NUMERIC_FIELDS = ["weight_current", "weight_max", "stage_scale", "stage_offset_y"] as const

const JSON_FIELDS = [
  "conditions", "sheet_save_proficiencies", "sheet_skill_proficiencies",
  "sheet_proficiencies", "sheet_features", "sheet_attacks", "sheet_currency",
  "sheet_appearance", "sheet_personality", "sheet_spellcasting",
] as const

const BOOL_FIELDS = ["sheet_heroic_inspiration", "in_party"] as const

// Never writable here. id/created_at are identity; locked_at belongs to the
// lock functions; seat_id and run_id move a character between seats or runs,
// which is a different operation with different consequences than editing a
// sheet, and doing it by accident mid-session would be ugly to unpick.
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[dm-sheet] admin client unavailable:", e)
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === "string" ? body.id.trim() : ""
  const reason = typeof body?.reason === "string" ? body.reason.trim() : ""
  const patchIn = body?.patch && typeof body.patch === "object" ? body.patch : null

  if (!id) return NextResponse.json({ error: "Character id is required" }, { status: 400 })
  if (!reason) return NextResponse.json({ error: "A reason is required — it is written to the audit trail" }, { status: 400 })
  if (!patchIn) return NextResponse.json({ error: "Nothing to change" }, { status: 400 })

  // Build the patch from the allowlist only.
  const patch: Record<string, unknown> = {}
  const rejected: string[] = []

  for (const key of Object.keys(patchIn)) {
    const v = (patchIn as Record<string, unknown>)[key]
    if ((TEXT_FIELDS as readonly string[]).includes(key)) {
      patch[key] = v === null ? null : String(v)
    } else if ((INT_FIELDS as readonly string[]).includes(key)) {
      if (v === null) { patch[key] = null; continue }
      const n = Number(v)
      if (!Number.isFinite(n)) { rejected.push(`${key} (not a number)`); continue }
      patch[key] = Math.trunc(n)
    } else if ((NUMERIC_FIELDS as readonly string[]).includes(key)) {
      if (v === null) { patch[key] = null; continue }
      const n = Number(v)
      if (!Number.isFinite(n)) { rejected.push(`${key} (not a number)`); continue }
      patch[key] = n
    } else if ((JSON_FIELDS as readonly string[]).includes(key)) {
      patch[key] = v ?? null
    } else if ((BOOL_FIELDS as readonly string[]).includes(key)) {
      patch[key] = !!v
    } else {
      rejected.push(key)
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No writable fields in the patch", rejected },
      { status: 400 },
    )
  }

  // Keep ability modifiers in step with scores. 5e defines the modifier as
  // floor((score - 10) / 2), so a score change with a stale modifier is always
  // a bug — silently letting the two disagree is how sheets rot. An explicitly
  // supplied modifier still wins, for homebrew that needs it.
  const derived: string[] = []
  for (const a of ABILITIES) {
    const scoreKey = `${a}_score`
    const modKey = `${a}_modifier`
    if (scoreKey in patch && !(modKey in patch)) {
      const score = patch[scoreKey]
      if (typeof score === "number") {
        patch[modKey] = abilityModifier(score)
        derived.push(modKey)
      }
    }
  }

  // What was the sheet before, and was it locked?
  const { data: before, error: readErr } = await admin
    .from("characters")
    .select("id, name, is_player, locked_at")
    .eq("id", id)
    .single()

  if (readErr || !before) {
    return NextResponse.json({ error: "No such character" }, { status: 404 })
  }
  if (!before.is_player) {
    return NextResponse.json(
      { error: "This override is for player characters. NPCs are not locked and can be edited directly." },
      { status: 400 },
    )
  }

  const wasLocked = !!before.locked_at

  if (wasLocked) {
    const { error } = await admin.rpc("dm_unlock_character", { p_character_id: id, p_reason: reason })
    if (error) {
      console.error("[dm-sheet] unlock failed:", error.message)
      return NextResponse.json({ error: `Could not unlock the sheet: ${error.message}` }, { status: 500 })
    }
  }

  const { data: after, error: updErr } = await admin
    .from("characters")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single()

  // Always restore the previous lock state, even if the update failed —
  // otherwise a bad patch leaves the sheet open for the rest of the session.
  let relockError: string | null = null
  if (wasLocked) {
    const { error } = await admin.rpc("dm_relock_character", { p_character_id: id })
    if (error) {
      relockError = error.message
      console.error("[dm-sheet] RELOCK FAILED — sheet left unlocked:", error.message)
    }
  }

  if (updErr) {
    console.error("[dm-sheet] update failed:", updErr.message)
    return NextResponse.json(
      { error: updErr.message, relocked: wasLocked && !relockError, relockError },
      { status: 500 },
    )
  }

  return NextResponse.json({
    character: after,
    changed: Object.keys(patch),
    derived,
    rejected,
    wasLocked,
    relocked: wasLocked && !relockError,
    relockError,
    reason,
  })
}
