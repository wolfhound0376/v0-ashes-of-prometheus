/**
 * Shared text-to-speech helpers for the ElevenLabs pipeline.
 *
 * The app speaks two kinds of lines:
 *  - Malachar (the DM/narrator) via a fixed lich voice.
 *  - Named NPCs via a per-character voice resolved from their `voice_id`, or
 *    (when unset) matched from their free-text `voice_description` against the
 *    curated ElevenLabs premade voices below.
 */

/** Strip markdown / special chars that ElevenLabs would read aloud literally. */
export function sanitizeForTTS(text: string): string {
  return text
    .replace(/\*+/g, "") // asterisks (bold/italic markdown)
    .replace(/_{2,}/g, "") // underscores (markdown emphasis)
    .replace(/#{1,6}\s*/g, "") // markdown headers
    .replace(/`{1,3}/g, "") // backticks
    .replace(/~{2}/g, "") // strikethrough
    .replace(/[""“”]/g, "") // smart & straight double quotes
    .replace(/['‘’]/g, "") // smart single quotes
    .replace(/\[ITEM_ADD:[^\]]*\]/g, "") // inventory tags
    .replace(/\[ITEM_REMOVE:[^\]]*\]/g, "")
    .replace(/\[ITEM_AWARD:[^\]]*\]/g, "")
    .replace(/--+/g, ", ") // em-dashes to pause
    .replace(/\.\.\./g, "...") // keep ellipsis (TTS handles it)
    .replace(/\s{2,}/g, " ") // collapse whitespace
    .trim()
}

export interface ElevenVoice {
  id: string
  name: string
  gender: "female" | "male" | "neutral"
  /** Descriptive keywords used to score against an NPC voice_description. */
  tags: string[]
}

/**
 * Curated subset of ElevenLabs premade (shared library) voices with stable IDs.
 * Timbre keywords (gravelly, raspy, husky, low, deep, hoarse) are weighted more
 * heavily than generic ones during matching — see resolveVoiceFromDescription.
 */
export const ELEVEN_VOICE_LIBRARY: ElevenVoice[] = [
  // Female
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", gender: "female", tags: ["british", "raspy", "gravelly", "low", "warm", "mature", "weathered"] },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", gender: "female", tags: ["british", "confident", "commanding", "clear", "clipped", "mature"] },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", gender: "female", tags: ["husky", "low", "seductive", "mature", "smooth"] },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", gender: "female", tags: ["american", "young", "expressive", "playful"] },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", gender: "female", tags: ["american", "soft", "warm", "young", "gentle"] },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", gender: "female", tags: ["american", "calm", "clear", "narration"] },
  // Male
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", gender: "male", tags: ["british", "authoritative", "deep", "commanding", "news"] },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "male", tags: ["british", "warm", "mature", "raspy", "narration"] },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", gender: "male", tags: ["american", "deep", "gravelly", "narration", "mature"] },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", gender: "male", tags: ["gravelly", "hoarse", "intense", "low"] },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", gender: "male", tags: ["american", "old", "gravelly", "weathered", "low"] },
  // Male — additions (all verified present on the ElevenLabs account). The
  // spec's suggested legacy ids (Antoni, Arnold, Josh, Sam, Clyde, Fin) are NOT
  // on this account, so they are replaced with account-confirmed equivalents.
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", gender: "male", tags: ["american", "dominant", "firm", "commanding", "deep"] },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric", gender: "male", tags: ["american", "smooth", "clipped", "cold", "trustworthy"] },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", gender: "male", tags: ["american", "deep", "confident", "energetic"] },
  { id: "SOYHLrjzK2X1ezoPC6cr", name: "Harry", gender: "male", tags: ["american", "fierce", "intense", "harsh", "warrior"] },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", gender: "male", tags: ["american", "laid-back", "casual", "resonant", "low"] },
  // Female — additions (account-confirmed). Substitutes for the spec's Gigi /
  // Dorothy, which are not on this account.
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", gender: "female", tags: ["american", "quirky", "expressive", "young", "light"] },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", gender: "female", tags: ["british", "knowledgeable", "professional", "clear", "pleasant"] },
]

/** Fallbacks used only when a voice cannot be resolved. None of these may be a
 *  voice assigned to a named NPC, or the unresolved cast collides with canon. */
export const DEFAULT_NPC_VOICE_ID = "XB0fDUnXU5powFXDhCwa" // Charlotte — unassigned
export const DEFAULT_MALE_VOICE_ID = "pNInz6obpgDQGcFmaJgB" // Adam — unassigned, account-verified
export const DEFAULT_FEMALE_VOICE_ID = "XB0fDUnXU5powFXDhCwa" // Charlotte — unassigned

// Distinctive timbre words carry more signal than generic descriptors.
const TIMBRE_KEYWORDS = new Set(["gravelly", "raspy", "husky", "low", "deep", "hoarse", "weathered", "commanding", "clipped"])

// Body and species words imply timbre: big things sound low, small things sound light.
const SIZE_KEYWORDS = new Set([
  "hulking", "massive", "huge", "large", "barrel-chested", "burly", "towering",
  "tiny", "small", "wiry", "slight", "childlike", "young", "little",
])

// Map species → implied vocal qualities, appended to the description before scoring.
const SPECIES_TIMBRE: Record<string, string[]> = {
  orc: ["deep", "gravelly", "hoarse", "low"],
  quaggoth: ["deep", "low", "commanding"],
  dwarf: ["gravelly", "low", "weathered"],
  gnome: ["light", "quick", "raspy"],
  svirfneblin: ["light", "quick", "raspy"],
  myconid: ["soft", "gentle", "young"],
  "kuo-toa": ["deep", "calm", "narration"],
  derro: ["old", "gravelly", "weathered"],
  drow: ["clipped", "cold", "commanding", "smooth"],
  duergar: ["gravelly", "low", "harsh"],
}

/**
 * Pick the closest ElevenLabs premade voice for a free-text voice description.
 * Gender in the description (female/woman/she vs male/man/he) hard-filters the
 * candidate pool so we never cross genders; remaining voices are scored by
 * keyword overlap with timbre words weighted 2x. Deterministic: the same
 * description always resolves to the same voice id.
 */
export interface VoiceResolution {
  /** The voice id to speak with (always populated). */
  voiceId: string
  /**
   * True ONLY when voiceId was genuinely matched from a non-empty description
   * via keyword/timbre overlap. When false, voiceId is a generic fallback
   * default and MUST NOT be persisted back to the database as canon.
   */
  matchedFromDescription: boolean
}

/**
 * Match-aware voice resolution. Returns both the chosen voice id and whether it
 * was a genuine keyword match. Callers use `matchedFromDescription` to decide
 * whether the result is safe to persist as the NPC's canon voice — a generic
 * default fallback (empty description, or a description with zero keyword
 * overlap) must never be written back.
 */
export function resolveVoice(description?: string | null): VoiceResolution {
  // No description at all → generic default, never persist.
  if (!description || !description.trim()) {
    return { voiceId: DEFAULT_NPC_VOICE_ID, matchedFromDescription: false }
  }
  let desc = description.toLowerCase()

  let genderFilter: "female" | "male" | null = null
  if (/\b(female|woman|women|she|her|girl|lady|matron)\b/.test(desc)) genderFilter = "female"
  else if (/\b(male|man|men|\bhe\b|his|boy|guy)\b/.test(desc)) genderFilter = "male"

  // Enrich the description with implied timbre for any species word present, so
  // "hulking male orc" resolves sensibly even without explicit timbre words.
  for (const [species, qualities] of Object.entries(SPECIES_TIMBRE)) {
    if (desc.includes(species)) desc += " " + qualities.join(" ")
  }

  const candidates = genderFilter
    ? ELEVEN_VOICE_LIBRARY.filter((v) => v.gender === genderFilter)
    : ELEVEN_VOICE_LIBRARY

  let best: { id: string; score: number } | null = null
  for (const voice of candidates) {
    let score = 0
    for (const tag of voice.tags) {
      if (desc.includes(tag)) {
        // Timbre and size/build words both carry 2× weight over generic tags.
        score += TIMBRE_KEYWORDS.has(tag) || SIZE_KEYWORDS.has(tag) ? 2 : 1
      }
    }
    if (!best || score > best.score) best = { id: voice.id, score }
  }

  // Zero keyword overlap → the description told us nothing matchable, so return
  // a gender-appropriate default that is NOT any named NPC's canon voice. Treat
  // this as a NON-match so it is used one-off but never persisted.
  if (!best || best.score === 0) {
    const fallback =
      genderFilter === "male" ? DEFAULT_MALE_VOICE_ID
      : genderFilter === "female" ? DEFAULT_FEMALE_VOICE_ID
      : DEFAULT_NPC_VOICE_ID
    return { voiceId: fallback, matchedFromDescription: false }
  }
  return { voiceId: best.id, matchedFromDescription: true }
}

/**
 * Backwards-compatible thin wrapper returning just the voice id. Prefer
 * `resolveVoice` when you need to know whether the result is safe to persist.
 */
export function resolveVoiceFromDescription(description?: string | null): string {
  return resolveVoice(description).voiceId
}
