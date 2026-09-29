// lib/component-harvest.ts — which creatures in THIS campaign supply which
// spell components (Layer 1, pure).
//
// Sam, 2026-09-29: join the creature-sourced components to the bestiary.
//
// lib/spell-component-data.ts knows that 64 spells want something off a
// creature. It does not know that this campaign is in the Underdark, where
// there are no birds — so Fly, Feather Fall, Identify and Fear cannot be
// supplied here at all, however many wizards want them. That gap IS the
// answer to "what is worth harvesting", and it is only visible once the
// components are matched against the actual bestiary.
//
// HOW THIS AVOIDS INVENTING ANYTHING
//
// The table below is a curated reading of each component's own text, and every
// row carries the `phrase` it was read from. A test asserts that phrase occurs
// verbatim in that spell's component text, so a row cannot drift away from the
// book: change the mapping without changing the wording and the suite fails.
//
// The bestiary is NOT baked in. Rows are passed to the matcher by the caller,
// so this tracks the live table rather than a snapshot — the bestiary was 80
// rows three days ago and is 129 now.
//
// What it will not do: name a creature the bestiary does not have. If nothing
// matches, the answer is "nothing here supplies this", never a substitute.

import { componentTextFor } from "./alchemy-ingredients"
import { SPELL_COMPONENTS, type SpellComponent } from "./spell-component-data"

/** A kind of creature, as the component text asks for it. */
export type CreatureKind =
  | "beast" | "bird" | "bat" | "spider" | "snake" | "insect"
  | "humanoid" | "dragon" | "cattle" | "fleece" | "corporeal"

export type HarvestSource =
  /** The text names one creature. `match` is tested against the row's name. */
  | { kind: "named"; name: string; match: RegExp }
  /** Any creature of this kind will do. */
  | { kind: "any-of"; creature: CreatureKind }
  /** Supplied by the caster or the target, not by a monster. */
  | { kind: "self-or-target"; note: string }

export interface HarvestRow {
  spell: string
  /** Verbatim slice of the component text this reading rests on. */
  phrase: string
  /** Everything the component needs off a creature. All are required. */
  sources: HarvestSource[]
}

const named = (name: string, match: RegExp): HarvestSource => ({ kind: "named", name, match })
const anyOf = (creature: CreatureKind): HarvestSource => ({ kind: "any-of", creature })
const own = (note: string): HarvestSource => ({ kind: "self-or-target", note })

/**
 * Curated: each spell, the phrase it was read from, and what that phrase asks
 * for. Heroes' Feast is absent on purpose — see the note in the generator.
 */
