// The bridge between Malachar naming a moment and the dashboard rolling film.
//
// /api/chat returns a validated cue name (see the CINEMATIC CUES block in the
// narrator prompt); the dashboard owns the cinematic overlay. They sit in
// different component trees, so rather than thread a prop through every layer
// between them the cue travels as a same-window CustomEvent — the pattern
// already used by lib/dm-key.ts and lib/audio-prefs.ts.
//
// This carries the cue NAME only. Whether film exists for it, whether this
// character has already seen it, and whether it is a solo or party moment are
// all decided by /api/cinematics — never here.

const EVENT = "aop-cinematic-cue"

export type CinematicCue = { state: string }

/** Announce that Malachar cued a filmed moment this turn. */
export function emitCinematicCue(state: string): void {
  if (typeof window === "undefined") return
  const trimmed = (state || "").trim()
  if (!trimmed) return
  try {
    window.dispatchEvent(new CustomEvent<CinematicCue>(EVENT, { detail: { state: trimmed } }))
  } catch {
    /* no CustomEvent support — the turn continues without film */
  }
}

/** Subscribe to cues. Returns an unsubscribe function. */
export function onCinematicCue(fn: (cue: CinematicCue) => void): () => void {
  if (typeof window === "undefined") return () => {}
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<CinematicCue>).detail
    if (detail?.state) fn(detail)
  }
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
