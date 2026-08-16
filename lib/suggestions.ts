/**
 * Shared shape + parsing for per-player action suggestions. (PR-3)
 * Lives outside the route file because App Router route modules may only
 * export handlers — and the client chips import the Suggestion type too.
 */

export interface Suggestion {
  text: string
  skill: string | null
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
      suggestions.push({ text: text.slice(0, 80), skill })
      if (suggestions.length === 4) break
    }
    return suggestions.length >= 2 ? suggestions : []
  } catch {
    return []
  }
}
