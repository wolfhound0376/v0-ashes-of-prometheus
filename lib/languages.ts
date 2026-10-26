// lib/languages.ts — D&D 5E languages: the canonical table, a parser for the
// free-text `languages` columns already in the DB, "does this listener
// understand this line?", and a deterministic gibberish rendering for when
// they do not.
//
// SOURCE: SRD 5.1 "Characterization: Languages" (campaign_chunks 2501 and the
// two tables that follow it). The rule it states, and that the Forge follows:
//   - your race gives your default languages,
//   - your background may add more of your choice,
//   - pick from the Standard table; Exotic or secret languages need the GM's OK,
//   - Primordial is one language with four dialects (Aquan, Auran, Ignan,
//     Terran) and speakers of different dialects understand each other.
//
// NOT SOURCED (Claude's, flagged for Sam): the gibberish phonologies below.
// 5E says nothing about what Elvish *sounds* like; the syllable sets are
// chosen so the four tongues the party meets most (Elvish, Undercommon,
// Dwarvish, Orc) are distinguishable by ear, which is the point of the ruling.
//
// Pure module: no Supabase, no DOM, no fetch. The dashboard, the walk map and
// the TTS call sites all import from here so a line is scrambled the same way
// everywhere it is shown or spoken.

export type LanguageTier = "standard" | "exotic" | "secret"

export type Language = {
  /** Canonical display name, e.g. "Deep Speech". */
  name: string
  tier: LanguageTier
  /** SRD "Typical Speakers" column. */
  speakers: string
  /** SRD "Script" column; null where the SRD lists none (Deep Speech). */
  script: string | null
}

/** SRD 5.1 Standard, Exotic, and the two secret languages it names. */
export const LANGUAGES: readonly Language[] = [
  { name: "Common", tier: "standard", speakers: "Humans", script: "Common" },
  { name: "Dwarvish", tier: "standard", speakers: "Dwarves", script: "Dwarvish" },
  { name: "Elvish", tier: "standard", speakers: "Elves", script: "Elvish" },
  { name: "Giant", tier: "standard", speakers: "Ogres, giants", script: "Dwarvish" },
  { name: "Gnomish", tier: "standard", speakers: "Gnomes", script: "Dwarvish" },
  { name: "Goblin", tier: "standard", speakers: "Goblinoids", script: "Dwarvish" },
  { name: "Halfling", tier: "standard", speakers: "Halflings", script: "Common" },
  { name: "Orc", tier: "standard", speakers: "Orcs", script: "Dwarvish" },
  { name: "Abyssal", tier: "exotic", speakers: "Demons", script: "Infernal" },
  { name: "Celestial", tier: "exotic", speakers: "Celestials", script: "Celestial" },
  { name: "Draconic", tier: "exotic", speakers: "Dragons, dragonborn", script: "Draconic" },
  { name: "Deep Speech", tier: "exotic", speakers: "Aboleths, cloakers", script: null },
  { name: "Infernal", tier: "exotic", speakers: "Devils", script: "Infernal" },
  { name: "Primordial", tier: "exotic", speakers: "Elementals", script: "Dwarvish" },
  { name: "Sylvan", tier: "exotic", speakers: "Fey creatures", script: "Elvish" },
  { name: "Undercommon", tier: "exotic", speakers: "Underdark traders", script: "Elvish" },
  { name: "Thieves' Cant", tier: "secret", speakers: "Rogues", script: null },
  { name: "Druidic", tier: "secret", speakers: "Druids", script: null },
] as const

const BY_KEY = new Map<string, string>()
for (const l of LANGUAGES) BY_KEY.set(keyOf(l.name), l.name)
// Spellings and dialects seen in the live `characters.languages` /
// `bestiary.languages` text, folded onto the canonical name.
const ALIASES: Record<string, string> = {
  elven: "Elvish",
  dwarven: "Dwarvish",
  orcish: "Orc",
  goblinoid: "Goblin",
  gnome: "Gnomish",
  halfing: "Halfling",
  thievescant: "Thieves' Cant",
  cant: "Thieves' Cant",
  deepspeech: "Deep Speech",
  aquan: "Primordial",
  auran: "Primordial",
  ignan: "Primordial",
  terran: "Primordial",
  giantish: "Giant",
}
for (const [k, v] of Object.entries(ALIASES)) BY_KEY.set(k, v)

function keyOf(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "")
}

/** Canonical name for a language string, or null if it is not one we know. */
export function canonicalLanguage(raw: string): string | null {
  const k = keyOf(raw)
  if (!k) return null
  return BY_KEY.get(k) ?? null
}

