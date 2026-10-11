// Lines that something other than DM Narration has already said aloud.
//
// Map talk (Sam, 2026-10-11): when an NPC who wanted a word arrives on the dashboard, their opener is
// written into the shared log (so the conversation visibly starts with them, and Malachar sees it) and
// spoken once in their voice by the dashboard itself. DM Narration watches the same log and would say
// it a second time. The dashboard marks the line here first; DM Narration takes the mark and skips it.
//
// Keyed by speaker + text, like DM Narration's own memory. Each mark is used once.

const marks = new Map<string, number>()
const key = (speaker: string, text: string) => `${speaker.trim().toLowerCase()}\u0000${text.trim()}`

export function markVoicedElsewhere(speaker: string, text: string): void {
  const k = key(speaker, text)
  marks.set(k, (marks.get(k) ?? 0) + 1)
}

/** True (and the mark is used up) when this line was already spoken by someone else. */
export function takeVoicedElsewhere(speaker: string, text: string): boolean {
  const k = key(speaker, text)
  const n = marks.get(k) ?? 0
  if (!n) return false
  if (n === 1) marks.delete(k)
  else marks.set(k, n - 1)
  return true
}
