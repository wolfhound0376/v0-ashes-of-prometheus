// The pacing of a hand writing with a quill.
//
// Sam, 2026-09-29: "Whenever something is written into the journal. It is
// scribbled with a quill animation."
//
// Pure, and separate from the component that draws it, because the thing that
// decides whether this reads as a hand or as a teletype is entirely the
// TIMING — and timing is the part worth testing. A constant delay per
// character is what every typewriter effect on the web does, and it is the
// reason they all read as machines.
//
// WHAT MAKES IT LOOK WRITTEN RATHER THAN TYPED
//
// A hand does not move at a constant rate. It:
//   - slows at the end of a sentence, where the nib lifts
//   - takes a shorter breath at a comma or a dash
//   - moves fastest through the middle of a word and hesitates at a space,
//     where the pen actually travels furthest without leaving ink
//   - varies stroke to stroke, never metronomically
//
// All four are here. The jitter is SEEDED rather than Math.random so the same
// page always writes the same way — a re-render must not restart into a
// different rhythm, and a test needs a rhythm it can assert.

/** Base cost of one ordinary letter, in milliseconds. */
export const BASE_MS = 17

/** A space: the nib travels without touching, so it is quick. */
export const SPACE_MS = 9

/** The nib lifting at the end of a thought. */
export const SENTENCE_MS = 260

/** A shorter breath. */
export const CLAUSE_MS = 90

/** A new line is a new stroke of the hand, and the longest pause of all. */
export const LINE_MS = 340

/**
 * No page may take longer than this to write, however long it is.
 *
 * Without a cap, a 600-character page at a believable hand-speed takes about
 * twelve seconds, and nobody watches a UI for twelve seconds — they scroll
 * away and come back to a half-written page, which looks broken rather than
 * atmospheric. Long pages are scaled down until they fit, keeping the SHAPE of
 * the rhythm (the pauses stay proportionally longer) while the whole runs
 * faster, which is exactly what a scribe in a hurry does.
 */
export const MAX_TOTAL_MS = 3600

/** Cheap deterministic hash → 0..1, so the same text always writes the same way. */
function seeded(i: number, seed: number): number {
  let x = (i + 1) * 374761393 + seed * 668265263
  x = (x ^ (x >>> 13)) >>> 0
  x = Math.imul(x, 1274126177) >>> 0
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

function seedOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** The unscaled cost of the character at `i`. */
function rawDelay(text: string, i: number, seed: number): number {
  const ch = text[i]
  if (ch === "\n") return LINE_MS

  // The pause belongs to the character AFTER the punctuation, not the
  // punctuation itself — the nib stops once the full stop is down, not before
  // it. Getting this backwards makes the text stutter a beat early and reads
  // as lag rather than as a hand.
  //
  // This is computed BEFORE the space branch, and a test is the only reason it
  // is: the first version returned early for a space, and since a full stop is
  // almost always followed by one, the sentence pause never fired at all. The
  // effect ran as a flat metronome and looked it.
  const prev = i > 0 ? text[i - 1] : ""
  let extra = 0
  if (/[.!?]/.test(prev)) extra = SENTENCE_MS
  else if (/[,;:—–]/.test(prev)) extra = CLAUSE_MS

  // A space: the nib travels without touching, so the stroke itself is quick —
  // but it still carries any pause the punctuation before it earned.
  if (ch === " ") return SPACE_MS + seeded(i, seed) * 6 + extra

  // Stroke-to-stroke variance. ±45% is enough to break the metronome and
  // little enough that it never looks like stalling.
  const jitter = 0.55 + seeded(i, seed) * 0.9
  return BASE_MS * jitter + extra
}

export interface ScribeOptions {
  /** Cap for the whole page. Defaults to MAX_TOTAL_MS. */
  maxTotalMs?: number
  /** Speed multiplier — 2 writes at double speed. Defaults to 1. */
  rate?: number
}

/**
 * Per-character delays, in order, already scaled to fit the cap.
 *
 * `delays[i]` is how long to wait BEFORE revealing character `i`, so the first
 * entry is the pause before the nib touches the page at all.
 */
export function scribeDelays(text: string, opts: ScribeOptions = {}): number[] {
  const s = text ?? ""
  if (!s.length) return []
  const seed = seedOf(s)
  const raw: number[] = new Array(s.length)
  let total = 0
  for (let i = 0; i < s.length; i++) {
    raw[i] = rawDelay(s, i, seed)
    total += raw[i]
  }

  const cap = Math.max(1, opts.maxTotalMs ?? MAX_TOTAL_MS)
  const rate = opts.rate && opts.rate > 0 ? opts.rate : 1
  const scale = Math.min(1, cap / total) / rate
  return raw.map((d) => d * scale)
}

/** How long the whole page takes to write, in milliseconds. */
export function scribeDuration(text: string, opts: ScribeOptions = {}): number {
  return scribeDelays(text, opts).reduce((a, b) => a + b, 0)
}

/**
 * How many characters are on the page at `elapsed` milliseconds.
 *
 * Driven by elapsed time rather than by counting frames, so a dropped frame or
 * a backgrounded tab costs nothing: the page catches up to where the hand
 * should be instead of finishing late.
 */
export function charsWritten(delays: readonly number[], elapsed: number): number {
  if (elapsed <= 0) return 0
  let t = 0
  for (let i = 0; i < delays.length; i++) {
    t += delays[i]
    if (t > elapsed) return i
  }
  return delays.length
}

/**
 * The tail of freshly-laid ink, which is still wet and darker.
 *
 * Only the last few characters: iron gall darkens as it oxidises over hours,
 * not seconds, so this is the sheen of the wet stroke rather than real
 * chemistry — and past about six characters it stops reading as a wet nib and
 * starts reading as a highlight bug.
 */
export const WET_TAIL = 6

export function wetRange(written: number, total: number): { from: number; to: number } {
  if (written <= 0 || written >= total) return { from: 0, to: 0 }
  return { from: Math.max(0, written - WET_TAIL), to: written }
}
