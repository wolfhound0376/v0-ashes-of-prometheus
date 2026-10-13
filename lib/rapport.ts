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
// The kuo-toa throat (Sam, 2026-10-13: "fish people and should sound nothing like a human"): the
// row's voice, played through a throat that isn't human — pitched down, a gurgle from the voice
// beating against a low tone, a fast flutter, a short hollow resonance (lib/rapport-voice.ts
// croakChain, setting B of the three Sam heard). Marked the same way so every player applies it.
export const CROAK_MIME = "audio/mpeg; profile=croak"
export type VoiceProfile = "rapport" | "croak" | null

/** Myconids and their sprouts. The sovereign and the circle will join this list when they are built. */
export function isRapportSpeaker(name: string | null | undefined): boolean {
  if (!name) return false
  const n = name.trim().toLowerCase()
  return n === "stool" || /\bmyconid\b/.test(n) || /\bbasidia\b/.test(n) || /\bphylo\b/.test(n)
}

export function isRapportAudio(blobOrType: Blob | string | null | undefined): boolean {
  return voiceProfileOf(blobOrType) === "rapport"
}

/** Kuo-toa: Shuushar, and any kuo-toa Malachar brings on. */
export function isCroakSpeaker(name: string | null | undefined): boolean {
  if (!name) return false
  const n = name.trim().toLowerCase()
  return n.startsWith("shuushar") || /\bkuo-?toa\b/.test(n)
}

export function voiceProfileFor(name: string | null | undefined): VoiceProfile {
  return isRapportSpeaker(name) ? "rapport" : isCroakSpeaker(name) ? "croak" : null
}

export function voiceProfileOf(blobOrType: Blob | string | null | undefined): VoiceProfile {
  const t = typeof blobOrType === "string" ? blobOrType : blobOrType?.type ?? ""
  return /profile=rapport/i.test(t) ? "rapport" : /profile=croak/i.test(t) ? "croak" : null
}

/** The character this browser plays (app/page.tsx keeps it in localStorage): the one who "hears" a rapport line. */
export function listenerCharacterId(): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem("aop_character_id") : null
  } catch {
    return null
  }
}
