// ============================================================================
// WALK SHEET — a seated character's combat sheet for the painted map, read from
// their own `characters` row.
//
// The map (public/velkynvelve-walk, built from scripts/velkynvelve-walk/
// template.html) was written for the four premade heroes, with their sheets
// snapshotted by hand into the page (SHEETS). A hero made at the Forge after
// that was unknown to it, so the map drew the first premade in their place:
// Alejandro's Gandalf walked the pen as Kenta, with Kenta's stats and spells
// (Sam, 2026-10-23: "My son created a character named gandalf but kenta is the
// pixel art").
//
// /api/map-stage now sends this sheet with every seated character, and the map
// uses it for anyone it does not already know. It is the same shape as the
// page's SHEETS entries and follows the same rules they were written by:
//   - saves are the ability modifier, plus proficiency in the row's
//     sheet_save_proficiencies (a Rogue's Dex and Int). Until 2026-10-27 they
//     were the bare modifiers (Sam: "I don't think I'm getting my class bonuses")
//   - skills are the ones the walk asks for, with the row's proficiencies
//     (proficient +prof, expertise +2×prof); thievesTools is Dex plus prof when
//     sheet_proficiencies.tools lists thieves' tools (doubled for expertise)
//   - the only attack is the Unarmed Strike: the run starts in rags with gear
//     confiscated, and a weapon the hero picks up is added by the page's own
//     refreshAttacks from what they carry (/api/equipment)
//   - magic is the row's sheet_spellcasting; the page keeps only spells it can
//     resolve and leaves the rest to the dashboard
// Nothing is invented: a field the row lacks falls to the neutral value
// (modifier 0, speed 30), never a guess.
// ============================================================================

export type WalkAttack = { name: string; hit: number; dmg: string; type: string; reach: number }

export type WalkSheet = {
  name: string
  cls: string
  level: number
  race: string
  hp: number
  /** hp_current when the row carries one, else null: the inventory's HP chip shows it over the max. */
  hpNow: number | null
  /** The row's XP (what /api/walk-xp pays), null when the row has none: the inventory's level panel reads it. */
  xp: number | null
  ac: number
  init: number
  speed: number
  strScore: number
  /** the ability modifiers themselves — NOT the saves, which carry class save proficiency. Attacks, checks and DCs read these. */
  mods: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
  saves: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
  skills: { sleightOfHand: number; medicine: number; stealth: number; athletics: number; perception: number; investigation: number; thievesTools: number }
  /** the knowledge skills the loot card's checks roll (lib/item-lore.mjs): the bonus and the row's proficiency word */
  lore: Record<LoreSkill, { mod: number; level: "" | "proficient" | "expertise" }>
  /** the tools the loot card's checks roll: Int + proficiency when the row lists the tool, null when it does not */
  tools: Record<LoreTool, number | null>
  attacks: WalkAttack[]
  magic: { dc: number; hit: number; mod: number; slots: Record<string, number>; cantrips: string[]; prepared: string[] } | null
}

export type LoreSkill = "investigation" | "arcana" | "religion" | "nature" | "history"
export type LoreTool = "alchemist" | "poisoner" | "herbalism"

/** The columns walkSheetFromRow reads. Select exactly these. */
export const WALK_SHEET_COLUMNS =
  "id, name, class, level, hp_max, hp_current, xp, ac, initiative, speed, proficiency_bonus, " +
  "str_score, str_modifier, dex_modifier, con_modifier, int_modifier, wis_modifier, cha_modifier, " +
  "sheet_species, sheet_skill_proficiencies, sheet_save_proficiencies, sheet_proficiencies, sheet_attacks, sheet_spellcasting"

type Row = Record<string, unknown>

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : fallback
}
const str = (v: unknown): string => (typeof v === "string" ? v : "")
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [])

/** "30 ft." → 30. Anything unreadable is the 5e default walking speed. */
function speedOf(v: unknown): number {
  const m = String(v ?? "").match(/\d+/)
  return m ? parseInt(m[0], 10) : 30
}

