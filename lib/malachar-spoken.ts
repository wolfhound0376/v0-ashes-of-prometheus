/**
 * How much of a Malachar line is read OUT LOUD.
 *
 * Sam, 2026-11-17, picking the new rotted-lich voice: "We need to make sure
 * that when Malachar speaks he's not talking too much or it'll seem strange."
 *
 * Measured the same night on the live dialogue table (last 10 days, 24 lines):
 * Malachar averaged 20 words, one line in ten ran past 36, the longest was 45.
 * The long ones were all scene description ("Six days on cold stone. The bar
 * was already here when you arrived…"). The new voice is slow and theatrical,
 * so a 45-word line is close to half a minute of one speaker.
 *
 * Two fixes, both in the same PR: the prompt asks for fewer words (app/api/chat
 * route, LENGTH block), and this is the guarantee behind it. The text on screen
 * is never touched; only the voice stops early.
 *
 * Rules:
 *   - Whole sentences only. A lich does not get cut off mid-word.
 *   - The first sentence is always spoken, however long it is.
 *   - After that, sentences are added while the total stays within the cap.
 */

/** Most words the voice reads of one Malachar line. */
export const SPOKEN_WORD_CAP = 25

const words = (s: string) => s.split(/\s+/).filter(Boolean).length

/** Split into sentences, keeping each one's closing punctuation and quote. */
export function sentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim()
  if (!flat) return []
  const parts = flat.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)/g) ?? [flat]
  return parts.map(p => p.trim()).filter(Boolean)
}

/** The part of a Malachar line that is spoken aloud. */
export function spokenLine(text: string, cap: number = SPOKEN_WORD_CAP): string {
  const all = sentences(text)
  if (all.length === 0) return ""
  const out = [all[0]]
  let n = words(all[0])
  for (const s of all.slice(1)) {
    const w = words(s)
    if (n + w > cap) break
    out.push(s)
    n += w
  }
  return out.join(" ")
}
