// Shared types + resolution logic for the media_manifest catalog.
//
// The manifest holds WHICH asset belongs to WHICH pool/slot (data). The
// location-string -> pool matching is LOGIC and stays here so it can evolve
// without a data migration. dynamic-music reads the manifest first and falls
// back to the hardcoded MUSIC_LIBRARY when the manifest is empty/unreachable.

export type MusicMood = "ambient" | "tense" | "combat"

/** A single music row as returned by /api/media-manifest?kind=music. */
export interface ManifestTrack {
  id: string
  name: string
  url: string
  pool: string | null
  slot: string | null // 'base' | 'tense' | 'combat'
  mood: string[]
}

export interface ManifestMusicSelection {
  track: ManifestTrack
  poolLabel: string
  mood: MusicMood
}

// Location string -> pool label. First match wins. These labels must line up
// with the `pool` values seeded into media_manifest (kind='music'). Mirrors the
// hardcoded LOCATION_POOLS so manifest and fallback behave identically.
export const MUSIC_POOL_PATTERNS: { label: string; match: RegExp }[] = [
  { label: "prison", match: /slave pen|\bjail\b|\bcell\b|prison|captiv|manacl/i },
  { label: "velkynvelve", match: /velkynvelve|outpost|drow|spider/i },
  { label: "sewer", match: /sewer/i },
  { label: "underdark", match: /tunnel|underdark|cavern|\bcave\b|abyss|wastes|deep|darklake/i },
  { label: "shadowfell", match: /shadowfell|shadow realm/i },
  { label: "forest", match: /forest|wood|grove|fey/i },
  { label: "temple", match: /temple|shrine|altar/i },
  { label: "tavern", match: /tavern|\binn\b|hearth/i },
  { label: "village", match: /town|village|market|hamlet/i },
  { label: "tomb", match: /tomb|crypt|grave|barrow/i },
  { label: "court", match: /throne|court|palace|castle/i },
]

// Pool used when combat starts and the matched location pool has no combat slot.
export const COMBAT_DEFAULT_POOL = "combat_default"
// Pool used when no location pool matches (neutral dark-ambient baseline).
export const NEUTRAL_DEFAULT_POOL = "neutral"

function pickSlot(tracks: ManifestTrack[], pool: string, slot: MusicMood): ManifestTrack | undefined {
  const slotKey = slot === "ambient" ? "base" : slot
  const inPool = tracks.filter((t) => t.pool === pool)
  if (inPool.length === 0) return undefined
  // Prefer exact slot, then 'base', then anything in the pool.
  return (
    inPool.find((t) => (t.slot ?? "base") === slotKey) ||
    inPool.find((t) => (t.slot ?? "base") === "base") ||
    inPool[0]
  )
}

/**
 * Resolve a track from the manifest using the same hierarchy as the hardcoded
 * engine: location selects a pool, mood/combat picks the slot within it.
 * Returns null when the manifest has nothing usable so the caller can fall
 * back to the static MUSIC_LIBRARY.
 */
export function resolveMusicFromManifest(
  tracks: ManifestTrack[],
  location: string | null | undefined,
  inCombat: boolean,
  mood: MusicMood = "ambient",
): ManifestMusicSelection | null {
  if (!tracks || tracks.length === 0) return null

  const effectiveMood: MusicMood = inCombat ? "combat" : mood
  const loc = (location || "").trim()

  if (loc) {
    for (const pattern of MUSIC_POOL_PATTERNS) {
      if (!pattern.match.test(loc)) continue

      // Try the matched pool at the requested mood slot.
      let track = pickSlot(tracks, pattern.label, effectiveMood)

      // Combat with no combat track in this pool -> shared combat pool.
      if (!track && effectiveMood === "combat") {
        track = pickSlot(tracks, COMBAT_DEFAULT_POOL, "combat")
      }
      // Tense with no tense track -> base of the same pool.
      if (!track && effectiveMood === "tense") {
        track = pickSlot(tracks, pattern.label, "ambient")
      }
      if (track) return { track, poolLabel: pattern.label, mood: effectiveMood }
      break // pool matched but empty; drop to neutral below
    }
  }

  // No location / unmapped / empty pool -> neutral (or shared combat) default.
  const fallbackPool = effectiveMood === "combat" ? COMBAT_DEFAULT_POOL : NEUTRAL_DEFAULT_POOL
  const track =
    pickSlot(tracks, fallbackPool, effectiveMood) ||
    pickSlot(tracks, NEUTRAL_DEFAULT_POOL, "ambient")
  if (track) return { track, poolLabel: fallbackPool, mood: effectiveMood }

  return null
}