/** "+2" → 2, "-1" → -1, 3 → 3. */
function bonusOf(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  const m = String(v ?? "").match(/[+-]?\d+/)
  return m ? parseInt(m[0], 10) : null
}

/** The skill's bonus from the row's proficiency map ({"Stealth": "proficient"}), keys matched case-blind. */
export function skill(row: Row, label: string, mod: number, prof: number): number {
  const profs = (row.sheet_skill_proficiencies && typeof row.sheet_skill_proficiencies === "object" ? row.sheet_skill_proficiencies : {}) as Record<string, unknown>
  // the rows spell keys three ways: "Stealth", "stealth", "sleight_of_hand"
  const flat = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "")
  const key = Object.keys(profs).find((k) => flat(k) === flat(label))
  const level = key ? String(profs[key]).toLowerCase() : ""
  return mod + (level === "expertise" ? 2 * prof : level === "proficient" ? prof : 0)
}

const ABILS = ["str", "dex", "con", "int", "wis", "cha"] as const
type Abil = (typeof ABILS)[number]

/** The saves: modifier, plus proficiency in each save the row lists ("dex", "Dexterity", "DEX" all read the same). */
export function saves(row: Row, m: Record<Abil, number>, prof: number): WalkSheet["saves"] {
  const listed = new Set(strList(row.sheet_save_proficiencies).map((x) => x.trim().toLowerCase().slice(0, 3)))
  const out = {} as WalkSheet["saves"]
  for (const a of ABILS) out[a] = m[a] + (listed.has(a) ? prof : 0)
  return out
}

/** A skill's bonus with the proficiency word it came from ("" when none). */
export function skillEntry(row: Row, label: string, mod: number, prof: number): { mod: number; level: "" | "proficient" | "expertise" } {
  const b = skill(row, label, mod, prof)
  return { mod: b, level: b === mod + 2 * prof && prof > 0 ? "expertise" : b === mod + prof && prof > 0 ? "proficient" : "" }
}

const LORE_TOOL_NAMES: Record<LoreTool, string> = { alchemist: "alchemistssupplies", poisoner: "poisonerskit", herbalism: "herbalismkit" }

/**
 * The loot card's tools (lib/item-lore.mjs). Intelligence plus proficiency when sheet_proficiencies.tools lists the
 * tool, else null: a tool check is not offered to someone without the tool. Intelligence is Claude's reading of
 * Xanathar's tool notes for working out what a substance is; Sam has not ruled on it.
 */
export function loreTools(row: Row, int: number, prof: number): Record<LoreTool, number | null> {
  const p = (row.sheet_proficiencies && typeof row.sheet_proficiencies === "object" ? row.sheet_proficiencies : {}) as Record<string, unknown>
  const have = new Set(strList(p.tools).map((t) => t.toLowerCase().replace(/[^a-z]/g, "")))
  const out = {} as Record<LoreTool, number | null>
  for (const k of Object.keys(LORE_TOOL_NAMES) as LoreTool[]) out[k] = have.has(LORE_TOOL_NAMES[k]) ? int + prof : null
  return out
}

/** Thieves' tools: Dex, plus proficiency when the row lists the tools (doubled when a skill entry gives it expertise). */
export function thievesTools(row: Row, dex: number, prof: number): number {
  const p = (row.sheet_proficiencies && typeof row.sheet_proficiencies === "object" ? row.sheet_proficiencies : {}) as Record<string, unknown>
  const flat = (x: string) => x.toLowerCase().replace(/[^a-z]/g, "")
  const has = strList(p.tools).some((t) => flat(t) === "thievestools")
  const expert = skill(row, "Thieves Tools", 0, prof) === 2 * prof
  return dex + (expert ? 2 * prof : has ? prof : 0)
}

