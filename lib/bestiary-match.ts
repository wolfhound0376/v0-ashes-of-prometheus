// Bestiary matching + stat-mapping helpers for the admin "Autopopulate from
// Bestiary" feature. Pure functions only (no Supabase) so they are trivially
// testable and reusable by both the single-character modal and the bulk action.

export interface BestiaryEntry {
  id: string
  name: string
  slug?: string | null
  role?: string | null
  size?: string | null
  creature_type?: string | null
  cr?: string | null
  xp?: number | null
  ac?: number | null
  hp?: number | null
  str?: number | null
  dex?: number | null
  con?: number | null
  int?: number | null
  wis?: number | null
  cha?: number | null
  speed?: string | null
  senses?: string | null
  skills?: string | null
  notes?: string | null
  source?: string | null
  [key: string]: unknown
}

export interface BestiaryMatch {
  entry: BestiaryEntry
  confidence: number
  reason: string
}

/** Minimum confidence for a match to be treated as "confident" (auto-shown). */
export const CONFIDENT_THRESHOLD = 0.6

function norm(s: unknown): string {
  return typeof s === "string" ? s.toLowerCase().trim() : ""
}

function tokenize(s: string): string[] {
  return norm(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
}

/**
 * Score how well a character name matches a single bestiary entry.
 * Ordered strongest → weakest so the first hit wins:
 *   1.0  exact name or slug
 *   0.95 character explicitly named in the entry's notes ("X uses this block")
 *   0.85 slug substring either direction
 *   0.8  name substring either direction ("Drow Guard" ⊃ "Drow")
 *   0.5–0.8  shared significant keyword(s)
 */
export function scoreMatch(name: string, entry: BestiaryEntry): { score: number; reason: string } {
  const n = norm(name)
  if (!n) return { score: 0, reason: "" }
  const en = norm(entry.name)
  const es = norm(entry.slug)

  if (n === en || (es && n === es)) return { score: 1, reason: "exact name match" }

  if (entry.notes && norm(entry.notes).includes(n)) {
    return { score: 0.95, reason: "named in bestiary notes" }
  }

  if (es && (n.includes(es) || es.includes(n))) {
    return { score: 0.85, reason: `slug match "${entry.slug}"` }
  }

  if (en && (n.includes(en) || en.includes(n))) {
    return { score: 0.8, reason: `name contained ("${entry.name}")` }
  }

  const nameTokens = new Set(tokenize(n))
  const entryTokens = tokenize(en)
  if (entryTokens.length) {
    const shared = entryTokens.filter((t) => nameTokens.has(t))
    if (shared.length) {
      const score = 0.5 + 0.3 * (shared.length / entryTokens.length)
      return { score, reason: `shared keyword${shared.length > 1 ? "s" : ""}: ${shared.join(", ")}` }
    }
  }

  return { score: 0, reason: "" }
}

/** Rank all entries for a name; `best` is null unless it clears the threshold. */
export function matchBestiary(
  name: string,
  entries: BestiaryEntry[],
): { best: BestiaryMatch | null; ranked: BestiaryMatch[] } {
  const ranked = entries
    .map((entry) => {
      const { score, reason } = scoreMatch(name, entry)
      return { entry, confidence: score, reason }
    })
    .sort((a, b) => b.confidence - a.confidence)
  const best = ranked[0] && ranked[0].confidence >= CONFIDENT_THRESHOLD ? ranked[0] : null
  return { best, ranked }
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

// ---- Stat mapping -----------------------------------------------------------

export interface StatFieldDiff {
  /** characters-table column being written (score fields; modifiers derived). */
  key: string
  label: string
  /** Numeric ability/AC/HP fields vs. free-text reference fields. */
  kind: "number" | "text"
  current: string | number | null
  proposed: string | number | null
  /** True when the current value is a real, non-default (manually set) value. */
  isManuallySet: boolean
  /** True when the characters schema stores this field. */
  supported: boolean
}

// Default "unstatted" sentinel values in the characters schema.
const DEFAULTS: Record<string, number> = {
  ac: 10,
  hp_max: 10,
  hp_current: 10,
  str_score: 10,
  dex_score: 10,
  con_score: 10,
  int_score: 10,
  wis_score: 10,
  cha_score: 10,
}

function isSet(key: string, value: number | null | undefined): boolean {
  if (value === null || value === undefined) return false
  const def = DEFAULTS[key]
  return def === undefined ? true : value !== def
}

/** A text reference field is "manually set" when it holds a non-empty string. */
function isTextSet(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0
}

/**
 * Build the field-by-field diff between a character's current stats and a
 * bestiary entry. Numeric fields are AC, HP, and the six ability scores. The
 * characters table now also stores reference text fields (speed, senses,
 * skills, size, cr, languages, damage_resistances, damage_immunities,
 * condition_immunities) which are mapped as writable text rows. XP is not a
 * characters column, so it stays informational only.
 */
export function buildStatDiff(
  current: Record<string, unknown>,
  entry: BestiaryEntry,
): { writable: StatFieldDiff[]; info: { label: string; value: string }[] } {
  const cur = (k: string): number | null => {
    const v = current[k]
    return typeof v === "number" ? v : null
  }
  const curText = (k: string): string | null => {
    const v = current[k]
    return typeof v === "string" && v.trim() ? v : null
  }

  const writable: StatFieldDiff[] = []

  const pushScore = (key: string, label: string, proposed: number | null | undefined) => {
    writable.push({
      key,
      label,
      kind: "number",
      current: cur(key),
      proposed: typeof proposed === "number" ? proposed : null,
      isManuallySet: isSet(key, cur(key)),
      supported: true,
    })
  }

  // Free-text reference field. Only proposes a value when the bestiary entry
  // actually has a non-empty one, so blank source fields never overwrite.
  const pushText = (key: string, label: string, source: unknown) => {
    const proposed = typeof source === "string" && source.trim() ? source.trim() : null
    writable.push({
      key,
      label,
      kind: "text",
      current: curText(key),
      proposed,
      isManuallySet: isTextSet(current[key]),
      supported: true,
    })
  }

  pushScore("ac", "AC", entry.ac ?? null)
  pushScore("hp_max", "HP Max", entry.hp ?? null)
  pushScore("hp_current", "HP Current", entry.hp ?? null)
  pushScore("str_score", "STR", entry.str ?? null)
  pushScore("dex_score", "DEX", entry.dex ?? null)
  pushScore("con_score", "CON", entry.con ?? null)
  pushScore("int_score", "INT", entry.int ?? null)
  pushScore("wis_score", "WIS", entry.wis ?? null)
  pushScore("cha_score", "CHA", entry.cha ?? null)

  // Direct-map reference fields.
  pushText("speed", "Speed", entry.speed)
  pushText("senses", "Senses", entry.senses)
  pushText("skills", "Skills", entry.skills)
  pushText("size", "Size", entry.size)
  pushText("cr", "CR", entry.cr)
  // Optional fields: only mapped when the bestiary row provides them.
  pushText("languages", "Languages", entry.languages)
  pushText("damage_resistances", "Damage Resist.", entry.damage_resistances)
  pushText("damage_immunities", "Damage Immun.", entry.damage_immunities)
  pushText("condition_immunities", "Condition Immun.", entry.condition_immunities)

  const info: { label: string; value: string }[] = []
  if (entry.xp !== null && entry.xp !== undefined && `${entry.xp}`.trim()) {
    info.push({ label: "XP", value: `${entry.xp}` })
  }

  return { writable, info }
}

/**
 * Given the set of writable diffs the user approved (by key), produce the
 * partial character patch, deriving ability modifiers from numeric scores.
 * Numeric fields yield numbers (plus derived modifiers); text fields yield
 * strings.
 */
export function buildPatch(approved: StatFieldDiff[]): Record<string, string | number> {
  const patch: Record<string, string | number> = {}
  for (const field of approved) {
    if (field.proposed === null) continue
    patch[field.key] = field.proposed
    if (field.kind === "number" && typeof field.proposed === "number") {
      const scoreMatch = field.key.match(/^(str|dex|con|int|wis|cha)_score$/)
      if (scoreMatch) {
        patch[`${scoreMatch[1]}_modifier`] = abilityModifier(field.proposed)
      }
    }
  }
  return patch
}
