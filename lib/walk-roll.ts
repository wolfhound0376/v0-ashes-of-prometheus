// ============================================================================
// WALK ROLLS — checks the painted map asks for, rolled on the dashboard's dice.
//
// Sam, 2026-10-25, looking at the pen gate card: the player should never see a
// "What did it come to? 20 or more / Under 20" window. The card should "have
// you roll for whatever you need ... trigger the dice animation that is
// appropriate from the dashboard UI with the appropriate modifier, and send
// that to the DM." Then: "Use the dashboard UI dice roll animation and math."
//
// So the map (public/velkynvelve-walk, an iframe) no longer rolls and no longer
// asks. It posts a request naming an ACTION from the closed table below; the
// /velkynvelve page answers it with the one dice engine
// (components/dice/dice-provider.tsx) and the dashboard's own modifier math.
//
// Three rules this file holds:
//   1. CLOSED VOCABULARY. The map sends an action key, never free text. Labels,
//      the check and the DC all come from ACTIONS. A page message can therefore
//      never put words into Malachar's prompt or pick its own difficulty.
//   2. THE DASHBOARD'S MATH. A skill is ability modifier + proficiency, doubled
//      for expertise (character-sheet-slideover.tsx skillBonus, which is
//      lib/game-context.ts skillBonus). A tool check is the tool's ability
//      modifier + proficiency when the sheet lists the tool
//      (characters.sheet_proficiencies.tools, matched as lib/repair.ts hasTool).
//   3. THE DC IS THE DM'S. It is resolved here, on the parent page, and goes to
//      Malachar with the verdict. The player's card shows their action, their
//      modifier and their total, never the DC or the book page.
// ============================================================================

import { SKILL_ABILITY, abilityMod, proficiency, skillBonus, type Ability, type SheetSlice, type Skill } from "@/lib/game-context"
import { hasTool } from "@/lib/repair"

export type WalkCheck =
  | { kind: "skill"; skill: Skill; label: string }
  | { kind: "tool"; tool: string; ability: Ability; label: string }

export interface WalkAction {
  /** The roll panel's heading: what the player chose, in their words. */
  title: string
  /** What the player is doing, as the log and Malachar read it. */
  label: string
  check: WalkCheck
  /** Difficulty Class. DM-side only: never shown on the player's card. */
  dc: number
  /** Where the DC comes from, for the DM console and the message to Malachar. */
  source: string
}

const THIEVES_TOOLS: WalkCheck = { kind: "tool", tool: "Thieves' Tools", ability: "dex", label: "Thieves' tools" }
const ATHLETICS: WalkCheck = { kind: "skill", skill: "athletics", label: "Athletics" }
const ACROBATICS: WalkCheck = { kind: "skill", skill: "acrobatics", label: "Acrobatics" }
const PERCEPTION: WalkCheck = { kind: "skill", skill: "perception", label: "Perception" }
const SLEIGHT: WalkCheck = { kind: "skill", skill: "sleight_of_hand", label: "Sleight of Hand" }
const COOKS: WalkCheck = { kind: "tool", tool: "Cook's Utensils", ability: "wis", label: "Cook's utensils" }

/**
 * Every roll the map may ask for. Adding a check to the map means adding a row
 * here — the bridge refuses any key it does not find.
 *
 * Pen gate: OotA ch.1, Velkynvelve area 2 (p.18) — picking or forcing the
 * slave-pen gate is a DC 20 check. Forcing is the Strength (Athletics) reading
 * of "forcing it"; the book does not name the skill.
 */