/** The Unarmed Strike: the row's own line when it has one, else the 5e rule (prof + STR to hit, 1 + STR damage). */
function unarmed(row: Row, strMod: number, prof: number): WalkAttack {
  const lines = Array.isArray(row.sheet_attacks) ? (row.sheet_attacks as Row[]) : []
  const own = lines.find((a) => /unarmed/i.test(str(a?.name)))
  const hit = own ? bonusOf(own.hit) : null
  const dmgNum = own ? bonusOf(String(own.damage ?? "").split(/\s/)[0]) : null
  return {
    name: "Unarmed Strike",
    hit: hit ?? prof + strMod,
    dmg: String(Math.max(1, dmgNum ?? 1 + strMod)),
    type: "bludgeoning",
    reach: 5,
  }
}

function magicOf(row: Row): WalkSheet["magic"] {
  const sc = row.sheet_spellcasting as Row | null | undefined
  if (!sc || typeof sc !== "object") return null
  const cantrips = strList(sc.cantrips)
  const prepared = [...strList(sc.always_prepared), ...strList(sc.prepared)].filter((s, i, all) => all.indexOf(s) === i)
  if (!cantrips.length && !prepared.length) return null
  const slots: Record<string, number> = {}
  const rawSlots = (sc.slots && typeof sc.slots === "object" ? sc.slots : {}) as Record<string, unknown>
  for (const [lvl, v] of Object.entries(rawSlots)) {
    const max = num((v as Row)?.max, NaN)
    if (Number.isFinite(max) && max > 0) slots[lvl] = max
  }
  const ability = str(sc.ability).toLowerCase().slice(0, 3)
  const mod = num(row[`${ability}_modifier`], 0)
  return { dc: num(sc.save_dc, 8 + num(row.proficiency_bonus, 2) + mod), hit: num(sc.attack_bonus, num(row.proficiency_bonus, 2) + mod), mod, slots, cantrips, prepared }
}

/** A seated character's walk sheet. Pure: same row, same sheet. */
export function walkSheetFromRow(row: Row): WalkSheet {
  const prof = num(row.proficiency_bonus, 2)
  const m = {
    str: num(row.str_modifier), dex: num(row.dex_modifier), con: num(row.con_modifier),
    int: num(row.int_modifier), wis: num(row.wis_modifier), cha: num(row.cha_modifier),
  }
  return {
    name: str(row.name) || "Hero",
    cls: str(row.class) || "Adventurer",
    level: Math.max(1, num(row.level, 1)),
    race: str(row.sheet_species).toLowerCase(),
    hp: Math.max(1, num(row.hp_max, 1)),
    hpNow: Number.isFinite(num(row.hp_current, NaN)) ? Math.max(0, num(row.hp_current)) : null,
    xp: Number.isFinite(num(row.xp, NaN)) ? Math.max(0, num(row.xp)) : null,
    ac: num(row.ac, 10),
    init: num(row.initiative, m.dex),
    speed: speedOf(row.speed),
    strScore: num(row.str_score, 10),
    mods: { ...m },
    saves: saves(row, m, prof),
    skills: {
      sleightOfHand: skill(row, "Sleight of Hand", m.dex, prof),
      medicine: skill(row, "Medicine", m.wis, prof),
      stealth: skill(row, "Stealth", m.dex, prof),
      athletics: skill(row, "Athletics", m.str, prof),
      perception: skill(row, "Perception", m.wis, prof),
      investigation: skill(row, "Investigation", m.int, prof),
      thievesTools: thievesTools(row, m.dex, prof),
    },
    lore: {
      investigation: skillEntry(row, "Investigation", m.int, prof),
      arcana: skillEntry(row, "Arcana", m.int, prof),
      religion: skillEntry(row, "Religion", m.int, prof),
      nature: skillEntry(row, "Nature", m.int, prof),
      history: skillEntry(row, "History", m.int, prof),
    },
    tools: loreTools(row, m.int, prof),
    attacks: [unarmed(row, m.str, prof)],
    magic: magicOf(row),
  }
}
