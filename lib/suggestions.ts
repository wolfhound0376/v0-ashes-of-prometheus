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
    .map((entry) => ({ text: entry.text, skill: entry.skill }))
  // Cap at four chips total so the row never wraps past the input box.
  return [...others.slice(0, 3), observe ?? OBSERVE_FALLBACK]
}

/** One row of the shared dialogue feed, as the chips see it. */
export interface ExchangeLine {
  id?: string
  speaker: string
  text: string
}

export type SpeakerKind = "dm" | "player" | "npc"

/** What the suggester is told about the moment, built from the feed. */
export interface SuggestionContext {
  /** Regeneration key: the id (or text) of the latest DM-or-NPC row. */
  beatKey: string | null
  /** The recent exchange, oldest first, "Speaker: text" per line. */
  sceneText: string
  /** Who the character is in conversation with, if anyone. */
  talkingTo: string | null
  /** Named NPCs who have just spoken or are on stage. */
  present: string[]
}

const EXCHANGE_MAX_LINES = 6
const EXCHANGE_MAX_CHARS = 1600

/**
 * Build the scene the suggester reasons from.
 *
 * The chat route splits one Malachar reply into separate rows — each quoted
 * NPC line is stored under the NPC's own name, and only the narration between
 * the quotes stays under "Malachar". So the "latest DM narration" is usually
 * the prose AROUND what an NPC said, never the line itself. Verified in the
 * `dialogue` table 2026-10-11: Eldeth's "That sound. It's been coming closer
 * every night" sat as its own row while the chips were built from the
 * Malachar row before it, which was about Jorlan at the gate — so a player
 * talking to Eldeth was offered "whistle to Jorlan".
 *
 * Two consequences this function fixes:
 *  - The beat is the latest DM-OR-NPC row, so an NPC speaking regenerates the
 *    chips, and the row they spoke is in the text the suggester reads.
 *  - The suggester sees the last few lines in order (player lines included,
 *    because they say who was addressed), plus who the character is talking
 *    to, so the options can engage THAT person.
 *
 * `classify` is injected rather than imported: lib/tts.ts holds browser-side
 * voice state and this helper must stay importable from the API route.
 */
export function buildSuggestionContext(
  dialogue: ExchangeLine[],
  classify: (speaker?: string | null) => SpeakerKind,
  opts: { talkWith?: string | null; onStage?: string | null } = {},
): SuggestionContext {
  const rows = dialogue.filter((row) => row.text?.trim())
  let beatIndex = -1
  for (let i = rows.length - 1; i >= 0; i--) {
    if (classify(rows[i].speaker) !== "player") {
      beatIndex = i
      break
    }
  }
  if (beatIndex < 0) return { beatKey: null, sceneText: "", talkingTo: null, present: [] }

  const beat = rows[beatIndex]
  const window = rows.slice(Math.max(0, beatIndex - (EXCHANGE_MAX_LINES - 1)), beatIndex + 1)

  // Oldest first, trimmed from the FRONT so the newest line always survives.
  const lines = window.map((row) => {
    const kind = classify(row.speaker)
    const who = kind === "dm" ? "Narration" : row.speaker.trim() || "Someone"
    return `${who}: ${row.text.trim()}`
  })
  while (lines.length > 1 && lines.join("\n").length > EXCHANGE_MAX_CHARS) lines.shift()
  const sceneText = lines.join("\n").slice(-EXCHANGE_MAX_CHARS)

  const npcSpeakers: string[] = []
  for (const row of window) {
    const name = row.speaker.trim()
    if (name && classify(name) === "npc" && !npcSpeakers.includes(name)) npcSpeakers.push(name)
  }
  const talkWith = (opts.talkWith ?? "").trim()
  const talkingTo = talkWith || [...npcSpeakers].reverse()[0] || null

  const present = [...npcSpeakers]
  const onStage = (opts.onStage ?? "").trim()
  if (onStage && !present.includes(onStage)) present.push(onStage)

  return { beatKey: beat.id ?? beat.text, sceneText, talkingTo, present }
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
      const raw = entry as { observe?: unknown; kind?: unknown }
      const isObserve = raw?.observe === true || raw?.kind === "observe"
      suggestions.push({ text: text.slice(0, 80), skill, kind: isObserve ? "observe" : null })
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
