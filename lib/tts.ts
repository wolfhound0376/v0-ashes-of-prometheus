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
]

/** The Malachar lich voice — also the ultimate fallback for NPCs. */
export const DEFAULT_NPC_VOICE_ID = "pFZP5JQG7iQjIQuC4Bku" // Lily

// Distinctive timbre words carry more signal than generic descriptors.
const TIMBRE_KEYWORDS = new Set(["gravelly", "raspy", "husky", "low", "deep", "hoarse", "weathered", "commanding", "clipped"])

/**
 * Pick the closest ElevenLabs premade voice for a free-text voice description.
 * Gender in the description (female/woman/she vs male/man/he) hard-filters the
 * candidate pool so we never cross genders; remaining voices are scored by
 * keyword overlap with timbre words weighted 2x. Deterministic: the same
 * description always resolves to the same voice id.
 */
export function resolveVoiceFromDescription(description?: string | null): string {
  if (!description) return DEFAULT_NPC_VOICE_ID
  const desc = description.toLowerCase()

  let genderFilter: "female" | "male" | null = null
  if (/\b(female|woman|women|she|her|girl|lady|matron)\b/.test(desc)) genderFilter = "female"
  else if (/\b(male|man|men|\bhe\b|his|boy|guy)\b/.test(desc)) genderFilter = "male"

  const candidates = genderFilter
    ? ELEVEN_VOICE_LIBRARY.filter((v) => v.gender === genderFilter)
    : ELEVEN_VOICE_LIBRARY

  let best: { id: string; score: number } | null = null
  for (const voice of candidates) {
    let score = 0
    for (const tag of voice.tags) {
      if (desc.includes(tag)) score += TIMBRE_KEYWORDS.has(tag) ? 2 : 1
    }
    if (!best || score > best.score) best = { id: voice.id, score }
  }
  // If nothing matched at all, fall back to the first candidate of the right
  // gender (or the global default) so a voice is always chosen.
  if (!best || best.score === 0) {
    return candidates[0]?.id ?? DEFAULT_NPC_VOICE_ID
  }
  return best.id
}
