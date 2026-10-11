// What a field trip brings home, made real.
//
// Camp at the Fire (public/camp/fire) runs the forage / hunt / explore games
// and, until now, kept the haul in page memory: `supplies` started at 20 on
// every load and the pack was a hard-coded sample. This module is the gate
// between that page and the party's actual food (`party_supplies`) and packs
// (`inventory_items`): it decides what may land and what must not.
//
// The architecture's first invariant applies with full force here — THE AI
// CANNOT INVENT ITEMS, and neither can a mini-game. Every slug is resolved
// against the catalog; anything that does not resolve is reported back, never
// written. Food is a number on the pool (DMG p.111 days of food; the camp's
// rest charges against the same pool, lib/camp.ts), so it needs no catalog row.
//
// Pure: rows in, a plan out. The route owns the database.

export interface HaulItemIn {
  slug: string
  quantity: number
}

export interface HaulIn {
  /** "forage" | "hunt" | "explore" | "rest" | "wild" — what produced it; logged, not trusted. */
  mode: string
  /** Days of food gained (positive) or rations spent at a rest (negative). */
  supplies_delta: number
  items: HaulItemIn[]
  /** The page's own words about the outing; kept for the log. */
  note?: string | null
}

export interface CatalogRow {
  id: string
  slug: string
  name: string
  item_type: string | null
  weight: number | null
  value: number | null
  description: string | null
}

export interface HaulPlan {
  supplies_delta: number
  /** Catalog rows to add, merged by slug, quantities capped. */
  items: { item: CatalogRow; quantity: number }[]
  /** Slugs the catalog does not know. Reported; never written. */
  rejected: { slug: string; quantity: number; reason: string }[]
  flags: string[]
}

export const MODES = new Set(["forage", "hunt", "explore", "rest", "wild"])
/** One outing cannot plausibly bring home more than this of one thing. PROPOSED sanity cap, not a rule. */
export const MAX_PER_ITEM = 50
export const MAX_SUPPLIES_PER_CALL = 200
const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/

export function isHaulIn(x: unknown): x is HaulIn {
  if (!x || typeof x !== "object") return false
  const h = x as Record<string, unknown>
  if (typeof h.mode !== "string" || !MODES.has(h.mode)) return false
  if (typeof h.supplies_delta !== "number" || !Number.isFinite(h.supplies_delta)) return false
  if (!Array.isArray(h.items)) return false
  return h.items.every((i) => i && typeof i === "object" && typeof (i as HaulItemIn).slug === "string" && typeof (i as HaulItemIn).quantity === "number")
}

/**
 * Resolve a haul against the catalog. Unknown slugs are rejected by name so
 * the page can say "the DM must choose" rather than conjuring a row.
 */
export function planHaul(haul: HaulIn, catalog: readonly CatalogRow[]): HaulPlan {
  const bySlug = new Map(catalog.map((c) => [c.slug, c]))
  const merged = new Map<string, number>()
  const rejected: HaulPlan["rejected"] = []
  const flags: string[] = []
  for (const it of haul.items) {
    const slug = String(it.slug ?? "").trim().toLowerCase()
    const qty = Math.trunc(Number(it.quantity) || 0)
    if (!SLUG.test(slug)) {
      rejected.push({ slug: String(it.slug), quantity: qty, reason: "not a slug" })
      continue
    }
    if (qty <= 0) continue
    if (!bySlug.has(slug)) {
      rejected.push({ slug, quantity: qty, reason: "not in the catalog" })
      continue
    }
    merged.set(slug, (merged.get(slug) ?? 0) + qty)
  }
  const items: HaulPlan["items"] = []
  for (const [slug, q] of merged) {
    const quantity = Math.min(MAX_PER_ITEM, q)
    if (quantity < q) flags.push(`${slug}: ${q} capped to ${MAX_PER_ITEM}.`)
    items.push({ item: bySlug.get(slug)!, quantity })
  }
  let supplies_delta = Math.trunc(Number(haul.supplies_delta) || 0)
  if (Math.abs(supplies_delta) > MAX_SUPPLIES_PER_CALL) {
    flags.push(`supplies ${supplies_delta} capped to ±${MAX_SUPPLIES_PER_CALL}.`)
    supplies_delta = Math.sign(supplies_delta) * MAX_SUPPLIES_PER_CALL
  }
  if (haul.mode !== "rest" && supplies_delta < 0) {
    flags.push(`${haul.mode} cannot take food away; ${supplies_delta} ignored.`)
    supplies_delta = 0
  }
  return { supplies_delta, items, rejected, flags }
}

/** The pool never goes below zero (party_supplies_supplies_check). */
export function poolAfter(pool: number | null | undefined, delta: number): number {
  return Math.max(0, Math.trunc(Number(pool) || 0) + Math.trunc(delta || 0))
}

/**
 * The camp page calls its people by their short names ("Fifi"); the sheet
 * says "Fifi of Copperas Cove". Match by id first, then exact name, then the
 * sheet name's first word — and refuse to guess when two sheets could claim it.
 */
export function matchCharacter<T extends { id: string; name: string }>(who: string, characters: readonly T[]): T | null {
  const w = String(who ?? "").trim().toLowerCase()
  if (!w) return null
  const byId = characters.find((c) => c.id === w)
  if (byId) return byId
  const exact = characters.filter((c) => c.name.trim().toLowerCase() === w)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null
  const first = characters.filter((c) => c.name.trim().toLowerCase().split(/\s+/)[0] === w)
  return first.length === 1 ? first[0] : null
}

/** "Fifi of Copperas Cove" → "Fifi": the name the camp page uses. */
export function shortName(name: string): string {
  return String(name ?? "").trim().split(/\s+/)[0] ?? ""
}