export const HARVEST_TABLE: HarvestRow[] = [
  { spell: "Aganazzar's Scorcher", phrase: "a red dragon’s scale", sources: [named("red dragon", /red dragon/i)] },
  { spell: "Animate Dead", phrase: "a drop of blood, a piece of flesh, and a pinch of bone dust", sources: [anyOf("corporeal")] },
  { spell: "Antipathy/Sympathy", phrase: "a drop of honey", sources: [named("bee", /\bbee\b|honeybee/i)] },
  { spell: "Arcane Eye", phrase: "a bit of bat fur", sources: [anyOf("bat")] },
  { spell: "Augury", phrase: "bones", sources: [anyOf("corporeal")] },
  { spell: "Bane", phrase: "a drop of blood", sources: [anyOf("corporeal")] },
  { spell: "Beast Bond", phrase: "a bit of fur", sources: [anyOf("beast")] },
  { spell: "Bigby's Hand", phrase: "an eggshell and a snakeskin glove", sources: [anyOf("bird"), anyOf("snake")] },
  { spell: "Chain Lightning", phrase: "a bit of fur", sources: [anyOf("beast")] },
  { spell: "Clairvoyance", phrase: "a jeweled horn", sources: [anyOf("beast")] },
  { spell: "Clone", phrase: "1 cubic inch of flesh of the creature that is to be cloned", sources: [own("the creature being cloned")] },
  { spell: "Conjure Lesser Demon (UA)", phrase: "blood from an intelligent humanoid", sources: [anyOf("humanoid")] },
  { spell: "Conjure Shadow Demon (UA)", phrase: "blood from an intelligent humanoid", sources: [anyOf("humanoid")] },
  { spell: "Create Undead", phrase: "grave dirt", sources: [anyOf("humanoid")] },
  { spell: "Dancing Lights", phrase: "a glowworm", sources: [named("glowworm", /glow-?worm/i)] },
  { spell: "Dark Star", phrase: "a drop of the caster's blood", sources: [own("the caster's own blood")] },
  { spell: "Darkness", phrase: "bat fur", sources: [anyOf("bat")] },
  { spell: "Delayed Blast Fireball", phrase: "bat guano", sources: [anyOf("bat")] },
  { spell: "Enhance Ability", phrase: "fur or a feather from a beast", sources: [anyOf("beast")] },
  { spell: "Fear", phrase: "a white feather or the heart of a hen", sources: [anyOf("bird")] },
  { spell: "Feather Fall", phrase: "a small feather or piece of down", sources: [anyOf("bird")] },
  { spell: "Find the Path", phrase: "bones, ivory sticks, cards, teeth", sources: [anyOf("corporeal")] },
  { spell: "Fireball", phrase: "bat guano", sources: [anyOf("bat")] },
  { spell: "Fizban's Platinum Shield (UA)", phrase: "a platinum-plated dragon scale", sources: [anyOf("dragon")] },
  { spell: "Flaming Sphere", phrase: "a bit of tallow", sources: [anyOf("beast")] },
  { spell: "Fly", phrase: "a wing feather from any bird", sources: [anyOf("bird")] },
  { spell: "Foresight", phrase: "a hummingbird feather", sources: [named("hummingbird", /hummingbird/i)] },
  { spell: "Gentle Repose", phrase: "the corpse’s eyes", sources: [anyOf("corporeal")] },
  { spell: "Guards and Wards", phrase: "umber hulk blood", sources: [named("umber hulk", /umber hulk/i)] },
  { spell: "Identify", phrase: "an owl feather", sources: [named("owl", /\bowl\b/i)] },
  { spell: "Imprisonment", phrase: "a vellum depiction", sources: [anyOf("cattle")] },
  { spell: "Insect Plague", phrase: "a smear of fat", sources: [anyOf("beast")] },
  { spell: "Jump", phrase: "a grasshopper’s hind leg", sources: [named("grasshopper", /grasshopper/i)] },
  { spell: "Lightning Bolt", phrase: "a bit of fur", sources: [anyOf("beast")] },
  { spell: "Locate Animals or Plants", phrase: "a bit of fur from a bloodhound", sources: [named("bloodhound", /bloodhound|\bhound\b|\bdog\b/i)] },
  { spell: "Locate Creature", phrase: "a bit of fur from a bloodhound", sources: [named("bloodhound", /bloodhound|\bhound\b|\bdog\b/i)] },
  { spell: "Magic Mouth", phrase: "a small bit of honeycomb", sources: [named("bee", /\bbee\b|honeybee/i)] },
  { spell: "Major Image", phrase: "a bit of fleece", sources: [anyOf("fleece")] },
  { spell: "Mass Polymorph", phrase: "a caterpillar cocoon", sources: [anyOf("insect")] },
  { spell: "Mass Suggestion", phrase: "a snake’s tongue", sources: [anyOf("snake")] },
  { spell: "Minor Illusion", phrase: "A bit of fleece", sources: [anyOf("fleece")] },
  { spell: "Mordenkainen's Faithful Hound", phrase: "a piece of bone", sources: [anyOf("corporeal")] },
  { spell: "Negative Energy Flood", phrase: "a broken bone", sources: [anyOf("corporeal")] },
  { spell: "Nystul's Magic Aura", phrase: "a small square of silk", sources: [anyOf("insect")] },
  { spell: "Phantasmal Force", phrase: "a bit of fleece", sources: [anyOf("fleece")] },
  { spell: "Polymorph", phrase: "a caterpillar cocoon", sources: [anyOf("insect")] },
  { spell: "Programmed Illusion", phrase: "a bit of fleece", sources: [anyOf("fleece")] },
  { spell: "Rary's Telepathic Bond", phrase: "pieces of eggshell from two different kinds of creatures", sources: [anyOf("bird")] },
  { spell: "Silent Image", phrase: "a bit of fleece", sources: [anyOf("fleece")] },
  { spell: "Simulacrum", phrase: "some hair, fingernail clippings, or other piece of that creature’s body", sources: [own("the creature being duplicated")] },
  { spell: "Sleep", phrase: "a cricket", sources: [anyOf("insect")] },
  { spell: "Spider Climb", phrase: "a spider", sources: [anyOf("spider")] },
  { spell: "Stinking Cloud", phrase: "a rotten egg", sources: [anyOf("bird")] },
  { spell: "Suggestion", phrase: "a snake’s tongue", sources: [anyOf("snake")] },
  { spell: "Summon Beast", phrase: "a feather, tuft of fur, and fish tail", sources: [anyOf("bird"), anyOf("beast")] },
  { spell: "Summon Fiend", phrase: "humanoid blood", sources: [anyOf("humanoid")] },
  { spell: "Summon Greater Demon", phrase: "blood from a humanoid killed within the past 24 hours", sources: [anyOf("humanoid")] },
  { spell: "Summon Lesser Demons", phrase: "blood from a humanoid killed within the past 24 hours", sources: [anyOf("humanoid")] },
  { spell: "Summon Undead", phrase: "a gilded skull", sources: [anyOf("corporeal")] },
  { spell: "Tasha's Hideous Laughter", phrase: "a feather that is waved in the air", sources: [anyOf("bird")] },
  { spell: "Tenser's Transformation", phrase: "a few hairs from a bull", sources: [anyOf("cattle")] },
  { spell: "True Seeing", phrase: "mushroom powder, saffron, and fat", sources: [anyOf("beast")] },
  { spell: "Web", phrase: "a bit of spiderweb", sources: [anyOf("spider")] },
  { spell: "Wind Wall", phrase: "a feather of exotic origin", sources: [anyOf("bird")] },
]

