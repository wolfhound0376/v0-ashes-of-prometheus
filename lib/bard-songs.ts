// ============================================================================
// BARD SONGS — what plays when a performance lands.
//
// Sam, 2026-09-29: "make songs available to the bard whenever he sings
// successfully without an instrument."
//
// Two halves to that sentence, and both are load-bearing:
//
//   SUCCESSFULLY — lib/camp's `perform()` already reads a CHA (Performance)
//     check as flat / warm / moving, and Sam ruled on 2026-09-26 that warm is
//     success. Nothing here re-decides that; this module is handed a band and
//     answers with a cue, or with null.
//
//   WITHOUT AN INSTRUMENT — every recording in the bucket is UNACCOMPANIED,
//     because the party are prisoners and the drow took their gear at
//     Velkynvelve. Scott's inventory at the time of writing is Rags plus the
//     issued journal and quill. A man with no lute singing over a lute would
//     be the one thing in this system that announces itself as a recording, so
//     carrying an instrument silences the pool rather than playing the wrong
//     take. When an accompanied set is cut, it slots in beside UNACCOMPANIED
//     and this function chooses between them — no call site changes.
//
// WHY THE CUE IS A BASE SLUG AND NOT A FILE
//
// `lib/sfx`'s pickVariant already pools `<base>.ogg` with `<base>_2.ogg`
// through `_4`, probes the bucket once, and avoids replaying the take it just
// played. So a cue of `bard/down-we-went` gets the two recorded takes for
// free, and a third take is an upload with no edit here — which is the same
// convention every sword blow in the game already follows.
//
// Sam, 2026-09-29, on which take plays: "lets just do it at random. The bard
// may sing the same song but just a little differently." The randomness
// between TAKES is pickVariant's; the randomness between SONGS is this
// module's.
// ============================================================================

import type { PerformanceBand } from "./camp"

/** Injected so tests are deterministic. Matches lib/camp's `Rng`. */
export type Rng = () => number

/**
 * The recorded repertoire, by the band that unlocks it.
 *
 * `flat` is deliberately absent rather than empty: a failed performance plays
 * nothing, and Malachar narrates the silence.
 *
 * Every slug here is a BASE — see the header. The takes behind it live at
 * `vtt-assets/sfx/bard/<slug>.ogg` and `<slug>_2.ogg`.
 */
export const UNACCOMPANIED: Readonly<Record<Exclude<PerformanceBand, "flat">, readonly string[]>> = {
  warm: ["sun-is-a-rumour", "count-the-spiders", "rothe-and-rot"],
  moving: ["down-we-went", "ashes-the-bards-song"],
}

/**
 * Item slugs that count as a musical instrument for this purpose.
 *
 * Checked by SLUG, not by `item_type`, because the catalog has no instrument
 * type — Lute, Flute and Horn are all filed as `gear` (verified against the
 * live `items` table, 2026-09-29). Slugs not in the catalog yet are listed
 * anyway so that adding the item is all it takes.
 *
 * `the-draakhorn` is deliberately NOT here. It is an artifact horn, and a
 * naive name match on "horn" would have caught it and silenced the bard for
 * carrying a piece of campaign plot.
 */
export const INSTRUMENT_SLUGS: ReadonlySet<string> = new Set([
  "lute", "flute", "horn", "lyre", "drum", "bagpipes", "dulcimer",
  "pan-flute", "shawm", "viol", "birdpipes", "zither", "glaur", "hand-drum",
])

/** True when any carried slug is a musical instrument. Nulls and junk ignored. */
export function carriesInstrument(slugs: readonly (string | null | undefined)[]): boolean {
  return slugs.some((s) => typeof s === "string" && INSTRUMENT_SLUGS.has(s.trim().toLowerCase()))
}

/**
 * The cue to play for a settled performance, or null for silence.
 *
 * Null on: a flat band, an instrument in hand (no accompanied take exists yet),
 * or an empty pool. Every one of those is a legitimate quiet night rather than
 * an error, so the caller simply pushes nothing.
 */
export function bardSongCue(
  band: PerformanceBand,
  carriedSlugs: readonly (string | null | undefined)[],
  rng: Rng = Math.random,
): string | null {
  if (band === "flat") return null
  if (carriesInstrument(carriedSlugs)) return null
  const pool = UNACCOMPANIED[band]
  if (!pool || pool.length === 0) return null
  const i = Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)))
  return `bard/${pool[i]}`
}
