// Extraction — preparing a raw ingredient before it can go into a brew.
//
// Sam, 2026-10-01: "We do need an extraction step", and "Yes" to the rule as
// written in the Alchemy Bench brief, "Proposed extraction rule". All of it
// is HOMEBREW; nothing here is SRD beyond an ability check against a DC.
//
//   * One action per ingredient, about 10 minutes, so it fits a short rest.
//   * Intelligence check with alchemist's supplies or an herbalism kit, DC 10
//     (the same tools and the same DC as brewing — one bench, one number).
//   * Success                 → prepared.
//   * Beat the DC by 5 or more → prepared, AND the character learns that
//                               ingredient's SECOND effect. Tasting reveals the
//                               first; careful work teaches the next one.
//   * Miss by less than 5     → prepared but BRUISED: +1 impurity in any brew
//                               it goes into.
//   * Miss by 5 or more, or a natural 1 → ruined and consumed.
//   * The tool decides the method; each ingredient has exactly one.
//
// THE DICE ARE NOT ROLLED HERE. The caller sends the total and the face,
// exactly as /api/alchemy/brew does.

import { BREW_DC } from "@/lib/alchemy-bench"

export const EXTRACT_DC = BREW_DC
export const EXTRACT_MARGIN = 5
export const EXTRACT_MINUTES = 10

export type ExtractionMethod = "grind" | "cut" | "press" | "decant"
export const METHODS: readonly ExtractionMethod[] = ["grind", "cut", "press", "decant"]

/** Bench scenery, not inventory: the bench in the painting has all four. */
export const METHOD_TOOL: Record<ExtractionMethod, string> = {
  grind: "mortar and pestle",
  cut: "knife",
  press: "the bench press",
  decant: "flask and funnel",
}

/** What a prepared row is called in the pack, so a prepared ingredient never
 *  stacks onto a raw one (ground-items stacks by name). */
export const METHOD_SUFFIX: Record<ExtractionMethod, string> = {
  grind: "ground",
  cut: "cut",
  press: "pressed",
  decant: "decanted",
}

/** Which method each ingredient takes. Claude's assignment, recorded in
 *  claude/claude_Alchemy_Extraction.md; mirrored into items.properties.extraction
 *  by migration 20261001100000 so the database and the code agree. Where the
 *  catalogue description already says how it is worked ("ground into a paste",
 *  "squeeze for water", "carved for pulp") that is what decided it. */
export const EXTRACTION_METHOD: Record<string, ExtractionMethod> = {
  // grind
  bluecap: "grind", "fire-lichen": "grind", zurkhwood: "grind", "tainted-spores-pouch": "grind",
  pygmywort: "grind", bigwig: "grind", "nilhoggs-nose": "grind", timmask: "grind",
  "wind-spores": "grind", "cave-cricket-skewer": "grind", "fried-grubs": "grind", "sporebread-loaf": "grind",
  // cut
  barrelstalk: "cut", torchstalk: "cut", trillimac: "cut", "nightlight-fungus": "cut", ripplebark: "cut",
  "tongue-of-madness": "cut", "blind-cave-fish": "cut", "cavern-lizard-meat": "cut", "deep-rothe-jerky": "cut",
  "edible-mushrooms": "cut", glowcap: "cut", bonecap: "cut", tessadyle: "cut",
  // press
  waterorb: "press", "ormu-moss": "press", nimergan: "press",
  // decant
  "deep-rothe-milk": "decant", "carrion-crawler-mucus": "decant", "gray-ooze-residue": "decant",
  "ormu-ink-vial": "decant", "vial-of-rapport-spores": "decant",
}

export function methodOf(slug: string, properties?: unknown): ExtractionMethod | null {
  const fromRow = (properties as { extraction?: unknown } | null)?.extraction
  if (typeof fromRow === "string" && (METHODS as readonly string[]).includes(fromRow)) return fromRow as ExtractionMethod
  return EXTRACTION_METHOD[slug] ?? null
}

export type ExtractOutcome = "prepared" | "bruised" | "ruined"

export interface ExtractInput {
  /** d20 total, already rolled. */
  check: number
  /** The raw face; a 1 ruins it whatever the total. */
  die: number
  /** Columns (1-based) the character already knows of this ingredient. */
  knownColumns: readonly number[]
}

export type ExtractResult =
  | { ok: false; reason: "bad_check" }
  | {
      ok: true
      outcome: ExtractOutcome
      /** 2 when the check beat the DC by 5+ and column 2 was not yet known. */
      learnColumn: number | null
      dc: number
      summary: string
    }

export function extract(input: ExtractInput): ExtractResult {
  const { check, die } = input
  if (!Number.isFinite(check) || !Number.isInteger(die) || die < 1 || die > 20) return { ok: false, reason: "bad_check" }

  if (die === 1 || check <= EXTRACT_DC - EXTRACT_MARGIN) {
    return {
      ok: true, outcome: "ruined", learnColumn: null, dc: EXTRACT_DC,
      summary: die === 1 ? "Natural 1. The knife slips; it is ruined." : `${check} vs DC ${EXTRACT_DC}: ruined in the working.`,
    }
  }
  if (check < EXTRACT_DC) {
    return {
      ok: true, outcome: "bruised", learnColumn: null, dc: EXTRACT_DC,
      summary: `${check} vs DC ${EXTRACT_DC}: prepared, but bruised — any brew it goes into starts a step dirtier.`,
    }
  }
  const careful = check >= EXTRACT_DC + EXTRACT_MARGIN
  const learnColumn = careful && !input.knownColumns.includes(2) ? 2 : null
  return {
    ok: true, outcome: "prepared", learnColumn, dc: EXTRACT_DC,
    summary: careful
      ? `${check} vs DC ${EXTRACT_DC}: cleanly prepared${learnColumn ? ", and the work teaches you something new about it" : ""}.`
      : `${check} vs DC ${EXTRACT_DC}: prepared.`,
  }
}

/** The instance data on a prepared inventory row (inventory_items.prep). */
export interface PrepBlob {
  method: ExtractionMethod
  bruised: boolean
  prepared_by: string
  prepared_at: string
}

export function isPrep(v: unknown): v is PrepBlob {
  const p = v as PrepBlob | null
  return !!p && typeof p === "object" && (METHODS as readonly string[]).includes(p.method) && typeof p.bruised === "boolean"
}

export function preparedName(name: string, method: ExtractionMethod, bruised: boolean): string {
  return `${name} (${METHOD_SUFFIX[method]}${bruised ? ", bruised" : ""})`
}
