// The sectioned journal — the book as a second character sheet.
//
// Design of record: docs/claude_Journal_Sections.md (2026-09-29). Read it
// first; this file is the rules in that document and nothing the document does
// not say. It sits on top of lib/journal.ts (merged, PRs #578 + #582), which
// owns the tag, custody, disclosure and the page itself.
//
// Pure, like lib/journal and lib/camp. No Supabase, no React.
//
// WHAT CHANGED, AND WHY IT IS A SEPARATE FILE
//
// In the merged module a page was inert text. Sam's rulings of 2026-09-29 make
// entries mechanically real: a recipe you wrote down is a recipe you can brew,
// an autopsy is a weakness you can exploit, a bard's lore is a story with a
// price. That turns the journal into a thing worth stealing for what it DOES.
// The custody and disclosure rules already merged were built to guard private
// thoughts; they now guard capabilities, unchanged and much heavier.
//
// SOURCES:
//   Sam, 2026-09-29  The fourteen sections; the consent window ("a small
//                    window asking if you want to journal this"); quests filing
//                    automatically; maps transcribed before sleep; recipes
//                    unlocking "ONLY for you"; bard-only lore with resale
//                    value; autopsy gated on medicine skill; forgery needing a
//                    new author; NPCs acting on a journal they read.
//   Alchemy spec     claude/claude_Alchemy_Minigame.md — per-character
//                    knowledge (character_known_effects / _runes), the
//                    arcane-not-divine rune gate, sabotaged recipes.
//   AGENTS.md §8     NPC canon is keyed by NAME, not id (the Jimjar rule).
//
// Every number Sam did not give is flagged at runtime. Where a rule is missing
// the function returns a flag, never a guess.

import type { JournalVisibility } from "./journal"

// ============================================================================
// §1 THE SECTIONS
// ============================================================================

export const JOURNAL_SECTIONS = [
  "pages",
  "alchemy",
  "poisoner",
  "spirits",
  "recipes",
  "arcane",
  "maps",
  "clues",
  "quests",
  "songs",
  "lore",
  "witness",
  "autopsy",
] as const

export type JournalSection = (typeof JOURNAL_SECTIONS)[number]

/** The plain page. Everything that is not routed lands here. */
export const DEFAULT_SECTION: JournalSection = "pages"

export const SECTION_LABEL: Record<JournalSection, string> = {
  pages: "Pages",
  alchemy: "Alchemy",
  poisoner: "Poisoner",
  spirits: "Spirits",
  recipes: "Recipes",
  arcane: "Arcane",
  maps: "Maps",
  clues: "Clues",
  quests: "Quests",
  songs: "Songs & Ballads",
  lore: "Lore",
  witness: "Witness",
  autopsy: "Autopsy",
}

export function isJournalSection(v: unknown): v is JournalSection {
  return typeof v === "string" && (JOURNAL_SECTIONS as readonly string[]).includes(v)
}

/**
 * Sections whose entries are structured records rather than diary prose, so
 * the 600-character page limit does not apply to them. A transcribed recipe is
 * not a diary entry. OPEN QUESTION — Sam has not ruled (doc §11.2).
 */
export const STRUCTURED_SECTIONS: ReadonlySet<JournalSection> = new Set<JournalSection>([
  "alchemy",
  "poisoner",
  "spirits",
  "recipes",
  "arcane",
  "maps",
  "clues",
  "quests",
  "songs",
  "autopsy",
])

/** Whether the diary page limit applies to this section. */
export function limitApplies(section: JournalSection): boolean {
  return !STRUCTURED_SECTIONS.has(section)
}

// ============================================================================
// §2 ROUTING — the system decides the section, never Malachar
// ============================================================================
//
// Sam: "the information, which is tagged by the system, is automatically
// journaled and categorized appropriately." So routing reads a structured
// discovery, not prose. This is also what keeps the standing rule intact: the
// page is written from tagged data, so the AI invents no game data.

/** What was discovered. The shapes the game already produces, or will. */
export type DiscoveryKind =
  | "herb_effect"
  | "recipe"
  | "sigil"
  | "map"
  | "clue"
  | "quest"
  | "song"
  | "lore"
  | "witness"
  | "autopsy"