/** The minimum a bestiary row has to carry to be matched. */
export interface BestiaryRow {
  slug: string
  name: string
  creature_type?: string | null
  habitat?: string[] | null
}

/**
 * How a kind of creature is recognised in a bestiary row. Name patterns rather
 * than a hardcoded slug list, so a row added tomorrow matches without an edit.
 * `steeder` counts as a spider: it is the drow's giant spider mount.
 */
const NOT_CORPOREAL = /plant|ooze|elemental|construct|conjuration/i

const KIND_TEST: Record<CreatureKind, (r: BestiaryRow) => boolean> = {
  /**
   * Blood, flesh and bone. NOT "any row in the table" — a shrieker is a fungus
   * and an ooze is a puddle; neither can supply Animate Dead's drop of blood or
   * Augury's bones. A test caught this: the first pass let a shrieker feed eight
   * spells. Undead stay in, because a corpse is exactly what those spells want.
   */
  corporeal: (r) => !NOT_CORPOREAL.test(r.creature_type ?? ""),
  beast: (r) => /\bbeast\b/i.test(r.creature_type ?? ""),
  bird: (r) => /\bbird|raven|crow|owl|eagle|hawk|vulture|hummingbird|cockatrice|hen\b/i.test(r.name),
  bat: (r) => /\bbats?\b/i.test(r.name),
  spider: (r) => /spider|steeder|ettercap|drider/i.test(r.name),
  snake: (r) => /\bsnakes?\b|serpent|\bnaga\b|viper/i.test(r.name),
  insect: (r) => /beetle|cricket|grasshopper|moth|caterpillar|\bbee\b|wasp|ant\b/i.test(r.name),
  humanoid: (r) => /\bhumanoid\b/i.test(r.creature_type ?? ""),
  dragon: (r) => /\bdragon\b/i.test(r.creature_type ?? ""),
  cattle: (r) => /roth[ée]|\bbull\b|\box\b|\bcow\b|cattle|auroch/i.test(r.name),
  /**
   * Fleece. Sam ruled 2026-09-29 that the deep rothé's coat counts: there are
   * no sheep in the Underdark, and five illusion spells would otherwise be
   * permanently unsupplied down here. A homebrew reading — 5e says nothing
   * about shearing a rothé — and it is deliberately its own kind rather than
   * folded into `cattle`, so the ruling is visible and reversible.
   */
  fleece: (r) => /\bsheep\b|\bram\b|\blamb\b|roth[eé]/i.test(r.name),
}

