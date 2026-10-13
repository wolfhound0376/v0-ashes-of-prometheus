// Rapport spores: how a myconid "talks".
//
// Sam's ruling, 2026-10-12: "Stool doesn't actually talk, spores get released and you should be able
// to hear them in your mind. It might sound like an altered version of your own voice, ethereal, and
// like that voice heard in a cave." So a myconid line is never rendered in a voice of its own: it is
// rendered in the LISTENER's saved ElevenLabs voice (the character the line is spoken to), and the
// player hears it through the rapport treatment (lib/rapport-voice.ts) — detuned against itself, a
// cave's tail on it, the top rolled off. No bubble either: it is a thought, not speech.
//
// The route marks such audio with `Content-Type: audio/mpeg; profile=rapport`, so every player that
// receives the blob (the dashboard's speech queue, the map) can apply the treatment without the callers
// having to thread a flag through.

export const RAPPORT_MIME = "audio/mpeg; profile=rapport"

/** Myconids and their sprouts. The sovereign and the circle will join this list when they are built. */
export function isRapportSpeaker(name: string | null | undefined): boolean {
  if (!name) return false
  const n = name.trim().toLowerCase()
  return n === "stool" || /\bmyconid\b/.test(n) || /\bbasidia\b/.test(n) || /\bphylo\b/.test(n)
}

export function isRapportAudio(blobOrType: Blob | string | null | undefined): boolean {
  const t = typeof blobOrType === "string" ? blobOrType : blobOrType?.type ?? ""
  return /profile=rapport/i.test(t)
}

/** The character this browser plays (app/page.tsx keeps it in localStorage): the one who "hears" a rapport line. */
export function listenerCharacterId(): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem("aop_character_id") : null
  } catch {
    return null
  }
}
