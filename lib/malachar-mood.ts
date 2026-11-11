// MALACHAR'S MOOD — what is on the DM's face while you talk to him.
//
// Sam, 2026-11-10 (Talk to Malachar): "He should be animated and laugh when something is funny, look annoyed at
// what might be perceived as a dumb question, mock you, or act indifferent. Eyes will occasionally glow red when
// he's angry like when we are doing too well."
//
// Malachar ends each reply with [MOOD: <one of five>]. /api/chat reads it, cuts it out of the prose before anything
// is stored or spoken, and returns the name; the Talk to Malachar screen plays the matching loop of the cartoon
// lich. A closed list, like [CINEMATIC:]: an unknown word is dropped, never shown. Delivery is the same-window
// event pattern lib/cinematic-cue.ts uses. It reaches the asking seat only, which is the only seat looking at him.

export const MALACHAR_MOODS = ["laughing", "annoyed", "mocking", "indifferent", "angry"] as const
export type MalacharMood = (typeof MALACHAR_MOODS)[number]

const TAG = /\[MOOD:\s*([^\]]*?)\s*\]/gi

/** The mood named in a reply (the last tag wins), or null when there is none or it is not one of the five. */
export function readMalacharMood(text: string): MalacharMood | null {
  let found: MalacharMood | null = null
  for (const m of String(text ?? "").matchAll(TAG)) {
    const word = (m[1] || "").trim().toLowerCase()
    const mood = MALACHAR_MOODS.find((x) => x === word)
    if (mood) found = mood
  }
  return found
}

/** The reply with every mood tag cut out, known word or not, and the blank line it sat on closed up. */
export function stripMalacharMood(text: string): string {
  return String(text ?? "").replace(TAG, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd()
}

/** The paragraph of the narrator prompt that asks for the tag. */
export const MALACHAR_MOOD_RULE = `MOOD: End EVERY response with exactly one tag on its own last line: [MOOD: laughing], [MOOD: annoyed], [MOOD: mocking], [MOOD: indifferent] or [MOOD: angry]. It is the look on your own face about what the player just said or did, and they will see it. laughing = it genuinely amused you (their failure, their nerve). annoyed = a question you find stupid or already answered. mocking = you are taunting them. angry = they are doing too well: outwitting you, your creatures or your plans. indifferent = anything else, and most turns. Never mention the tag or your face in the prose.`

const EVENT = "aop-malachar-mood"

export function emitMalacharMood(mood: string): void {
  if (typeof window === "undefined") return
  const known = MALACHAR_MOODS.find((x) => x === String(mood || "").trim().toLowerCase())
  if (!known) return
  try { window.dispatchEvent(new CustomEvent<{ mood: MalacharMood }>(EVENT, { detail: { mood: known } })) } catch { /* no CustomEvent: his face stays as it was */ }
}

export function onMalacharMood(fn: (mood: MalacharMood) => void): () => void {
  if (typeof window === "undefined") return () => {}
  const handler = (event: Event) => { const d = (event as CustomEvent<{ mood: MalacharMood }>).detail; if (d?.mood) fn(d.mood) }
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