export function languageInfo(name: string): Language | null {
  const c = canonicalLanguage(name)
  return c ? LANGUAGES.find((l) => l.name === c) ?? null : null
}

export type LanguageProfile = {
  /** Languages the creature speaks and understands. */
  speaks: string[]
  /** Understood but not spoken ("understands Common but can't speak"). */
  understandsOnly: string[]
  /** Telepathy understands every speaker, per the SRD monster entries. */
  telepathy: boolean
  /** Text that was not recognised (homebrew tongues, "one extra language"). */
  unknown: string[]
}

/**
 * Parse whatever shape a languages field arrives in: the comma text of
 * `characters.languages` ("Common, Goblin, Thieves' Cant"), a monster's
 * "understands Common but can't speak", "—", or the string[] in
 * `sheet_proficiencies.languages`.
 */
export function parseLanguages(raw: string | readonly string[] | null | undefined): LanguageProfile {
  const out: LanguageProfile = { speaks: [], understandsOnly: [], telepathy: false, unknown: [] }
  if (!raw) return out
  const text = Array.isArray(raw) ? raw.join(", ") : String(raw)
  // "Undercommon, understands Common but can't speak": everything after the
  // word "understands" is understood-only when the entry says it can't speak.
  const m = /\bunderstands?\b/i.exec(text)
  const mute = /can'?t speak|cannot speak/i.test(text)
  const segments: Array<[string, boolean]> = m
    ? [[text.slice(0, m.index), false], [text.slice(m.index + m[0].length), mute]]
    : [[text, false]]
  for (const [seg, onlyUnderstood] of segments) {
    for (let part of seg.split(/[;,]|\band\b|\bplus\b/i)) {
      part = part.trim()
      if (!part || /^[—–-]+$/.test(part)) continue
      if (/telepathy/i.test(part)) {
        out.telepathy = true
        continue
      }
      const words = part
        .replace(/but can'?t speak( (it|them))?|but cannot speak( (it|them))?|it knew in life|the languages?|of its creator|any languages?/gi, " ")
        .replace(/\(.*?\)/g, " ")
        .trim()
      if (!words) continue
      const c = canonicalLanguage(words)
      if (c) {
        const bucket = onlyUnderstood ? out.understandsOnly : out.speaks
        if (!bucket.includes(c)) bucket.push(c)
      } else {
        out.unknown.push(words)
      }
    }
  }
  return out
}

/** Flat list of everything a profile can understand (spoken + understood). */
export function understoodLanguages(p: LanguageProfile): string[] {
  return [...new Set([...p.speaks, ...p.understandsOnly])]
}

export type ListenerState = {
  languages: string | readonly string[] | null | undefined
  /** Comprehend Languages / Tongues / a helm of comprehending languages. */
  comprehendAll?: boolean
}

/**
 * Does this listener understand speech in `spoken`? A line with no language
 * (narration, or an NPC whose tongue was not tagged) is always understood —
 * the system only scrambles what it was told to scramble.
 */
export function understands(listener: ListenerState, spoken: string | null | undefined): boolean {
  if (!spoken) return true
  const lang = canonicalLanguage(spoken)
  if (!lang) return true // unknown/homebrew tongue: fail open, never eat a line silently
  if (listener.comprehendAll) return true
  const p = parseLanguages(listener.languages)
  if (p.telepathy) return true
  return understoodLanguages(p).includes(lang)
}

/** Languages two creatures share — what an NPC should pick to be understood. */
export function sharedLanguages(
  a: string | readonly string[] | null | undefined,
  b: string | readonly string[] | null | undefined,
): string[] {
  const sa = parseLanguages(a).speaks
  const ub = understoodLanguages(parseLanguages(b))
  return sa.filter((l) => ub.includes(l))
}

// ---------------------------------------------------------------------------
// Gibberish. Deterministic: the same word in the same language always comes
// out the same, so a repeated name or oath is recognisably repeated even to
// someone who cannot understand it — which is how a real foreign tongue feels.

type Phonology = { onsets: string[]; vowels: string[]; codas: string[]; joiner?: string }

const PHONOLOGY: Record<string, Phonology> = {
  // liquid, vowel-heavy, apostrophes
  Elvish: { onsets: ["l", "th", "s", "v", "n", "r", "f", "y", "el", "ae"], vowels: ["a", "e", "i", "ae", "ia", "ë", "ai"], codas: ["", "", "l", "n", "th", "s", "r"], joiner: "'" },
  // clipped, sibilant, clicky — drow trade tongue
  Undercommon: { onsets: ["z", "q", "xh", "v", "ss", "k", "dr", "jh"], vowels: ["a", "u", "i", "aa", "e"], codas: ["", "k", "z", "ss", "th", "x"] },
  Dwarvish: { onsets: ["kh", "d", "b", "g", "th", "br", "dr", "k"], vowels: ["a", "u", "o", "aa", "ü"], codas: ["k", "rd", "m", "n", "z", "rak", "d"] },
  Orc: { onsets: ["gr", "kr", "g", "z", "sh", "b", "dr", "u"], vowels: ["a", "u", "o", "ú"], codas: ["k", "g", "sh", "rg", "z", "t", "nk"] },
  Goblin: { onsets: ["sk", "gr", "n", "z", "kr", "sn", "b"], vowels: ["i", "a", "e", "ee"], codas: ["k", "t", "z", "g", "p", ""] },
  Giant: { onsets: ["h", "j", "g", "st", "b", "th"], vowels: ["o", "a", "u", "oo"], codas: ["m", "rn", "d", "ld", "n"] },
  Gnomish: { onsets: ["b", "f", "w", "n", "p", "t", "g"], vowels: ["i", "o", "e", "ee", "ou"], codas: ["", "b", "n", "ck", "p", "ll"] },
  Halfling: { onsets: ["m", "p", "b", "t", "w", "h"], vowels: ["o", "a", "i", "e"], codas: ["", "n", "m", "t", "ck"] },
  Draconic: { onsets: ["sv", "th", "x", "ka", "dr", "ss", "v"], vowels: ["a", "i", "u", "ae", "o"], codas: ["x", "ss", "th", "r", "k", ""] },
  Infernal: { onsets: ["z", "b", "m", "kr", "ash", "v", "n"], vowels: ["a", "e", "o", "u"], codas: ["l", "z", "th", "x", "r"] },
  Abyssal: { onsets: ["gh", "ch", "kh", "x", "zh", "r"], vowels: ["u", "a", "aa", "ü"], codas: ["kh", "gh", "x", "rr", "z"] },
  Celestial: { onsets: ["s", "l", "h", "m", "el", "v"], vowels: ["a", "e", "i", "ae", "ai"], codas: ["", "l", "n", "el", "m"] },
  Primordial: { onsets: ["v", "h", "r", "sh", "k", "w"], vowels: ["o", "u", "a", "oo"], codas: ["", "sh", "r", "m", "h"] },
  Sylvan: { onsets: ["f", "w", "l", "s", "t", "fi"], vowels: ["i", "ee", "a", "ia", "o"], codas: ["", "l", "n", "s", "f"] },
  "Deep Speech": { onsets: ["ng", "th", "kl", "mm", "r", "gh"], vowels: ["u", "o", "ü", "uu"], codas: ["ng", "th", "lk", "mm", "gh"], joiner: "-" },
  "Thieves' Cant": { onsets: ["d", "sn", "k", "b", "f", "l"], vowels: ["o", "a", "i"], codas: ["", "ck", "b", "nt", "ff"] },
  Druidic: { onsets: ["d", "r", "w", "o", "gw", "ll"], vowels: ["y", "a", "o", "ae", "w"], codas: ["", "n", "dd", "r", "th"] },
  Common: { onsets: ["b", "d", "m", "t", "s", "p", "l", "r"], vowels: ["a", "e", "i", "o", "u"], codas: ["", "n", "t", "s", "r"] },
}

/** 32-bit FNV-1a — tiny, stable across browsers and Node. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 PRNG seeded from a word. */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length)]
}

