// Which combat theme opens the next fight.
//
// Split out of dynamic-music.tsx so it can be exercised without mounting a
// React component that imports lucide, the audio prefs and the manifest. The
// rule it encodes is small but easy to get wrong, and the failure mode is one
// nobody files a bug for — the fights just start to blur together.

/**
 * Every combat theme cleared for general rotation.
 *
 * This used to be two tracks and a coin flip, which gave a 50% chance of
 * hearing the same theme two fights running — exactly the fatigue the coin
 * flip was meant to prevent. Adding an id here is the whole cost of adding
 * variety; nothing downstream needs to change.
 *
 * "the-pen-erupts" was sitting in MUSIC_LIBRARY unreferenced and is now in the
 * rotation. All three are commissioned, written for the Underdark, and levelled
 * to -27 LUFS, so any of them can open any fight without a volume jump.
 *
 * Deliberately NOT here: "there-be-dragons" and "ice-dragon". Both are
 * boss-specific and both arrived at Tabletop Audio's own loudness rather than
 * this library's -27 LUFS, so dropping one into an ordinary skirmish would be
 * wrong twice over — tonally, and physically louder than the fight deserves.
 * Pin them to a location pool (as `village` pins "burning-village") when there
 * is an actual dragon.
 */
export const COMBAT_ROTATION = [
  // Commissioned, already in the bucket.
  "steel-in-the-dark",
  "the-drow-descend",
  "the-pen-erupts",
  // Generated 2026-09-27 (ElevenLabs), levelled to -27.5 LUFS and loop-trimmed.
  // Seven tracks puts a repeat seven fights away instead of three.
  "the-hunt",
  "weight-of-stone",
  "nothing-left",
  "wrong-shapes",
] as const

/**
 * The id every location pool references as its shared battle track, and what a
 * caller that passes no explicit pick gets. Rotation works by overriding this,
 * never by rewriting the pools.
 */
export const DEFAULT_COMBAT_TRACK: string = COMBAT_ROTATION[0]

export const COMBAT_BAG_KEY = "aop_combat_bag"
export const COMBAT_LAST_KEY = "aop_combat_last"

/** The two storage reads/writes this needs, so a test can hand in a fake. */
export interface BagStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function browserStore(): BagStore | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Deal the next combat theme from a shuffle bag rather than rolling for it.
 *
 * Every track is dealt once before the bag refills, and the refill drops
 * whatever just played, so the seam between one bag and the next cannot repeat
 * either. With three tracks a repeat is at best three fights away.
 *
 * The bag lives in localStorage, not React state, because DynamicMusic
 * REMOUNTS on every route change — dashboard to /battle and back is two
 * remounts — and per-mount state would re-randomise each time and put the coin
 * flip straight back. localStorage also carries the bag across a reload and
 * across sessions, so reopening the tab doesn't replay last night's theme.
 *
 * Storage is best-effort: with it blocked or absent (SSR) the caller still gets
 * a valid track, just without the no-repeat guarantee. This must never throw on
 * the way into a fight.
 */
export function nextCombatTrackId(
  pool: readonly string[] = COMBAT_ROTATION,
  store: BagStore | null = browserStore(),
  random: () => number = Math.random,
): string {
  if (pool.length === 0) return DEFAULT_COMBAT_TRACK
  if (pool.length === 1) return pool[0]

  let bag: string[] = []
  let last = ""
  if (store) {
    try {
      const raw = store.getItem(COMBAT_BAG_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) bag = parsed.filter((id): id is string => typeof id === "string")
      last = store.getItem(COMBAT_LAST_KEY) || ""
    } catch {
      // Unparseable or hand-edited. Fall through to a fresh bag.
      bag = []
      last = ""
    }
  }

  // Drop anything no longer in the rotation, so removing a track from
  // COMBAT_ROTATION takes effect on the next fight instead of waiting for the
  // bag to drain.
  bag = bag.filter((id) => pool.includes(id))

  if (bag.length === 0) {
    bag = pool.filter((id) => id !== last)
    if (bag.length === 0) bag = [...pool]
  }

  const pick = bag[Math.floor(random() * bag.length)] ?? bag[0]

  if (store) {
    try {
      store.setItem(COMBAT_BAG_KEY, JSON.stringify(bag.filter((id) => id !== pick)))
      store.setItem(COMBAT_LAST_KEY, pick)
    } catch {
      // A failed write costs the no-repeat guarantee, not the music.
    }
  }
  return pick
}
