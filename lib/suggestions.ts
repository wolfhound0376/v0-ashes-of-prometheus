/**
 * Shared shape + parsing for per-player action suggestions. (PR-3)
 * Lives outside the route file because App Router route modules may only
 * export handlers — and the client chips import the Suggestion type too.
 */

export interface Suggestion {
  text: string
  skill: string | null
  /**
   * "observe" marks the single look-around chip in a set. Picking it is the
   * ONLY thing that can trigger a scene cinematic — every other chip is
   * ordinary dialogue. Sam's ruling, 18 Aug 2026: the camera cue belongs
   * inside the fiction as something the character does, not as a meta-button
   * bolted on beside it.
   */
  kind?: "observe" | null
  /**
   * True when taking this action would put a page in the character's journal.
   * Surfaced on the chip as "(Journal Entry)" beside the skill, so a player can
   * see that an action leaves a permanent record before they pick it — the
   * same courtesy the skill tag already gives them.
   */
  journal?: boolean
}

/**
 * The deterministic look-around chip. Used when the model returns a set with
 * no observation action tagged — which it will, occasionally, however the
 * prompt is worded. The guarantee that one always exists is structural, not
 * a hope: the first look at a location is a once-per-character moment and it
 * cannot depend on Haiku remembering to offer the door.
 */
export const OBSERVE_FALLBACK: Suggestion = {
  text: "Take in your surroundings",
  skill: "Perception",
  kind: "observe",
}

/**
 * Normalise a set so it contains EXACTLY ONE observe chip, listed last.
 * Extra tagged entries are demoted to ordinary chips rather than dropped, so
 * a chatty model costs variety, never an action.
 */
export function ensureObserveChip(suggestions: Suggestion[]): Suggestion[] {
  const observe = suggestions.find((entry) => entry.kind === "observe")
  const others = suggestions
    .filter((entry) => entry !== observe)
    .map((entry) => ({ text: entry.text, skill: entry.skill, journal: entry.journal }))
  // Cap at four chips total so the row never wraps past the input box.
  return [...others.slice(0, 3), observe ?? OBSERVE_FALLBACK]
}

/** Strict-ish parse of the model reply: fenced or bare JSON array → 2–4 chips. */
export function parseSuggestions(raw: string): Suggestion[] {
  try {
    const jsonText = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    const match = jsonText.match(/\[[\s\S]*\]/)
    if (!match) return []
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []
    const suggestions: Suggestion[] = []
    for (const entry of parsed) {
      const text = typeof (entry as { text?: unknown })?.text === "string" ? (entry as { text: string }).text.trim() : ""
      if (!text) continue
      const skillRaw = (entry as { skill?: unknown })?.skill
      const skill = typeof skillRaw === "string" && skillRaw.trim() ? skillRaw.trim().slice(0, 30) : null
      // The model may answer either shape; accept both rather than lose the tag.
      const raw = entry as { observe?: unknown; kind?: unknown; journal?: unknown }
      const isObserve = raw?.observe === true || raw?.kind === "observe"
      suggestions.push({
        text: text.slice(0, 80),
        skill,
        kind: isObserve ? "observe" : null,
        journal: raw?.journal === true,
      })
      // Read up to six. ensureObserveChip trims to four AFTER the observe
      // entry has been located — capping at four here threw away a correctly
      // tagged look-around action that happened to be listed last, and the
      // player got the generic wording instead of their character's.
      if (suggestions.length === 6) break
    }
    return suggestions.length >= 2 ? suggestions : []
  } catch {
    return []
  }
}
