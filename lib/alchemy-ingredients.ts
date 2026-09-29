// lib/alchemy-ingredients.ts — ingredient RECOGNITION for the alchemy module
// (Layer 1, pure). Companion to lib/alchemy.ts, which does the brewing.
//
// Sam, 2026-09-29: "Add this to our alchemy module as a list of DND official
// ingredients, just in case we stumble upon an ingredient someone happen to
// bring from the surface or is selling."
//
// That is a different job from brewing. lib/alchemy.ts answers "can Fifi make
// this?" — it only deals in recipes and catalog slugs the party already holds.
// This file answers the question a trader creates: a drow merchant slides a
// twist of grey powder across the table and calls it diamond dust. Is that a
// real thing? What is it worth? What wants it? Without this, Malachar has to
// improvise, and improvised reagents are exactly the "AI invents items" failure
// the inventory layer exists to prevent.
//
// TWO SOURCES, AND THE DIFFERENCE BETWEEN THEM MATTERS
//
//   lib/spell-component-data.ts      GENERATED from lib/data/spells.json. All
//     292 material components in the game, in the book's own words. This is
//     owned data and it is verified; when it says Continual Flame consumes
//     50 gp of ruby dust, that is the spell's text, not a recollection.
//
//   lib/ingredient-registry-data.ts  GENERATED from Sam's compiled list at
//     claude/alchemy_ingredient_list_2026-09-29.md. 347 named ingredients,
//     mostly creature parts for magic-item crafting. The list marks rows ✓ or
//     ~, but NOTHING IN THIS REPO CAN CONFIRM A ✓ except where the row is also
//     a spell component. Every such row is therefore labelled `unverified` —
//     meaning "not checkable here", not "wrong".
//
// So `identify()` always reports a verdict alongside the answer, and the verdict
// is the part the DM should read. A `verified` ingredient can be priced and
// consumed by the rules. An `unverified` one is a prop until Sam confirms it
// against his books, and the engine says so rather than quietly promoting it.
//
// Nothing here invents an ingredient, a price or a use.

import { SPELL_COMPONENTS, SUBSTANCE_SPELLS, type SpellComponent } from "./spell-component-data"
import { REGISTERED_INGREDIENTS, type RegisteredIngredient } from "./ingredient-registry-data"

export type { RegisteredIngredient, SpellComponent }

/** How far the engine can vouch for a name a trader used. */
export type IngredientVerdict =
  /** A 5E spell's own component text names it. Real, priced by the book. */
  | "verified"
  /** Sam's list claims a WotC book; this repo cannot confirm it. DM's call. */
  | "unverified"
  /** The list marks it community content. Homebrew unless Sam adopts it. */
  | "homebrew"
  /** No list knows this name. Almost certainly not a D&D ingredient. */
  | "unknown"

export interface Identification {
  /** What was asked about, as given. */
  query: string
  /** Canonical name of the best match, null when nothing matched. */
  name: string | null
  /**
   * The substance term that verified this, exactly as the spell index spells
   * it. Only set when the verdict is "verified"; `spellsNeeding` takes it.
   */
  substance: string | null
  /** Registry key of the match, when the match came from the registry. */
  slug: string | null
  verdict: IngredientVerdict
  /** Price in gp where a book names one. Never estimated. */
  gp: number | null
  /** Spells whose material component text names this, by spell name. */
  usedBySpells: string[]
  /** Of those, the ones that destroy it in the casting. */
  consumedBySpells: string[]
  /** What the registry says it is for, when the match came from there. */
  usedFor: string | null
  /** The catalog slug, when this is already an items row the party can hold. */
  catalogSlug: string | null
  /** The book Sam's list claims, unedited. */
  claimedSource: string | null
  /** One line the DM can act on. */
  note: string
  /** Other plausible matches, best first. */
  alternatives: string[]
}

/**
 * Ingredient slugs confirmed present in the live `items` catalog on 2026-09-29.
 * A snapshot, deliberately dated: pass the live slug set to `identify()` when
 * the caller has one (the craft-menu route does) and this is ignored.
 */