/**
 * An herb's effect decides which of the three benches it belongs to. Sam named
 * exactly these three destinations — "Alchemy" or "Poisoner" or "Spirits" as
 * appropriate — and they line up with the three alchemy tools already in
 * lib/alchemy.ts (Alchemist's Supplies / Poisoner's Kit / Herbalism Kit).
 */
export type EffectClass = "potion" | "poison" | "drink"

const EFFECT_SECTION: Record<EffectClass, JournalSection> = {
  potion: "alchemy",
  poison: "poisoner",
  drink: "spirits",
}

export interface Discovery {
  kind: DiscoveryKind
  /** For herb_effect only: which bench the effect belongs to. */
  effectClass?: EffectClass | null
}

/**
 * The section a discovery files into. Returns null when an herb effect arrives
 * with no class — that is missing data, and filing it under a guessed bench
 * would teach the player the wrong thing about their own ingredient.
 */
export function sectionFor(d: Discovery): JournalSection | null {
  switch (d.kind) {
    case "herb_effect":
      return d.effectClass ? EFFECT_SECTION[d.effectClass] ?? null : null
    case "recipe":
      return "recipes"
    case "sigil":
      return "arcane"
    case "map":
      return "maps"
    case "clue":
      return "clues"
    case "quest":
      return "quests"
    case "song":
      return "songs"
    case "lore":
      return "lore"
    case "witness":
      return "witness"
    case "autopsy":
      return "autopsy"
    default:
      return null
  }
}

// ============================================================================
// §3 THE CONSENT WINDOW — "a small window asking if you want to journal this"
// ============================================================================
//
// A discovery does not write a page. It raises an OFFER, and the offer is what
// the player accepts or dismisses. A player away from the keyboard loses
// nothing, a character who declines to record something has made a real choice,
// and the book stays theirs.

export type OfferWindow = "immediate" | "before_sleep"
export type OfferState = "pending" | "accepted" | "declined" | "expired"

/**
 * Maps are the one Sam timed differently: "Maps brought back from foraging (at
 * the end) / exploring / hunting can be transcribed before going to sleep." So
 * a map offer is raised at camp and dies when the long rest resolves — which
 * makes transcribing something you do INSTEAD of something else at the fire.
 */
const SLEEP_WINDOW: ReadonlySet<JournalSection> = new Set<JournalSection>(["maps"])

export function windowFor(section: JournalSection): OfferWindow {
  return SLEEP_WINDOW.has(section) ? "before_sleep" : "immediate"
}

/**
 * Sections that file with no prompt at all. Sam: "Quests accepted
 * automatically get journaled into the Quest section." Accepting the quest was
 * the consent; asking again is a second door on the same room.
 */
export const AUTO_FILED: ReadonlySet<JournalSection> = new Set<JournalSection>(["quests"])

export function needsConsent(section: JournalSection): boolean {
  return !AUTO_FILED.has(section)
}

export interface JournalOffer {
  characterId: string
  section: JournalSection
  window: OfferWindow
  body: string
  title: string | null
  tags: Record<string, unknown> | null
  state: OfferState
}

export interface OfferOutcome {
  offer: JournalOffer | null
  /** True when the entry is written immediately with no prompt (quests). */
  autoFiled: boolean
  flags: string[]
  note: string
}

/**
 * Turn a discovery into an offer, or into an immediate filing.
 *
 * Refusals never raise a half-offer: an ungated section with no body, or an
 * herb effect with no class, produces nothing and says why.
 */
