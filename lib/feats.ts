// ============================================================================
// FEATS — the catalogue the level-up screen offers at an Ability Score Improvement level (4, 8, 12, 16, 19).
//
// Sam, 2026-11-10: "feats pack yes. Go on feats." Rules: SRD 5.2.1 is canon (AGENTS.md §7). In 5.2.1 the class
// feature at those levels is "the Ability Score Improvement feat or another feat of your choice for which you
// qualify" — so an ORIGIN feat (no prerequisite) is a legal pick at level 4, as is a GENERAL feat whose level and
// score prerequisites are met. Fighting Style feats need the Fighting Style feature; Epic Boons need level 19.
//
// What is OPEN: the SRD 5.2.1 feats (Alert, Savage Attacker, Skilled, Grappler, …), described here in our own short
// words. Magic Initiate is SRD but shown closed for now: it needs a spell list, two cantrips and a spell chosen, and
// this screen does not ask for those yet — so it is a real row with the reason on it, never a pick that writes half
// a feat (Sam, 2026-10-30: "make sure options are actual options").
// What is CLOSED: the Player's Handbook 2024 feats. Same rule as the PHB subclasses (lib/level-choices.ts): shown
// locked, "needs the DM", until Sam opens one by flipping `open`. Their one-liners are from memory: `verify`.
//
// A feat lands on sheet_features as {name, desc, source: "Feat · <book> · level N"}: the source names no class, so
// the dashboard's sheet files it under Feats (character-sheet-slideover.tsx featureGroup).
// ============================================================================

