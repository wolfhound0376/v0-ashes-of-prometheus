// SAVED GAMES — several saved campaigns on a shelf, one played at a time.
//
// Sam, 2026-11-10: "several saved games, one played at a time for right now. Host should be able to select from
// a variety of saved games with NPC dialogues and battle logs, game states, etc unique to that save." His rulings
// the same evening ("1. Yes. 2. Yes. 3. Yes."):
//   1. New Game keeps the old world on the shelf instead of destroying it.
//   2. A hero's level, HP and gear belong to the save; their art and voice are shared by every save.
//   3. Each save has its own host and party.
//
// The work is in the database (migrations/20261110230000_campaign_saves.sql): campaign_save() copies the state of
// the world in play into a save, campaign_load() puts a save into play in one transaction. This file holds the
// rules the routes need and the table lists the migration uses, so a test can keep the two in step and catch a
// new table nobody classified. Design of record: project doc claude/Saved_Games_Design_2026-11-10.md.
//
// Pure: no Supabase, no window.

/** State tables saved whole, parents first. MUST equal campaign_save_whole_tables() in the migration. */
export const WHOLE_TABLES = [
  "sessions", "game_clock", "time_log", "world_flags",
  "party_position", "party_situation", "party_vessels", "party_supplies",
  "subnodal_party_position", "subnodal_visibility", "travel_march", "travel_arrivals",
  "walk_world", "walk_events", "work_details",
  "dialogue", "session_beats", "session_telemetry", "story_dialogue", "cinematic_views",
  "journal_entries", "journal_offers",
  "character_known_recipes", "character_known_runes", "character_known_effects", "character_known_weaknesses",
  "inventory_items", "item_events", "equipment_items", "vtt_ground_items", "combat_state",
  "roll_requests", "roll_attempts", "skill_progress",
  "relationship_events", "character_relationships", "npc_knowledge",
  "character_faith", "faith_events", "prayers", "rest_events", "crafting_projects", "magical_resources",
] as const

/** Tables where a save keeps only the state columns, because the row also carries art, voice or canon. */
export const MIXED_TABLES = ["characters", "npc_encounters", "vtt_tokens", "travel_nodes", "vtt_maps", "environments", "campaign_runs"] as const

/** A hero's state columns. MUST equal campaign_save_character_columns() in the migration. */
export const CHARACTER_STATE_COLUMNS = [
  "level", "xp", "xp_to_next", "proficiency_bonus",
  "hp_max", "hp_current", "sheet_hp_temp", "sheet_hit_dice", "hit_dice_remaining",
  "str_score", "str_modifier", "dex_score", "dex_modifier", "con_score", "con_modifier",
  "int_score", "int_modifier", "wis_score", "wis_modifier", "cha_score", "cha_modifier",
  "ac", "initiative", "passive_perception", "sheet_passive_insight", "sheet_passive_investigation",
  "skills", "languages", "speed",
  "sheet_save_proficiencies", "sheet_skill_proficiencies", "sheet_proficiencies",
  "sheet_features", "sheet_attacks", "sheet_spellcasting", "sheet_currency",
  "conditions", "sheet_heroic_inspiration", "death_saves", "exhaustion", "inebriation",
  "rest_actions_remaining", "unfed_rest_streak", "weight_current", "in_party", "run_id",
] as const

/**
 * The library: shared by every save, never rolled back. A table the code uses must be in one of the three lists
 * (the test says which file to fix); deciding where a new table belongs is a design call, not a default.
 */
export const LIBRARY_TABLES = [
  // the game itself
  "items", "bestiary", "deities", "abilities", "alchemy_effects", "creature_harvest", "encounter_tables", "encounter_table_rows",
  "travel_edges", "travel_node_events", "subnodal_maps", "subnodal_nodes", "map_props", "map_prop_placements",
  "cinematic_clips", "media_manifest", "dashboard_assets", "lich_animations", "lich_personality", "skill_progress_rules",
  // who people are (ruling 2: art, voice, claims are shared)
  "character_secrets", "character_baselines", "forge_submissions",
  // kept on purpose by every reset (see lib/restart-campaign.ts)
  "dialogue_archive", "dm_phrasebook", "cinematic_requests",
  // the shelf itself
  "campaign_saves",
  // read-only views and helpers
  "item_catalog_lookup", "travel_nodes_player", "camp_docs", "environment_inventory",
] as const

export type SaveRow = {
  id: string
  name: string
  saved_at: string
  created_at: string
  session_no: number | null
  place: string | null
  host: { id?: string; name?: string } | null
  party: string[]
  is_loaded: boolean
}

export type SaveWho = { dm: boolean; dmCookie: boolean; host: boolean }

/**
 * Who may do what with the shelf. The host loads and renames without a code (Sam: the host runs the table); the
 * DM code may do everything; deleting a save needs the DM door's own cookie, because it cannot be undone.
 */
export function saveActionAllowed(action: string, who: SaveWho): true | string {
  if (action === "delete") return who.dmCookie ? true : "Deleting a save needs the Dungeon Master's code. Come in through Host a Game."
  if (action === "load" || action === "rename" || action === "list") return who.dm || who.host ? true : "Only the host can choose the saved game."
  return "unknown action"
}

/** Loading swaps the whole world, so the table must be dark. */
export function cannotLoad(tableStatus: string | null | undefined, save: Pick<SaveRow, "is_loaded"> | null): string | null {
  if (!save) return "There is no save by that name."
  if (tableStatus === "lobby" || tableStatus === "live") return "End the session and close the table before loading a save."
  return null
}

/** A tidy name for a save. */
export function cleanSaveName(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const s = raw.replace(/\s+/g, " ").trim().slice(0, 60)
  return s || null
}

/** The name a new game's save gets when nobody names it: "Out of the Abyss — Nov 10". */
export function newSaveName(now = new Date()): string {
  const d = now.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" })
  return `Out of the Abyss — ${d}`
}

/**
 * Is this error "the saves migration has not been applied"? Then New Game and End carry on exactly as they did
 * before saves existed, instead of failing. Any OTHER error from a save is real and is reported.
 */
export function isSavesMissing(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  if (err.code === "PGRST202" || err.code === "42883" || err.code === "42P01") return true
  return /campaign_save|campaign_load/.test(err.message ?? "") && /(does not exist|could not find)/i.test(err.message ?? "")
}