export const WALK_ACTIONS = {
  "pen-gate:pick": { title: "Pick the lock", label: "Picking the pen gate's lock", check: THIEVES_TOOLS, dc: 20, source: "OotA p.18" },
  "pen-gate:force": { title: "Force the gate", label: "Forcing the pen gate", check: ATHLETICS, dc: 20, source: "OotA p.18" },
  // Hard Labor (OotA Encounters ch.1 p.12; module doc claude/Hard_Labor_Module_2026-10-26.md). The book lists the chores
  // and sets no DCs: every work and look DC below is a house number (Claude's, Sam's call).
  "labor:water": { title: "Haul the barrels", label: "Filling and hauling water barrels on a work detail", check: ATHLETICS, dc: 10, source: "OotA p.12 chore; DC house" },
  "labor:lift": { title: "Turn the winch", label: "Operating the lift on a work detail", check: ATHLETICS, dc: 12, source: "OotA p.12 chore; DC house" },
  "labor:pots": { title: "Carry the pots across", label: "Carrying chamber pots across the bridge on a work detail", check: ACROBATICS, dc: 10, source: "OotA p.12 chore; balance is Acrobatics (SRD); DC house" },
  "labor:kitchen": { title: "Cook for the drow", label: "Preparing food for the drow on a work detail", check: COOKS, dc: 12, source: "OotA p.12 chore; DC house" },
  // Lift Trouble has no work roll here: the cliff plate's own rappels are the work (feat/cliff-rappels, "cliff:rappel").
  "labor:look": { title: "Look around", label: "Taking in the room while working", check: PERCEPTION, dc: 12, source: "DC house" },
  // Pocketing on a detail: OotA p.19 "Acquisitions" — Sleight of Hand against an observer's passive Perception as the
  // base DC (book). The DC is the sharpest eyes in the escort: a drow, passive 12 (SRD); Jorlan, passive 14 (his row).
  // A hero inside an escort's line of sight cannot try at all (the map's rule): those are the "active observers".
  "labor:pocket": { title: "Pocket it", label: "Pocketing something while the drow guard is not looking", check: SLEIGHT, dc: 12, source: "OotA p.19; drow passive Perception 12 (SRD)" },
  "labor:pocket-jorlan": { title: "Pocket it", label: "Pocketing something while Jorlan is not looking", check: SLEIGHT, dc: 14, source: "OotA p.19; Jorlan's passive Perception 14" },
  // Searched on suspicion (Sam: never routinely). Keeping it hidden: Sleight of Hand against the searcher's passive
  // Perception as the DC — the book's p.19 rule turned round [HOUSE].
  "labor:hide": { title: "Keep it hidden", label: "Keeping a pocketed thing hidden while a drow guard searches them", check: SLEIGHT, dc: 12, source: "after OotA p.19; drow passive Perception 12; house" },
  "labor:hide-jorlan": { title: "Keep it hidden", label: "Keeping a pocketed thing hidden while Jorlan searches them", check: SLEIGHT, dc: 14, source: "after OotA p.19; Jorlan's passive Perception 14; house" },
} as const satisfies Record<string, WalkAction>

export type WalkActionKey = keyof typeof WALK_ACTIONS

export function isWalkActionKey(v: unknown): v is WalkActionKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(WALK_ACTIONS, v)
}

/** The columns walkCheckModifier reads. Select exactly these. */
export const WALK_ROLL_COLUMNS =
  "id, name, level, proficiency_bonus, str_score, dex_score, con_score, int_score, wis_score, cha_score, " +
  "sheet_skill_proficiencies, sheet_proficiencies, sheet_heroic_inspiration"

type Row = Record<string, unknown>

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

/** A `characters` row as the game-context maths reads it. A missing score is 10 (modifier 0), never a guess. */
export function sheetSliceFromRow(row: Row): SheetSlice {
  const skills = row.sheet_skill_proficiencies
  return {
    id: String(row.id ?? ""),
    name: typeof row.name === "string" ? row.name : "",
    level: num(row.level, 1),
    str_score: num(row.str_score, 10),
    dex_score: num(row.dex_score, 10),
    con_score: num(row.con_score, 10),
    int_score: num(row.int_score, 10),
    wis_score: num(row.wis_score, 10),
    cha_score: num(row.cha_score, 10),
    proficiency_bonus: row.proficiency_bonus == null ? null : num(row.proficiency_bonus, 2),
    sheet_skill_proficiencies:
      skills && typeof skills === "object" && !Array.isArray(skills) ? (skills as Record<string, string>) : null,
  }
}

export function toolsFromRow(row: Row): string[] {
  const t = (row.sheet_proficiencies as { tools?: unknown } | null | undefined)?.tools
  return Array.isArray(t) ? t.filter((x): x is string => typeof x === "string") : []
}

export interface WalkModifierPart {
  /** "DEX", "Proficiency", "Expertise", "Thieves' tools" — what the roll panel's chips say. */
  label: string
  value: number
}

