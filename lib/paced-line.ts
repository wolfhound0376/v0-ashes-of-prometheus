// ============================================================================
// THE STAGE LINE HOLDS LONG ENOUGH TO READ.
// ============================================================================
//
// Sam's playtest, 2026-11-15, point 1: "Dialogue with NPCs rapidly cycled which was distracting."
//
// The Parley's stage showed whatever line arrived last. A talk turn comes back as several rows in the same second
// (run 74, 17:09:04-05: Ront's "Hnh. Pretty words for a man in chains." / "...Huh." / "Small thing. Guess it did."),
// and with two players talking to one NPC their replies and Malachar's lines land on top of each other, so the stage
// flipped through three or four lines faster than anyone could read one.
//
// Now each stage line stays up for its reading time before the next one takes its place, in the order they were
// said. The stage never falls more than BEHIND_MAX lines behind the log: past that it skips ahead, so a burst cannot
// leave the table reading a conversation from a minute ago. The log itself is untouched; it already shows every line.
//
// Pure, so it is tested without React (lib/paced-line.test.ts).

/** [CLAUDE] Reading time: a floor, a quarter-second-plus per word, and a ceiling so a speech does not stall the stage. */
export const HOLD_MIN_MS = 2500
export const HOLD_PER_WORD_MS = 280
export const HOLD_MAX_MS = 8000
/** [CLAUDE] How many unread lines may queue before the stage skips ahead. */
export const BEHIND_MAX = 2

export function holdMs(text: string | null | undefined): number {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean).length
  return Math.min(HOLD_MAX_MS, Math.max(HOLD_MIN_MS, 1200 + words * HOLD_PER_WORD_MS))
}

export type PacedLine = { id: string; text: string }

/**
 * What the stage should show now, and how long until it should look again.
 * `shownId`/`shownAt` are what it shows and since when. Returns the id to show and `wait` (ms, Infinity = nothing queued).
 */
export function pacedStep(lines: PacedLine[], shownId: string | null, shownAt: number, now: number): { id: string | null; wait: number } {
  if (!lines.length) return { id: null, wait: Infinity }
  const last = lines.length - 1
  const idx = shownId == null ? -1 : lines.findIndex((l) => l.id === shownId)
  if (idx === -1) return { id: lines[last].id, wait: Infinity }        // first line, or the shown one left the log: the newest
  if (idx === last) return { id: shownId, wait: Infinity }             // up to date
  const due = shownAt + holdMs(lines[idx].text)
  if (now < due) return { id: shownId, wait: due - now }               // still being read
  const next = Math.max(idx + 1, last - BEHIND_MAX)                    // the next one, unless the queue is too long
  return { id: lines[next].id, wait: 0 }
}