export function offerFor(input: {
  characterId: string
  discovery: Discovery
  body: string
  title?: string | null
  tags?: Record<string, unknown> | null
  /** The sheet, for the gated sections. Omit to skip gating. */
  sheet?: GateSheet
}): OfferOutcome {
  const body = (input.body ?? "").trim()
  const section = sectionFor(input.discovery)
  if (!section) {
    return {
      offer: null,
      autoFiled: false,
      flags: [],
      note:
        input.discovery.kind === "herb_effect"
          ? "herb effect arrived with no bench class — nothing filed, because a guessed bench teaches the wrong thing"
          : `no section for discovery "${input.discovery.kind}"`,
    }
  }
  if (!body) return { offer: null, autoFiled: false, flags: [], note: `${SECTION_LABEL[section]}: nothing to write` }

  const flags: string[] = []
  if (input.sheet) {
    const gate = checkGate(section, input.sheet)
    if (!gate.allowed) {
      return { offer: null, autoFiled: false, flags: gate.flags, note: gate.note }
    }
    flags.push(...gate.flags)
  }

  const offer: JournalOffer = {
    characterId: input.characterId,
    section,
    window: windowFor(section),
    body,
    title: input.title ?? null,
    tags: input.tags ?? null,
    state: needsConsent(section) ? "pending" : "accepted",
  }

  return {
    offer,
    autoFiled: !needsConsent(section),
    flags,
    note: needsConsent(section)
      ? `offered to ${SECTION_LABEL[section]} (${offer.window.replace("_", " ")})`
      : `filed straight to ${SECTION_LABEL[section]} — accepting the quest was the consent`,
  }
}

/** A `before_sleep` offer dies when the rest resolves; an `immediate` one does not survive the scene. */
export function expireOffers(offers: readonly JournalOffer[], event: "long_rest" | "scene_end"): JournalOffer[] {
  return offers.map((o) => {
    if (o.state !== "pending") return o
    const dies = event === "long_rest" ? o.window === "before_sleep" : o.window === "immediate"
    return dies ? { ...o, state: "expired" as OfferState } : o
  })
}

// ============================================================================
// §4 GATES
// ============================================================================

/** The slice of a character sheet the gates read. */
export interface GateSheet {
  /** Free text today; `characters.class` is not structured (project memory). */
  class?: string | null
  /** Skill proficiencies, lowercased keys. */
  skills?: Record<string, unknown> | null
  /** Tool proficiencies by name, e.g. ["Lute", "Thieves' Tools"]. */
  tools?: readonly string[] | null
  /** True when the character casts ARCANE spells. Divine is not arcane. */
  arcaneCaster?: boolean
}

export interface GateResult {
  allowed: boolean
  /** Some gates downgrade rather than refuse — songs, below. */
  degraded: boolean
  flags: string[]
  note: string
}

const ok = (note: string, flags: string[] = [], degraded = false): GateResult => ({ allowed: true, degraded, flags, note })
const no = (note: string, flags: string[] = []): GateResult => ({ allowed: false, degraded: false, flags, note })

function isBard(sheet: GateSheet): boolean {
  return /\bbard\b/i.test(sheet.class ?? "")
}

/** Musical-instrument proficiency, read against the camp module's instrument list. */
export const MUSICAL_INSTRUMENTS = [
  "bagpipes", "drum", "dulcimer", "flute", "lute", "lyre", "horn",
  "pan flute", "shawm", "viol",
] as const

export function hasInstrument(sheet: GateSheet): boolean {
  const tools = (sheet.tools ?? []).map((t) => String(t).trim().toLowerCase())
  return tools.some((t) => (MUSICAL_INSTRUMENTS as readonly string[]).some((i) => t.includes(i)))
}

export function hasSkill(sheet: GateSheet, skill: string): boolean {
  const skills = sheet.skills ?? {}
  for (const [k, v] of Object.entries(skills)) {
    if (k.trim().toLowerCase().replace(/[\s_-]+/g, "") !== skill.toLowerCase().replace(/[\s_-]+/g, "")) continue
    if (v === true) return true
    if (typeof v === "string") return v.toLowerCase() !== "none"
    if (typeof v === "number") return v > 0
    return Boolean(v)
  }
  return false
}

/**
 * Whether this character may file into this section.
 *
 * Songs are the one gate that DOWNGRADES rather than refuses — Sam: "can be
 * transcribed if you have musical proficiency or added into your journal (if
 * you do not)". So the page is always written; without an instrument it is a
 * plainer note that unlocks no performance.
 */
