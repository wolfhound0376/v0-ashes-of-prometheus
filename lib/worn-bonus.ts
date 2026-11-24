// ============================================================================
// Worn gear that changes the hero, not just their armour class.
//
// Sam, 2026-11-24: the Traveler's Cloak is red and carries a small knack, set
// per cloak by a passive 1d2 — +1 Dexterity or +1 Stealth, while worn. Until
// then the only bonus the game read off worn gear was `stats_bonus.ac`
// (lib/armor-class.ts); a `{"dex": 1}` on a worn row sat in the database and
// did nothing.
//
// ONE ANSWER. Every screen that shows or rolls from a hero's numbers asks this
// file what the hero is "with their gear on":
//
//   withWornGear(character, equipment) → the same row, with
//     • ability SCORES raised by what is worn, and each MODIFIER moved by
//       exactly as much as the score change moves it (17 → 18 is +1 to the
//       modifier; 16 → 17 is nothing — that is the 5e table, not a choice);
//     • initiative and the passive senses moved with their ability;
//     • `worn_skill_bonus` — flat bonuses to named skills ({ stealth: 1 }).
//
// It never writes anything. The database keeps the hero's own scores; the
// bonus exists only while the row is worn, so taking the cloak off needs no
// undo. It is also safe to call twice: a row it has already dressed is
// returned untouched (`worn_applied`), so a caller that passes its result on
// to another caller cannot double the bonus.
//
// KEYS it reads off `equipment_items.stats_bonus`, case-blind:
//   an ability — "dex", "dex_score", "dexterity" (all six)
//   a skill    — "stealth", "sleight_of_hand", "Sleight of Hand" (all eighteen)
// Everything else ("ac", "initiative", "dex_modifier") is left to the code
// that already reads it.
// ============================================================================

export const WORN_ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const
export type WornAbility = (typeof WORN_ABILITIES)[number]

const ABILITY_WORD: Record<string, WornAbility> = {
  strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha",
}

export const WORN_SKILLS = [
  "acrobatics", "animal_handling", "arcana", "athletics", "deception", "history", "insight", "intimidation",
  "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight_of_hand",
  "stealth", "survival",
] as const
export type WornSkill = (typeof WORN_SKILLS)[number]

/** What moves with an ability's modifier besides the modifier itself. */
const FOLLOWS: Partial<Record<WornAbility, string[]>> = {
  dex: ["initiative"],
  wis: ["passive_perception", "sheet_passive_insight"],
  int: ["sheet_passive_investigation"],
}

export interface WornItem {
  name?: string | null
  slot?: string | null
  equipped?: boolean | null
  stats_bonus?: Record<string, unknown> | null
}

export interface WornBonuses {
  abilities: Partial<Record<WornAbility, number>>
  skills: Partial<Record<WornSkill, number>>
  /** Where each point came from, for a roll panel or a tooltip: "Traveler's Cloak" gave dex +1. */
  sources: { kind: "ability" | "skill"; key: string; value: number; from: string }[]
}

const flat = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "")
const SKILL_BY_FLAT = new Map<string, WornSkill>(WORN_SKILLS.map((s) => [flat(s), s]))

function finite(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

function abilityOf(key: string): WornAbility | null {
  const k = key.trim().toLowerCase()
  const bare = k.endsWith("_score") ? k.slice(0, -6) : k
  if ((WORN_ABILITIES as readonly string[]).includes(bare)) return bare as WornAbility
  return ABILITY_WORD[bare] ?? null
}

/** The 5e ability modifier for a score. */
export const abilityModifier = (score: number) => Math.floor((score - 10) / 2)

/** Add up what the worn rows give. A row marked `equipped: false` gives nothing. */
export function wornBonuses(equipment: readonly WornItem[] | null | undefined): WornBonuses {
  const out: WornBonuses = { abilities: {}, skills: {}, sources: [] }
  for (const item of Array.isArray(equipment) ? equipment : []) {
    if (!item || item.equipped === false) continue
    const bonus = item.stats_bonus
    if (!bonus || typeof bonus !== "object") continue
    for (const [key, raw] of Object.entries(bonus)) {
      const value = finite(raw)
      if (!value) continue
      const from = item.name || "worn gear"
      const ability = abilityOf(key)
      if (ability) {
        out.abilities[ability] = (out.abilities[ability] ?? 0) + value
        out.sources.push({ kind: "ability", key: ability, value, from })
        continue
      }
      const skill = SKILL_BY_FLAT.get(flat(key))
      if (skill) {
        out.skills[skill] = (out.skills[skill] ?? 0) + value
        out.sources.push({ kind: "skill", key: skill, value, from })
      }
    }
  }
  return out
}

/** The flat bonus worn gear gives a skill, whatever way the skill is spelled ("Sleight of Hand", "sleight_of_hand"). */
export function wornSkillBonus(row: unknown, skill: string): number {
  const map = (row as { worn_skill_bonus?: unknown } | null | undefined)?.worn_skill_bonus
  if (!map || typeof map !== "object") return 0
  const key = SKILL_BY_FLAT.get(flat(skill))
  return key ? finite((map as Record<string, unknown>)[key]) ?? 0 : 0
}

/** The worn pieces behind a skill's bonus, for a roll panel that names its parts ("Traveler's Cloak +1"). */
export function wornSkillSources(row: unknown, skill: string): { from: string; value: number }[] {
  const list = (row as { worn_sources?: unknown } | null | undefined)?.worn_sources
  const key = SKILL_BY_FLAT.get(flat(skill))
  if (!key || !Array.isArray(list)) return []
  return (list as WornBonuses["sources"]).filter((s) => s.kind === "skill" && s.key === key).map((s) => ({ from: s.from, value: s.value }))
}

/**
 * The hero with their gear on. Returns the SAME object when nothing worn changes them (or when it has already
 * been dressed), otherwise a shallow copy. A score the row does not carry is never guessed: with no score to
 * raise, that ability and everything that follows it is left exactly as stored.
 */
export function withWornGear<T extends object>(character: T, equipment: readonly WornItem[] | null | undefined): T
export function withWornGear<T extends object>(character: T | null | undefined, equipment: readonly WornItem[] | null | undefined): T | null | undefined
export function withWornGear<T extends object>(character: T | null | undefined, equipment: readonly WornItem[] | null | undefined): T | null | undefined {
  if (!character) return character
  const row = character as Record<string, unknown>
  if (row.worn_applied === true) return character
  const bonuses = wornBonuses(equipment)
  if (!bonuses.sources.length) return character

  const next: Record<string, unknown> = { ...row, worn_applied: true, worn_skill_bonus: bonuses.skills, worn_sources: bonuses.sources }
  for (const ability of WORN_ABILITIES) {
    const add = bonuses.abilities[ability]
    if (!add) continue
    const score = finite(row[`${ability}_score`])
    if (score == null) continue
    const moved = abilityModifier(score + add) - abilityModifier(score)
    next[`${ability}_score`] = score + add
    // Move the stored modifier rather than replace it, so a row whose modifier was set by hand keeps its own base.
    next[`${ability}_modifier`] = (finite(row[`${ability}_modifier`]) ?? abilityModifier(score)) + moved
    if (!moved) continue
    for (const field of FOLLOWS[ability] ?? []) {
      const stored = finite(row[field])
      if (stored != null) next[field] = stored + moved
    }
  }
  return next as T
}