export interface WalkModifier {
  modifier: number
  /** True when proficiency (or expertise) went into it. */
  proficient: boolean
  /** The modifier, itemised the way the roll panel shows it. Always sums to `modifier`. */
  parts: WalkModifierPart[]
}

const ABBR: Record<Ability, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" }

/** The modifier the dashboard's sheet would use for this check. */
export function walkCheckModifier(row: Row, check: WalkCheck): WalkModifier {
  const sheet = sheetSliceFromRow(row)
  if (check.kind === "skill") {
    const { mod, prof, level } = skillBonus(sheet, check.skill)
    const parts: WalkModifierPart[] = [{ label: ABBR[SKILL_ABILITY[check.skill]], value: mod }]
    if (prof) parts.push({ label: level === "expertise" ? "Expertise" : level === "proficient" ? "Proficiency" : "Jack of all trades", value: prof })
    return { modifier: mod + prof, proficient: level !== "none", parts }
  }
  const mod = abilityMod(sheet[`${check.ability}_score` as const])
  const has = hasTool(toolsFromRow(row), check.tool)
  const prof = has ? proficiency(sheet) : 0
  const parts: WalkModifierPart[] = [{ label: ABBR[check.ability], value: mod }]
  if (prof) parts.push({ label: check.label, value: prof })
  return { modifier: mod + prof, proficient: has, parts }
}

/**
 * The DC as a word, never a number: the player sees how hard it is, not the DC
 * (Sam's ruling). The words are the DMG's Typical Difficulty Classes:
 * very easy 5, easy 10, medium 15, hard 20, very hard 25, nearly impossible 30.
 */
export function difficultyWord(dc: number): string {
  if (dc <= 5) return "Very easy"
  if (dc <= 10) return "Easy"
  if (dc <= 15) return "Medium"
  if (dc <= 20) return "Hard"
  if (dc <= 25) return "Very hard"
  return "Nearly impossible"
}

/** What goes on the dice and in the log: "Pick the lock — Thieves' tools". */
export function rollLabel(action: WalkAction): string {
  return action.check.label
}

/**
 * SRD 5.1, Ability Checks: total ≥ DC succeeds. A natural 20 or 1 is not an
 * automatic success or failure on a check.
 */
export function walkVerdict(action: WalkAction, total: number): boolean {
  return total >= action.dc
}

/**
 * The line Malachar receives. He gets the verdict so his narration matches
 * what the map does next (the gate opens or it does not), and he is told the
 * same thing every dashboard roll tells him: never say the numbers.
 */
export function walkRollMessage(who: string, action: WalkAction, rollText: string, success: boolean): string {
  return (
    `[Dice Roll] ${who} — ${action.label} (${action.check.label}). ${rollText}. ` +
    `Against DC ${action.dc} (${action.source}) this ${success ? "SUCCEEDS" : "FAILS"}, and the map has already shown it. ` +
    `Narrate that outcome only - never say the roll, the total, the DC or the AC; do not re-roll.`
  )
}

// --- the message contract between the map and the page ----------------------

/** Map → page. */
export interface WalkRollRequest {
  type: "aop:roll"
  id: string
  action: WalkActionKey
  /** The map's guess at who is acting (its leader's character row). Used only when this browser holds no seat. */
  characterId?: string | null
}

/** Page → map: "I have it, the roll panel is open." After this the map waits as long as the player does. */
export interface WalkRollAck {
  type: "aop:roll-ack"
  id: string
}

/** Page → map. `cancelled` is the player stepping back from the roll panel: no roll, nothing to say. */
export interface WalkRollReply {
  type: "aop:roll-result"
  id: string
  ok: boolean
  success?: boolean
  total?: number
  natural?: number
  cancelled?: boolean
  error?: string
}

/** Shape-check a postMessage payload. Anything else is ignored. */
export function parseWalkRollRequest(data: unknown): WalkRollRequest | null {
  if (!data || typeof data !== "object") return null
  const d = data as Record<string, unknown>
  if (d.type !== "aop:roll") return null
  if (typeof d.id !== "string" || d.id.length === 0 || d.id.length > 64) return null
  if (!isWalkActionKey(d.action)) return null
  const characterId = typeof d.characterId === "string" && d.characterId.length <= 64 ? d.characterId : null
  return { type: "aop:roll", id: d.id, action: d.action, characterId }
}
