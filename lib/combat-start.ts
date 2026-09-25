// lib/combat-start.ts
//
// The rows /api/combat reads at "start", turned into the shapes
// lib/game-context.ts rolls against. Pure: no database, so the conversion can
// be tested without a board.
//
// The book beats recomputation. A monster's Stealth bonus and passive
// Perception are what its stat block prints ("Stealth +4", "passive
// Perception 12"), the same way the hide handler reads them — recomputing them
// from DEX and WIS would quietly disagree with the page.

import { abilityMod, type Combatant, type Hider, type Observer, type SheetSlice } from "./game-context"

export interface CharacterRow {
  id: string
  name?: string | null
  level?: number | null
  str_score?: number | null
  dex_score?: number | null
  con_score?: number | null
  int_score?: number | null
  wis_score?: number | null
  cha_score?: number | null
  dex_modifier?: number | null
  proficiency_bonus?: number | null
  passive_perception?: number | null
  sheet_skill_proficiencies?: unknown
}

export interface BestiaryRow {
  id: string
  name?: string | null
  str?: number | null
  dex?: number | null
  con?: number | null
  int?: number | null
  wis?: number | null
  cha?: number | null
  skills?: string | null
  senses?: string | null
}

export interface StartToken {
  id: string
  label: string | null
  character_id: string | null
  bestiary_id: string | null
  allegiance: string | null
}

/**
 * Two camps for surprise: the hostiles, and everyone who is not. "party" and
 * "ally" are one side — Shuushar is not hiding from Kenta.
 */
export const campOf = (allegiance: string | null) => (allegiance === "hostile" ? "hostile" : "friendly")

export const sideOf = (allegiance: string | null): Combatant["side"] =>
  allegiance === "hostile" ? "enemy" : allegiance === "ally" ? "ally" : "party"

/**
 * A DEX score for initiative. The sheet's score when it has one; otherwise a
 * score that reproduces the sheet's stored modifier exactly (10 + 2×mod), so a
 * character imported without scores rolls what it rolled before this change.
 */
export function dexScoreOf(ch: CharacterRow | undefined): number {
  if (ch?.dex_score != null) return ch.dex_score
  if (ch?.dex_modifier != null) return 10 + 2 * ch.dex_modifier
  return 10
}

export function sheetFromCharacter(ch: CharacterRow, label: string): SheetSlice {
  const raw = ch.sheet_skill_proficiencies
  return {
    id: ch.id,
    name: label,
    level: ch.level ?? 1,
    str_score: ch.str_score ?? 10,
    dex_score: dexScoreOf(ch),
    con_score: ch.con_score ?? 10,
    int_score: ch.int_score ?? 10,
    wis_score: ch.wis_score ?? 10,
    cha_score: ch.cha_score ?? 10,
    proficiency_bonus: ch.proficiency_bonus,
    passive_perception: ch.passive_perception,
    sheet_skill_proficiencies: raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, string>) : null,
  }
}

/** "Investigation +3, Perception +2, Stealth +4" → 4. Null when the block lists no Stealth. */
export function statBlockStealth(skills: string | null | undefined): number | null {
  const m = /stealth\s*([+-]\s*\d+)/i.exec(String(skills ?? ""))
  return m ? Number(m[1].replace(/\s+/g, "")) : null
}

/** "darkvision 120 ft., passive Perception 12" → 12. */
export function statBlockPassive(senses: string | null | undefined): number | null {
  const m = /passive Perception\s+(\d+)/i.exec(String(senses ?? ""))
  return m ? Number(m[1]) : null
}

/**
 * A stat block as a SheetSlice. When the block prints a Stealth bonus above the
 * DEX modifier, the difference is carried as the proficiency bonus with Stealth
 * marked proficient — so resolveSkillCheck lands on the printed number, and the
 * arithmetic line reads "DEX(+2) + proficient(+2)" rather than inventing a
 * bonus from CR.
 */
export function sheetFromBestiary(b: BestiaryRow | undefined, id: string, label: string): SheetSlice {
  const dex = b?.dex ?? 10
  const printed = statBlockStealth(b?.skills)
  const extra = printed == null ? 0 : printed - abilityMod(dex)
  return {
    id,
    name: label,
    level: 1,
    str_score: b?.str ?? 10,
    dex_score: dex,
    con_score: b?.con ?? 10,
    int_score: b?.int ?? 10,
    wis_score: b?.wis ?? 10,
    cha_score: b?.cha ?? 10,
    proficiency_bonus: extra > 0 ? extra : null,
    passive_perception: statBlockPassive(b?.senses),
    sheet_skill_proficiencies: extra > 0 ? { stealth: "proficient" } : null,
  }
}

/**
 * Who is compared against whom. Each camp's hiders against every creature of
 * the other camp. Returns one pairing per camp that has hiders; a creature can
 * be a hider in one and an observer in the other when both sides are sneaking.
 */
export function surprisePairings(
  tokens: StartToken[],
  hiderIds: Set<string>,
  sheetOf: (t: StartToken) => SheetSlice,
): { hiders: Hider[]; observers: Observer[]; observerIds: string[] }[] {
  const out: { hiders: Hider[]; observers: Observer[]; observerIds: string[] }[] = []
  for (const camp of ["friendly", "hostile"] as const) {
    const hiding = tokens.filter((t) => hiderIds.has(t.id) && campOf(t.allegiance) === camp)
    if (!hiding.length) continue
    const watching = tokens.filter((t) => campOf(t.allegiance) !== camp)
    out.push({
      hiders: hiding.map((t) => ({ sheet: sheetOf(t) })),
      observers: watching.map((t) => ({ sheet: sheetOf(t) })),
      observerIds: watching.map((t) => t.id),
    })
  }
  return out
}