export const CATALOG_SLUGS: readonly string[] = [
  "acid-vial",
  "antitoxin",
  "basilisk-phlegm",
  "carrion-crawler-mucus",
  "giant-spider-silk",
  "holy-water",
  "hook-horror-claw",
  "lamp-oil",
  "roper-digestive-juices",
  "spider-venom-gland",
  "tongue-of-madness",
]

/** Words a trader wraps an ingredient in that carry no meaning for matching. */
const FILLER = new Set([
  "a", "an", "the", "of", "some", "one", "two", "few", "bit", "bits", "piece",
  "pieces", "pinch", "pinches", "drop", "drops", "vial", "vials", "flask",
  "flasks", "handful", "sprinkle", "sprinkling", "worth", "at", "least", "gp",
  "sp", "cp", "and", "or", "with", "in", "from", "fresh", "dried", "small",
  "tiny", "large", "quality", "fine",
])

const normalise = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const singular = (w: string): string =>
  w.endsWith("ies") && w.length > 4 ? `${w.slice(0, -3)}y`
    : w.endsWith("ses") || w.endsWith("xes") ? w.slice(0, -2)
    : w.endsWith("s") && !w.endsWith("ss") && w.length > 3 ? w.slice(0, -1)
    : w

/** Meaningful words, singularised. "a pinch of diamond dust" -> ["diamond","dust"]. */
export function keyWords(s: string): string[] {
  return normalise(s)
    .split(" ")
    .filter((w) => w && !FILLER.has(w))
    .map(singular)
    .filter(Boolean)
}

const keyOf = (s: string): string => keyWords(s).join(" ")

// ---------------------------------------------------------------------------
// Lookups over the generated data

const bySlug = new Map<string, RegisteredIngredient>()
const byKey = new Map<string, RegisteredIngredient>()
for (const ing of REGISTERED_INGREDIENTS) {
  bySlug.set(ing.slug, ing)
  const k = keyOf(ing.name)
  if (k && !byKey.has(k)) byKey.set(k, ing)
}

const substanceKeys = new Map<string, string>()
for (const term of Object.keys(SUBSTANCE_SPELLS)) {
  const k = keyOf(term)
  if (k && !substanceKeys.has(k)) substanceKeys.set(k, term)
}

const spellByName = new Map<string, SpellComponent>()
for (const c of SPELL_COMPONENTS) spellByName.set(c.spell.toLowerCase(), c)

/** The registry row for a slug, or null. */
export function ingredientBySlug(slug: string): RegisteredIngredient | null {
  return bySlug.get(slug) ?? null
}

/** The material component clause for a spell, verbatim, or null if it has none. */
export function componentTextFor(spellName: string): string | null {
  return spellByName.get(spellName.trim().toLowerCase())?.text ?? null
}

/** Spells whose component text names this substance. Empty when none do. */
export function spellsNeeding(substance: string): SpellComponent[] {
  const term = substanceKeys.get(keyOf(substance))
  if (!term) return []
  const names = new Set(SUBSTANCE_SPELLS[term] ?? [])
  return SPELL_COMPONENTS.filter((c) => names.has(c.spell))
}

/** Free-text search over both lists. Best matches first. */
export function searchIngredients(query: string, limit = 10): RegisteredIngredient[] {
  const words = keyWords(query)
  if (!words.length) return []
  const scored: { ing: RegisteredIngredient; score: number }[] = []
  for (const ing of REGISTERED_INGREDIENTS) {
    const hay = keyWords(`${ing.name} ${ing.usedFor ?? ""}`)
    const hit = words.filter((w) => hay.includes(w)).length
    if (!hit) continue
    const nameHit = words.filter((w) => keyWords(ing.name).includes(w)).length
    scored.push({ ing, score: hit + nameHit * 2 + (keyOf(ing.name) === words.join(" ") ? 10 : 0) })
  }
  scored.sort((a, b) => b.score - a.score || a.ing.name.localeCompare(b.ing.name))
  return scored.slice(0, limit).map((s) => s.ing)
}