function matchesSource(src: HarvestSource, r: BestiaryRow): boolean {
  if (src.kind === "self-or-target") return false
  if (src.kind === "named") return src.match.test(r.name)
  return KIND_TEST[src.creature](r)
}

export interface SourceSupply {
  source: HarvestSource
  /** Bestiary rows that satisfy this source. Empty means nothing here does. */
  suppliers: BestiaryRow[]
  /** A short description of what the source asks for. */
  wants: string
}

export interface SpellSupply {
  spell: string
  phrase: string
  /** The component clause, verbatim. */
  text: string | null
  bySource: SourceSupply[]
  /** Every source has at least one supplier, or is supplied by the caster/target. */
  satisfiable: boolean
}

function describe(src: HarvestSource): string {
  if (src.kind === "named") return src.name
  if (src.kind === "self-or-target") return src.note
  if (src.creature === "corporeal") return "any creature with flesh and bone"
  if (src.creature === "fleece") return "a fleece-bearing creature"
  return `any ${src.creature}`
}

/** What this bestiary can supply for one spell. */
export function supplyFor(spell: string, rows: BestiaryRow[]): SpellSupply | null {
  const row = HARVEST_TABLE.find((h) => h.spell.toLowerCase() === spell.trim().toLowerCase())
  if (!row) return null
  const bySource = row.sources.map((source) => ({
    source,
    wants: describe(source),
    suppliers: source.kind === "self-or-target" ? [] : rows.filter((r) => matchesSource(source, r)),
  }))
  const satisfiable = bySource.every(
    (s) => s.source.kind === "self-or-target" || s.suppliers.length > 0,
  )
  return { spell: row.spell, phrase: row.phrase, text: componentTextFor(row.spell), bySource, satisfiable }
}

export interface HarvestReport {
  /** Spells this bestiary can fully supply. */
  supplied: SpellSupply[]
  /** Spells it cannot — the gap, which is the useful half. */
  unsupplied: SpellSupply[]
  /** Creature slug to the spells it feeds, for "what is this corpse worth?". */
  byCreature: Record<string, string[]>
  summary: string
}

/**
 * The whole join. Pass the live bestiary; `includeUA` is off by default for the
 * same reason as elsewhere — three of these spells are Unearthed Arcana.
 */
export function harvestReport(rows: BestiaryRow[], includeUA = false): HarvestReport {
  const supplies = HARVEST_TABLE
    .filter((h) => includeUA || !h.spell.includes("(UA)"))
    .map((h) => supplyFor(h.spell, rows))
    .filter((s): s is SpellSupply => s !== null)

  const byCreature: Record<string, string[]> = {}
  for (const s of supplies) {
    for (const bs of s.bySource) {
      for (const r of bs.suppliers) {
        ;(byCreature[r.slug] ??= []).push(s.spell)
      }
    }
  }
  for (const k of Object.keys(byCreature)) byCreature[k] = [...new Set(byCreature[k])].sort()

  const supplied = supplies.filter((s) => s.satisfiable)
  const unsupplied = supplies.filter((s) => !s.satisfiable)
  const missing = [
    ...new Set(
      unsupplied.flatMap((s) => s.bySource.filter((b) => b.suppliers.length === 0 && b.source.kind !== "self-or-target").map((b) => b.wants)),
    ),
  ].sort()

  return {
    supplied,
    unsupplied,
    byCreature,
    summary:
      `${supplied.length} of ${supplies.length} creature-sourced spells can be supplied from this bestiary. ` +
      (unsupplied.length
        ? `${unsupplied.length} cannot, for want of: ${missing.join(", ")}.`
        : "Nothing is missing."),
  }
}

/** What is one creature's corpse worth, in spells? */
export function spellsFedBy(slug: string, rows: BestiaryRow[], includeUA = false): string[] {
  return harvestReport(rows, includeUA).byCreature[slug] ?? []
}

/** Every spell in the table, with its component row. */
export function harvestableSpells(): SpellComponent[] {
  const names = new Set(HARVEST_TABLE.map((h) => h.spell))
  return SPELL_COMPONENTS.filter((c) => names.has(c.spell))
}
