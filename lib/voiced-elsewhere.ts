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

// Lines DM Narration OWES the room, however early they land.
//
// Map talk (Sam, 2026-11-13: an NPC who prompted the talk "should immediately followup ... There shouldn't
// really be a pause"). The follow-up arrives with the page, so it is written into the log within a moment of
// the dashboard opening. DM Narration treats its first look at a non-empty log as history and says none of
// it — right for a backlog, wrong for the one line that was written a heartbeat ago and is the whole reason
// the page opened. The dashboard marks that line here; DM Narration says a marked line even on its first look.
// Each mark is used once.

const owed = new Map<string, number>()

export function markOwedAloud(speaker: string, text: string): void {
  const k = key(speaker, text)
  owed.set(k, (owed.get(k) ?? 0) + 1)
}

/** True (and the mark is used up) when this line must be spoken even on the first look at the log. */
export function takeOwedAloud(speaker: string, text: string): boolean {
  const k = key(speaker, text)
  const n = owed.get(k) ?? 0
  if (!n) return false
  if (n === 1) owed.delete(k)
  else owed.set(k, n - 1)
  return true
}