/**
 * What is this thing the trader is holding?
 *
 * Checks the verified spell-component index first, because a hit there is a
 * fact about the rules rather than a claim from a compiled table. Falls back to
 * the registry, and says plainly when nothing knows the name.
 *
 * `catalog` overrides the dated CATALOG_SLUGS snapshot — pass the live slugs.
 */
export function identify(query: string, catalog: Iterable<string> = CATALOG_SLUGS): Identification {
  const key = keyOf(query)
  const known = new Set(catalog)
  const blank: Identification = {
    query, name: null, substance: null, slug: null, verdict: "unknown", gp: null, usedBySpells: [],
    consumedBySpells: [], usedFor: null, catalogSlug: null, claimedSource: null,
    note: "", alternatives: [],
  }
  if (!key) return { ...blank, note: "Nothing to identify." }

  const reg = bySlug.get(key.replace(/ /g, "-")) ?? byKey.get(key) ?? null

  // 1. An exact substance from the spell data — the strongest answer there is.
  let term = substanceKeys.get(key)

  // 2. Failing that, the longest substance term CONTAINED in what was said —
  //    but only when no registry row already names the whole phrase, and only
  //    for a term of real weight. "Powdered unicorn horn" is a registry row
  //    the books do not back; the bare word "horn" sitting inside it must not
  //    be allowed to launder it into a verified spell component. A contained
  //    term therefore has to be two words or more, or else be the head noun of
  //    a phrase short enough that it IS the thing being offered.
  if (!term && !reg) {
    const words = key.split(" ")
    for (const [k, t] of substanceKeys) {
      if (!(` ${key} `).includes(` ${k} `)) continue
      const weighty = k.includes(" ") || (words.length <= 2 && words[words.length - 1] === k)
      if (!weighty) continue
      if (!term || k.length > keyOf(term).length) term = t
    }
  }
  const near = searchIngredients(query, 4).filter((i) => i !== reg).map((i) => i.name)

  if (term) {
    const spells = spellsNeeding(term)
    const consumed = spells.filter((s) => s.consumed)
    const priced = spells.map((s) => s.gp).filter((n): n is number => n !== null)
    const gp = priced.length ? Math.min(...priced) : null
    const name = reg?.name ?? term.replace(/\b\w/g, (c) => c.toUpperCase())
    const slug = reg?.slug ?? null
    const catalogSlug = slug && known.has(slug) ? slug : null
    const who = spells.slice(0, 3).map((s) => s.spell).join(", ")
    const price = gp !== null ? ` from ${gp} gp` : ""
    return {
      ...blank,
      name, substance: term, slug, verdict: "verified", gp,
      usedBySpells: spells.map((s) => s.spell),
      consumedBySpells: consumed.map((s) => s.spell),
      usedFor: reg?.usedFor ?? null,
      catalogSlug,
      claimedSource: reg?.claimedSource ?? null,
      alternatives: near,
      note:
        `${name} is a real 5E spell component${price}. ` +
        `${spells.length} spell${spells.length === 1 ? "" : "s"} call${spells.length === 1 ? "s" : ""} for it` +
        (who ? ` (${who}${spells.length > 3 ? ", …" : ""})` : "") +
        (consumed.length ? `; ${consumed.length} consume${consumed.length === 1 ? "s" : ""} it.` : ".") +
        (catalogSlug ? ` Already in the catalog as ${catalogSlug}.` : " Not a catalog item yet."),
    }
  }

  if (reg) {
    const catalogSlug = known.has(reg.slug) ? reg.slug : null
    const verdict: IngredientVerdict = reg.provenance === "homebrew" ? "homebrew" : "unverified"
    const use = reg.usedFor ? ` The list has it feeding ${reg.usedFor}.` : ""
    const note =
      verdict === "homebrew"
        ? `${reg.name} is community homebrew, not a WotC ingredient.${use} Sam's call whether it exists here.`
        : `${reg.name} is listed as ${reg.claimedSource ?? "official"}, but nothing in this repo confirms that.${use} Treat as a prop until checked against the book.`
    return {
      ...blank,
      name: reg.name, slug: reg.slug, verdict, gp: reg.gp,
      usedFor: reg.usedFor, catalogSlug, claimedSource: reg.claimedSource,
      alternatives: near, note,
    }
  }

  return {
    ...blank,
    alternatives: near,
    note: near.length
      ? `Nothing is called "${query}" in either list. Closest: ${near.join(", ")}.`
      : `Nothing is called "${query}" in either list — 292 spell components and ${REGISTERED_INGREDIENTS.length} named ingredients. Most likely it is not a D&D ingredient at all.`,
  }
}