function scrambleWord(word: string, lang: string, ph: Phonology): string {
  const r = rng(hash(lang + "|" + word.toLowerCase()))
  // Roughly one syllable per 3 letters, at least one.
  const syllables = Math.max(1, Math.round(word.length / 3))
  let out = ""
  for (let i = 0; i < syllables; i++) {
    if (i > 0 && ph.joiner && r() < 0.18) out += ph.joiner
    out += pick(r, ph.onsets) + pick(r, ph.vowels)
    if (i === syllables - 1 || r() < 0.35) out += pick(r, ph.codas)
  }
  // Keep the original's capitalisation so names still read as names.
  if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
    out = out.charAt(0).toUpperCase() + out.slice(1)
  }
  if (word === word.toUpperCase() && word.length > 1 && /[A-Z]/.test(word)) out = out.toUpperCase()
  return out
}

/**
 * Render `text` as it sounds to someone who does not know `language`. Words
 * become pronounceable nonsense in that tongue's sound; punctuation, spacing,
 * capitals and the rough length survive, so the beat and emotion of the line
 * still land (a shouted threat still looks shouted). Text in [square brackets]
 * or *asterisks* is stage direction and is left alone.
 */
export function gibberish(text: string, language: string): string {
  const lang = canonicalLanguage(language) ?? language
  const ph = PHONOLOGY[lang] ?? PHONOLOGY.Common
  const out: string[] = []
  // Split keeping stage directions intact.
  for (const chunk of text.split(/(\[[^\]]*\]|\*[^*]*\*)/)) {
    if (!chunk) continue
    if (/^(\[[^\]]*\]|\*[^*]*\*)$/.test(chunk)) {
      out.push(chunk)
      continue
    }
    out.push(chunk.replace(/[A-Za-zÀ-ÿ']+/g, (w) => (/^'+$/.test(w) ? w : scrambleWord(w.replace(/'/g, ""), lang, ph))))
  }
  return out.join("")
}

/**
 * The one call display and TTS sites need: the text this listener sees/hears
 * for a line spoken in `spoken`.
 */
export function renderSpeechFor(text: string, spoken: string | null | undefined, listener: ListenerState): {
  text: string
  understood: boolean
  language: string | null
} {
  const language = spoken ? canonicalLanguage(spoken) : null
  if (understands(listener, spoken)) return { text, understood: true, language }
  return { text: gibberish(text, language ?? String(spoken)), understood: false, language }
}

// ---------------------------------------------------------------------------
// Character creation (Forge). SRD 5.1 race language traits; background and
// class grants. Mirrors what public/forge2014.html applies so tests can pin it.

export type LanguageGrant = { fixed: string[]; choices: number; sources: string[] }

/** SRD 5.1 / PHB 2014 race "Languages" traits for the Forge's species list. */
export const SPECIES_LANGUAGES: Record<string, { fixed: string[]; choices: number }> = {
  Human: { fixed: ["Common"], choices: 1 },
  Dwarf: { fixed: ["Common", "Dwarvish"], choices: 0 },
  Elf: { fixed: ["Common", "Elvish"], choices: 1 }, // Forge's Elf is the High Elf (wizard cantrip) → Extra Language
  Drow: { fixed: ["Common", "Elvish"], choices: 0 },
  Halfling: { fixed: ["Common", "Halfling"], choices: 0 },
  Gnome: { fixed: ["Common", "Gnomish"], choices: 0 },
  Dragonborn: { fixed: ["Common", "Draconic"], choices: 0 },
  Tiefling: { fixed: ["Common", "Infernal"], choices: 0 },
  "Half-Elf": { fixed: ["Common", "Elvish"], choices: 1 },
  "Half-Orc": { fixed: ["Common", "Orc"], choices: 0 },
  Aarakocra: { fixed: ["Common", "Aarakocra", "Primordial"], choices: 0 }, // EE: Auran → Primordial dialect
  "Deep Gnome": { fixed: ["Common", "Gnomish", "Undercommon"], choices: 0 },
  Genasi: { fixed: ["Common", "Primordial"], choices: 0 },
  Goliath: { fixed: ["Common", "Giant"], choices: 0 },
}

/**
 * Background language picks. 2014 PHB counts for the backgrounds that share a
 * 2014 name (Acolyte 2, Sage 2, Hermit 1, Noble 1; the rest 0). The Forge's
 * 2024-only names have no 2014 row, so they take the nearest 2014 background's
 * count — CLAUDE'S MAPPING, flagged: Artisan→Guild Artisan 1, Merchant→Guild
 * Artisan 1, Scribe→Sage 2, Guide→Outlander 1, Farmer→Folk Hero 0,
 * Guard→Soldier 0, Wayfarer→Urchin 0.
 */
export const BACKGROUND_LANGUAGE_CHOICES: Record<string, number> = {
  Acolyte: 2,
  Sage: 2,
  Hermit: 1,
  Noble: 1,
  Charlatan: 0,
  Criminal: 0,
  Entertainer: 0,
  Sailor: 0,
  Soldier: 0,
  Artisan: 1,
  Merchant: 1,
  Scribe: 2,
  Guide: 1,
  Farmer: 0,
  Guard: 0,
  Wayfarer: 0,
}

/** Class grants: SRD 5.1 Rogue (Thieves' Cant), Druid (Druidic). */
export const CLASS_LANGUAGES: Record<string, string[]> = {
  Rogue: ["Thieves' Cant"],
  Druid: ["Druidic"],
}

export function languageGrant(opts: { species?: string | null; background?: string | null; clazz?: string | null }): LanguageGrant {
  const fixed: string[] = []
  const sources: string[] = []
  let choices = 0
  const sp = opts.species ? SPECIES_LANGUAGES[opts.species] : null
  if (sp) {
    fixed.push(...sp.fixed)
    choices += sp.choices
    if (sp.choices) sources.push(`${opts.species}: ${sp.choices} of your choice`)
  } else {
    fixed.push("Common")
  }
  const bg = opts.background ? BACKGROUND_LANGUAGE_CHOICES[opts.background] ?? 0 : 0
  if (bg) {
    choices += bg
    sources.push(`${opts.background}: ${bg} of your choice`)
  }
  for (const l of (opts.clazz && CLASS_LANGUAGES[opts.clazz]) || []) fixed.push(l)
  return { fixed: [...new Set(fixed)], choices, sources }
}

/** Languages offered in a Forge choice slot (excludes ones already known). */
export function choosableLanguages(known: readonly string[]): Language[] {
  const k = new Set(known.map((x) => canonicalLanguage(x) ?? x))
  return LANGUAGES.filter((l) => l.tier !== "secret" && !k.has(l.name))
}

// ---------------------------------------------------------------------------
// Dialogue rows (the `dialogue` table) as one viewer hears them. A row's
// language lives on its speech_segments[].lang, stamped by the server
// (lib/npc-languages.ts). Rows without one pass through untouched.

const COMPREHEND_RE = /comprehend languages|tongues/i

/** A characters row (or the dashboard's view of one) as a listener. */
export function listenerFromCharacter(row: { languages?: unknown; conditions?: unknown } | null | undefined): ListenerState {
  if (!row) return { languages: null }
  const conditions = Array.isArray(row.conditions) ? row.conditions : []
  const comprehendAll = conditions.some((c: any) => COMPREHEND_RE.test(typeof c === "string" ? c : String(c?.name ?? "")))
  const raw = row.languages
  return { languages: Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw : null, comprehendAll }
}

/**
 * The shared ears of a whole table — what a projected DM screen should SAY
 * aloud: a tongue is understood only when every seated player understands it,
 * so the speakers never give away a line someone at the table should not get.
 */
export function partyListener(rows: Array<{ languages?: unknown; conditions?: unknown }>): ListenerState {
  if (!rows.length) return { languages: null }
  const sets = rows.map((r) => {
    const l = listenerFromCharacter(r)
    if (l.comprehendAll) return null // understands all: does not narrow the table
    return new Set(understoodLanguages(parseLanguages(l.languages)))
  })
  const real = sets.filter((s): s is Set<string> => s !== null)
  if (!real.length) return { languages: null, comprehendAll: true }
  const common = [...real[0]].filter((l) => real.every((s) => s.has(l)))
  return { languages: common }
}

type SegmentLike = { line: string; lang?: string | null }
type RowLike = { text: string; speech_segments?: SegmentLike[] | null }

/** The languages a dialogue row is spoken in, with whether this listener follows each. */
export function rowLanguages(row: RowLike, listener?: ListenerState): Array<{ lang: string; understood: boolean }> {
  const out: Array<{ lang: string; understood: boolean }> = []
  for (const seg of row.speech_segments ?? []) {
    const lang = seg.lang ? canonicalLanguage(seg.lang) : null
    if (lang && !out.some((o) => o.lang === lang)) out.push({ lang, understood: listener ? understands(listener, lang) : true })
  }
  return out
}

/**
 * Return the row as `listener` hears it: every segment in a tongue they lack is
 * replaced by gibberish, in the segment AND in the row text, so the voice queue
 * (which matches segments inside the text) speaks the same nonsense the log
 * shows. A row with nothing foreign is returned as the same object.
 */
export function hearDialogueRow<T extends RowLike>(row: T, listener: ListenerState): T {
  const segs = row.speech_segments
  if (!segs?.length || !segs.some((s) => s.lang)) return row
  let text = row.text
  let changed = false
  let cursor = 0
  const nextSegs = segs.map((seg) => {
    if (!seg.lang || understands(listener, seg.lang)) return seg
    const heard = gibberish(seg.line, seg.lang)
    const at = text.indexOf(seg.line, cursor)
    if (at >= 0) {
      text = text.slice(0, at) + heard + text.slice(at + seg.line.length)
      cursor = at + heard.length
    }
    changed = true
    return { ...seg, line: heard }
  })
  return changed ? { ...row, text, speech_segments: nextSegs } : row
}