export function checkGate(section: JournalSection, sheet: GateSheet): GateResult {
  switch (section) {
    case "lore":
      return isBard(sheet)
        ? ok("a bard's lore")
        : no("Lore is a bard's section — the story is still worth telling, but it does not go here.")
    case "songs":
      return hasInstrument(sheet)
        ? ok("transcribed in full")
        : ok("noted down rather than transcribed — no instrument proficiency, so it unlocks no performance", [], true)
    case "autopsy":
      return hasSkill(sheet, "medicine")
        ? ok("medicine will carry it")
        : no("Autopsy needs proficiency in Medicine. Cutting without it learns nothing and ruins the corpse.")
    case "arcane":
      return sheet.arcaneCaster || hasSkill(sheet, "arcana")
        ? ok("the marks can be read")
        : no("Arcane needs arcane spellcasting or Arcana proficiency. Divine is not arcane.")
    default:
      return ok("no gate")
  }
}

// ============================================================================
// §5 AUTOPSY
// ============================================================================
//
// Sam gave the gate ("only to be performed with adequate medicine skill"), the
// purpose ("divine information from a foe, regarding their weaknesses"), and
// on 2026-09-29 the maths: DC 10 + CR, approved as proposed.
//
// The hard rule, which was never homebrew: a weakness must already exist on
// the bestiary row. The check REVEALS; it never invents. A creature with
// nothing left to reveal says so, and the corpse is spent.

/** DC 10 + CR, floor 10. Sam's ruling, 2026-09-29. */
export const AUTOPSY_DC_BASE = 10

export function autopsyDc(cr: number | null | undefined): number {
  const c = Number(cr)
  if (!Number.isFinite(c) || c <= 0) return AUTOPSY_DC_BASE
  return Math.max(AUTOPSY_DC_BASE, AUTOPSY_DC_BASE + Math.ceil(c))
}

export interface AutopsyOutcome {
  ok: boolean
  /** Details revealed, copied from the bestiary row. Never invented. */
  revealed: string[]
  dc: number
  flags: string[]
  note: string
}

/**
 * One autopsy. `available` is what the bestiary row still has to give and
 * `known` is what this character already wrote down — so a second cut on the
 * same kind of creature cannot re-sell knowledge they have.
 *
 * Beating the DC by 5+ reveals two. HOUSE RULE, flagged.
 */
export function autopsy(input: {
  sheet: GateSheet
  creature: string
  cr: number | null | undefined
  /** Damage vulnerabilities, resistances, condition immunities, traits — from the row. */
  available: readonly string[]
  known?: readonly string[]
  /** The player's own committed total. The module never rolls for them. */
  total: number
}): AutopsyOutcome {
  const dc = autopsyDc(input.cr)
  const flags: string[] = []

  const gate = checkGate("autopsy", input.sheet)
  if (!gate.allowed) return { ok: false, revealed: [], dc, flags, note: gate.note }

  const known = new Set((input.known ?? []).map((k) => k.trim().toLowerCase()))
  const left = input.available.filter((a) => a && !known.has(a.trim().toLowerCase()))
  if (!left.length) {
    return { ok: false, revealed: [], dc, flags, note: `${input.creature} has nothing left to tell them.` }
  }
  if (input.total < dc) {
    return { ok: false, revealed: [], dc, flags, note: `The cut goes wrong. ${input.creature} keeps its secret, and the corpse is spent.` }
  }
  const count = input.total >= dc + 5 ? 2 : 1
  const revealed = left.slice(0, count)
  return {
    ok: true,
    revealed,
    dc,
    flags,
    note: `${input.creature}: ${revealed.join("; ")}`,
  }
}

// ============================================================================
// §6 WHAT AN ENTRY UNLOCKS, AND FOR WHOM
// ============================================================================
//
// Sam: "If you have the recipe then when doing alchemy the recipes are
// unlocked ONLY for you." That is the alchemy spec's per-character knowledge
// rule, and the journal is the third table in that family — the one the player
// can actually see.
//
// The page and the unlock are written together or not at all. A page you can
// read but cannot use, and an unlock with no page explaining it, are both bugs;
// the second is worse, because it is knowledge with no provenance.

export type UnlockKind = "effect" | "recipe" | "rune" | "weakness"

const SECTION_UNLOCK: Partial<Record<JournalSection, UnlockKind>> = {
  alchemy: "effect",
  poisoner: "effect",
  spirits: "effect",
  recipes: "recipe",
  arcane: "rune",
  autopsy: "weakness",
}

/** What filing into this section grants its writer, if anything. */
export function unlockFor(section: JournalSection): UnlockKind | null {
  return SECTION_UNLOCK[section] ?? null
}