/** Every ingredient the engine will vouch for outright. */
export function verifiedSubstances(): string[] {
  return Object.keys(SUBSTANCE_SPELLS).sort()
}

/** Counts for a DM panel or a session capture. */
export function registryStats(): Record<IngredientVerdict | "spellComponents", number> {
  const out = { verified: 0, unverified: 0, homebrew: 0, unknown: 0, spellComponents: SPELL_COMPONENTS.length }
  for (const i of REGISTERED_INGREDIENTS) {
    if (i.provenance === "spell-component") out.verified += 1
    else if (i.provenance === "homebrew") out.homebrew += 1
    else out.unverified += 1
  }
  return out
}

export interface OfferLine extends Identification {
  /** What the trader said, as said. */
  offered: string
  /** Asking price in gp, when the trader named one. */
  askGp: number | null
  /** askGp measured against the book price: >1 means overpriced. Null when either is unknown. */
  markup: number | null
}

export interface Appraisal {
  lines: OfferLine[]
  /** Lines the rules back outright. */
  verified: OfferLine[]
  /** Lines needing Sam's ruling before they enter the world. */
  needsRuling: OfferLine[]
  /** Lines no list knows at all — a lie, a local name, or a misheard word. */
  unknown: OfferLine[]
  /** One paragraph for the DM. */
  summary: string
}

/**
 * A trader lays goods on the table. Say what each thing actually is.
 *
 * This is the reason the file exists: the party meets someone up from the
 * surface with a satchel, and the DM needs to know in one beat which items are
 * real, which are worth the asking price, and which are a swindle — without
 * inventing anything to fill the gap.
 *
 * Prices are only ever compared where a book names one. A markup is arithmetic
 * on two known numbers, never a guess at what something "should" cost.
 */
export function appraiseOffer(
  offers: (string | { name: string; askGp?: number })[],
  catalog: Iterable<string> = CATALOG_SLUGS,
): Appraisal {
  const known = [...catalog]
  const lines: OfferLine[] = offers.map((o) => {
    const name = typeof o === "string" ? o : o.name
    const askGp = typeof o === "string" ? null : (o.askGp ?? null)
    const id = identify(name, known)
    const markup = askGp !== null && id.gp !== null && id.gp > 0 ? Math.round((askGp / id.gp) * 100) / 100 : null
    return { ...id, offered: name, askGp, markup }
  })

  const verified = lines.filter((l) => l.verdict === "verified")
  const needsRuling = lines.filter((l) => l.verdict === "unverified" || l.verdict === "homebrew")
  const unknown = lines.filter((l) => l.verdict === "unknown")
  const gouging = verified.filter((l) => l.markup !== null && l.markup > 1.5)

  const parts = [`${lines.length} item${lines.length === 1 ? "" : "s"} offered.`]
  if (verified.length) parts.push(`${verified.length} the rules back outright.`)
  if (needsRuling.length) parts.push(`${needsRuling.length} need${needsRuling.length === 1 ? "s" : ""} a DM ruling before entering the world.`)
  if (unknown.length) parts.push(`${unknown.length} match${unknown.length === 1 ? "es" : ""} nothing in either list — a lie, a local name, or a misheard word.`)
  if (gouging.length) parts.push(`Overpriced against the book: ${gouging.map((l) => `${l.offered} (×${l.markup})`).join(", ")}.`)

  return { lines, verified, needsRuling, unknown, summary: parts.join(" ") }
}