export type Ability = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA"
export const ABILITIES: Ability[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"]
export type FeatCategory = "origin" | "general" | "fighting_style" | "epic_boon"

export interface Feat {
  name: string
  category: FeatCategory
  /** "SRD 5.2.1", or "PHB 2024 — not in the SRD" */
  source: string
  /** may a player take it on this screen */
  open: boolean
  /** why an SRD feat is still closed here (Magic Initiate); shown on the tile */
  closedWhy?: string
  desc: string
  /** the scores its +1 may go to; empty = the feat raises nothing */
  abilities: Ability[]
  prereq?: { level?: number; minScore?: { any: Ability[]; min: number }; spellcasting?: boolean; fightingStyle?: boolean }
  repeatable?: boolean
  /** new skill proficiencies the player chooses (Skilled: 3) */
  skills?: number
  /** Alert: Proficiency Bonus added to Initiative — written to the initiative column */
  initiativePb?: boolean
  /** painted slab slug in public/velkynvelve-walk/icons/level (falls back to a glyph disc when it is missing) */
  icon: string
  verify: boolean
}

const SRD = "SRD 5.2.1"
const PHB = "PHB 2024 — not in the SRD"
const ALL = ABILITIES
const MENTAL: Ability[] = ["INT", "WIS", "CHA"]
const L4 = { level: 4 }

export const FEATS: Feat[] = [
  // ---- SRD 5.2.1, Origin (no prerequisite; legal at an ASI level) ----
  { name: "Alert", category: "origin", source: SRD, open: true, abilities: [], icon: "alert", verify: false, initiativePb: true,
    desc: "Add your Proficiency Bonus to Initiative. After rolling Initiative you may swap results with a willing ally in the same fight (not while either of you is Incapacitated)." },
  { name: "Savage Attacker", category: "origin", source: SRD, open: true, abilities: [], icon: "savage-attacker", verify: false,
    desc: "Once per turn when you hit with a weapon, roll its damage dice twice and use either total." },
  { name: "Skilled", category: "origin", source: SRD, open: true, abilities: [], icon: "skilled", verify: false, repeatable: true, skills: 3,
    desc: "Proficiency in three skills of your choice. (The SRD also allows tools; this screen offers skills — ask the DM for a tool.)" },
  { name: "Magic Initiate", category: "origin", source: SRD, open: false, abilities: [], icon: "magic-initiate", verify: false, repeatable: true,
    closedWhy: "Its cantrips and spell are chosen with the DM for now — this screen does not ask for them yet.",
    desc: "Two cantrips and one level 1 spell from the Cleric, Druid or Wizard list; the spell is free once per Long Rest." },
  // ---- SRD 5.2.1, General ----
  { name: "Grappler", category: "general", source: SRD, open: true, abilities: ["STR", "DEX"], icon: "grappler", verify: false,
    prereq: { ...L4, minScore: { any: ["STR", "DEX"], min: 13 } },
    desc: "+1 Strength or Dexterity. Once per turn an Unarmed Strike that hits in your Attack action can both deal damage and grapple; Advantage on attacks against a creature you grapple; moving it costs no extra movement if it is your size or smaller." },
  // ---- SRD 5.2.1, Fighting Style (needs the Fighting Style feature: none of the classes this screen serves have it yet) ----
  { name: "Archery", category: "fighting_style", source: SRD, open: true, abilities: [], icon: "archery", verify: false, prereq: { fightingStyle: true },
    desc: "+2 to attack rolls with Ranged weapons." },
  { name: "Defense", category: "fighting_style", source: SRD, open: true, abilities: [], icon: "defense", verify: false, prereq: { fightingStyle: true },
    desc: "+1 AC while wearing Light, Medium or Heavy armor." },
  { name: "Great Weapon Fighting", category: "fighting_style", source: SRD, open: true, abilities: [], icon: "great-weapon-fighting", verify: false, prereq: { fightingStyle: true },
    desc: "With a Two-Handed or Versatile melee weapon held in two hands, a 1 or 2 on a damage die counts as a 3." },
  { name: "Two-Weapon Fighting", category: "fighting_style", source: SRD, open: true, abilities: [], icon: "two-weapon-fighting", verify: false, prereq: { fightingStyle: true },
    desc: "Add your ability modifier to the damage of the extra attack you make with a Light weapon." },
  // ---- PHB 2024 — closed until the DM opens them; one-liners from memory ----
  { name: "Elemental Adept", category: "general", source: PHB, open: false, abilities: MENTAL, icon: "elemental-adept", verify: true, prereq: { ...L4, spellcasting: true },
    desc: "+1 INT, WIS or CHA. Pick a damage type: your spells ignore Resistance to it, and 1s on its damage dice count as 2s." },
  { name: "Fey-Touched", category: "general", source: PHB, open: false, abilities: MENTAL, icon: "fey-touched", verify: true, prereq: L4,
    desc: "+1 INT, WIS or CHA. Misty Step and one level 1 Divination or Enchantment spell, each free once per Long Rest." },
  { name: "Keen Mind", category: "general", source: PHB, open: false, abilities: ["INT"], icon: "keen-mind", verify: true, prereq: L4,
    desc: "+1 INT. A lore skill proficiency or Expertise, and Study as a Bonus Action." },
  { name: "Resilient", category: "general", source: PHB, open: false, abilities: ALL, icon: "resilient", verify: true, prereq: L4,
    desc: "+1 to a score you choose, and proficiency in that score's saving throws." },
  { name: "Shadow-Touched", category: "general", source: PHB, open: false, abilities: MENTAL, icon: "shadow-touched", verify: true, prereq: L4,
    desc: "+1 INT, WIS or CHA. Invisibility and one level 1 Illusion or Necromancy spell, each free once per Long Rest." },
  { name: "Spell Sniper", category: "general", source: PHB, open: false, abilities: MENTAL, icon: "spell-sniper", verify: true, prereq: { ...L4, spellcasting: true },
    desc: "+1 INT, WIS or CHA. Spell attacks ignore half and three-quarters cover, no Disadvantage in melee range, and long-range spells reach farther." },
  { name: "Telekinetic", category: "general", source: PHB, open: false, abilities: MENTAL, icon: "telekinetic", verify: true, prereq: L4,
    desc: "+1 INT, WIS or CHA. An invisible Mage Hand, and a Bonus Action shove of 5 ft (Strength save)." },
  { name: "War Caster", category: "general", source: PHB, open: false, abilities: MENTAL, icon: "war-caster", verify: true, prereq: { ...L4, spellcasting: true },
    desc: "+1 INT, WIS or CHA. Advantage on Concentration saves, cast with full hands, and a spell as an Opportunity Attack." },
  { name: "Dual Wielder", category: "general", source: PHB, open: false, abilities: ["STR", "DEX"], icon: "dual-wielder", verify: true, prereq: { ...L4, minScore: { any: ["STR", "DEX"], min: 13 } },
    desc: "+1 STR or DEX. The off-hand attack works with non-Light weapons too, and you draw or stow two weapons at once." },
  { name: "Sharpshooter", category: "general", source: PHB, open: false, abilities: ["DEX"], icon: "sharpshooter", verify: true, prereq: { ...L4, minScore: { any: ["DEX"], min: 13 } },
    desc: "+1 DEX. Ranged weapon attacks ignore half and three-quarters cover, no Disadvantage at long range or in melee." },
  { name: "Skulker", category: "general", source: PHB, open: false, abilities: ["DEX"], icon: "skulker", verify: true, prereq: { ...L4, minScore: { any: ["DEX"], min: 13 } },
    desc: "+1 DEX. Blindsight 10 ft, hide when lightly obscured, and a missed attack does not reveal you." },
  { name: "Sentinel", category: "general", source: PHB, open: false, abilities: ["STR", "DEX"], icon: "sentinel", verify: true, prereq: { ...L4, minScore: { any: ["STR", "DEX"], min: 13 } },
    desc: "+1 STR or DEX. Opportunity Attacks stop a creature's movement, even after Disengage, and punish attacks on your allies." },
  { name: "Inspiring Leader", category: "general", source: PHB, open: false, abilities: ["WIS", "CHA"], icon: "inspiring-leader", verify: true, prereq: { ...L4, minScore: { any: ["WIS", "CHA"], min: 13 } },
    desc: "+1 WIS or CHA. After a rest, allies gain Temporary Hit Points equal to your level plus the raised modifier." },
  { name: "Lucky", category: "origin", source: PHB, open: false, abilities: [], icon: "lucky", verify: true,
    desc: "Luck points equal to your Proficiency Bonus: spend one for Advantage, or to give an attacker Disadvantage." },
  { name: "Tough", category: "origin", source: PHB, open: false, abilities: [], icon: "tough", verify: true,
    desc: "Your Hit Point maximum rises by twice your level, and by 2 more each level after." },
  { name: "Healer", category: "origin", source: PHB, open: false, abilities: [], icon: "healer", verify: true,
    desc: "Battle Medic with a Healer's Kit, and reroll 1s on healing dice." },
]

export interface FeatContext {
  level: number
  scores: Partial<Record<Ability, number | null>>
  /** names already on sheet_features (a feat taken once cannot be taken again unless repeatable) */
  featureNames: string[]
  spellcasting: boolean
  fightingStyle: boolean
}

export interface FeatOption {
  name: string; category: FeatCategory; source: string; desc: string; icon: string; verify: boolean
  abilities: Ability[]; skills: number
  /** a player may take it now */
  ok: boolean
  /** shown on a locked tile: why not */
  why: string | null
}

/** Is `name` already on the sheet as a feat? Matches "Lucky" and older "Feat: Lucky" lines alike. */
function onSheet(names: string[], feat: string): boolean {
  const f = feat.toLowerCase()
  return names.some((n) => { const x = String(n).toLowerCase().trim(); return x === f || x === `feat: ${f}` })
}

/** Whether a feat's prerequisite stands for this hero; the reason when it does not. */
export function featBlocked(feat: Feat, ctx: FeatContext): string | null {
  if (!feat.open) return feat.closedWhy ?? "In the Player's Handbook, not the SRD — it opens when the DM says so."
  const p = feat.prereq ?? {}
  if (feat.category === "epic_boon" && ctx.level < 19) return "Epic Boons open at level 19."
  if (p.level && ctx.level < p.level) return `Needs level ${p.level}.`
  if (p.fightingStyle && !ctx.fightingStyle) return "Needs the Fighting Style feature."
  if (p.spellcasting && !ctx.spellcasting) return "Needs the Spellcasting feature."
  if (p.minScore && !p.minScore.any.some((a) => Number(ctx.scores[a] ?? 0) >= p.minScore!.min)) return `Needs ${p.minScore.any.join(" or ")} ${p.minScore.min}+.`
  if (!feat.repeatable && onSheet(ctx.featureNames, feat.name)) return "Already yours."
  if (feat.abilities.length && feat.abilities.every((a) => Number(ctx.scores[a] ?? 0) >= 20)) return "Its +1 has nowhere to go: those scores are 20."
  return null
}

/**
 * The feats a hero is shown at an Ability Score Improvement level: Origin and General always, Fighting Style only with
 * the feature (it is noise otherwise), Epic Boons only at 19. Takeable ones first, then the locked ones.
 */
export function featOptions(ctx: FeatContext): FeatOption[] {
  return FEATS
    .filter((f) => f.category === "origin" || f.category === "general" || (f.category === "fighting_style" && ctx.fightingStyle) || (f.category === "epic_boon" && ctx.level >= 19))
    .map((f) => { const why = featBlocked(f, ctx); return { name: f.name, category: f.category, source: f.source, desc: f.desc, icon: f.icon, verify: f.verify, abilities: f.abilities, skills: f.skills ?? 0, ok: !why, why } })
    .sort((a, b) => Number(b.ok) - Number(a.ok))
}

export const featByName = (name: string | null | undefined): Feat | undefined => FEATS.find((f) => f.name === name)

export const abilityMod = (score: number) => Math.floor((score - 10) / 2)