export interface ShareOutcome {
  /** Does the reader gain the unlock? */
  learns: boolean
  unlock: UnlockKind | null
  flags: string[]
  note: string
}

/**
 * What a reader gets from a page that is not theirs.
 *
 * THE GATE IS CHECKED AT READING, NOT AT WRITING. You can transcribe a rune you
 * cannot inscribe: the page is a record, the unlock is a permission, and they
 * are not the same thing. So Fifi showing Kenta a rune page teaches Kenta
 * nothing — he is not a caster — while the page is still perfectly legible
 * to him.
 *
 * A `private` page grants nothing: nobody has read it.
 */
export function shareWith(input: {
  section: JournalSection
  visibility: JournalVisibility
  reader: GateSheet
}): ShareOutcome {
  const unlock = unlockFor(input.section)
  if (input.visibility === "private") {
    return { learns: false, unlock, flags: [], note: "nobody has read this page" }
  }
  if (!unlock) {
    return { learns: false, unlock: null, flags: [], note: `${SECTION_LABEL[input.section]} carries no unlock — it is worth reading, not learning` }
  }
  const gate = checkGate(input.section, input.reader)
  if (!gate.allowed) {
    return { learns: false, unlock, flags: gate.flags, note: `They can read it, but not use it — ${gate.note}` }
  }
  return {
    learns: true,
    unlock,
    flags: gate.flags,
    note:
      input.visibility === "found"
        ? `taken and used: they gain the ${unlock}`
        : `shown deliberately: they gain the ${unlock}`,
  }
}

/**
 * What an NPC who read the book now knows.
 *
 * Keyed by NAME, never id — AGENTS.md §8, the Jimjar rule: NPC canon is keyed
 * by name across every row, and knowledge is canon.
 *
 * NOT WIRED: `npc_knowledge` does not exist yet (design doc §9). This returns
 * the rows that WOULD be written and flags that nothing persists, rather than
 * pretending to a table that is not there.
 */
export interface NpcLearned {
  npc_name: string
  kind: UnlockKind | "journal_page"
  payload: Record<string, unknown>
}

export function npcReads(input: {
  npcName: string
  pages: readonly { section: JournalSection; body: string; tags?: Record<string, unknown> | null }[]
}): { learned: NpcLearned[]; flags: string[] } {
  const learned: NpcLearned[] = input.pages.map((p) => ({
    npc_name: input.npcName,
    kind: unlockFor(p.section) ?? "journal_page",
    payload: { section: p.section, body: p.body, ...(p.tags ?? {}) },
  }))
  return {
    learned,
    flags: learned.length ? ["npc_knowledge table does not exist yet — nothing persists (design doc §9)"] : [],
  }
}

// ============================================================================
// §7 BARD LORE — tier 1 only
// ============================================================================
//
// Sam: lore "can be used to tell other people for entertainment or write a
// book eventually that can be sold. Maybe even give you fame like Volo."
//
// Three tiers. Only the first is built here, because it needs nothing new: the
// camp module already reads a Performance check as a band (flat / warm /
// moving), so a lore page in hand simply shifts the band. Tier 2 (compile a
// manuscript) reuses compileJournal. Tier 3 (renown) touches the six
// relationship dimensions and belongs in its own document, not a paragraph.

export type PerformanceBand = "flat" | "warm" | "moving"

/** HOUSE RULE — needs Sam's yes. A told story is worth one band, never two. */
export const LORE_BAND_LIFT = 1

const BANDS: PerformanceBand[] = ["flat", "warm", "moving"]

/**
 * A lore page behind a performance lifts it one band, once. Without a page the
 * band is whatever the dice said.
 */
export function tellFromLore(band: PerformanceBand, hasLorePage: boolean): { band: PerformanceBand; flags: string[]; note: string } {
  if (!hasLorePage) return { band, flags: [], note: "told from memory" }
  const i = Math.min(BANDS.length - 1, BANDS.indexOf(band) + LORE_BAND_LIFT)
  const lifted = BANDS[i]
  return {
    band: lifted,
    flags: ["a lore page lifting the performance band is homebrew and needs Sam's yes"],
    note: lifted === band ? "already as good as it gets" : `the written story carries it: ${band} → ${lifted}`,
  }
}
