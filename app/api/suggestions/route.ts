import { NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { ensureObserveChip, parseSuggestions } from "@/lib/suggestions"

// Same direct-Anthropic provider as /api/chat — bypasses the Vercel AI Gateway.
const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * Per-player action suggestions. (PR-3)
 *
 * Given the latest narration beat and ONE character's sheet summary, ask Haiku
 * (extraction-flavored work — deliberately not Opus) for 2–4 diegetic action
 * suggestions. The client renders them as chips; clicking one sends the text
 * as that player's message through the normal player-message path.
 *
 * Cost note: the game caps at four players and each browser generates only for
 * its own selected character, so a narration beat costs at most four calls.
 *
 * Failure mode is always an empty list with HTTP 200 — the dashboard falls
 * back to its static quick replies and the table never sees an error.
 */

interface SuggestionPayload {
  character?: {
    name?: string
    class?: string
    level?: number
    skills?: string | null
    conditions?: string[] | null
  }
  inventory?: string[]
  sceneText?: string
  location?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SuggestionPayload
    const character = body.character
    const sceneText = (body.sceneText ?? "").trim()
    if (!character?.name || !character?.class || !sceneText) {
      return NextResponse.json({ suggestions: [] })
    }

    const items = Array.isArray(body.inventory)
      ? body.inventory.filter((name): name is string => typeof name === "string" && !!name.trim()).slice(0, 25)
      : []
    const conditions = Array.isArray(character.conditions) ? character.conditions.filter(Boolean) : []

    const prompt = `You suggest quick actions for ONE player in a D&D 5e game set in the Underdark (Out of the Abyss).

Return ONLY a JSON array, no prose, of 3 to 4 entries shaped:
  {"text": "...", "skill": "..." | null, "observe": true | false}

Rules:
- EXACTLY ONE entry must be an observation action — looking around, taking in
  the surroundings, studying the room — with "observe": true. Phrase it in this
  character's voice; it does not have to use the words "look around". Every
  other entry must have "observe": false.
- "text" is a diegetic action phrased as the player would say it, 60 characters or fewer. No dice notation, no rules jargon.
- "skill" names the single most relevant 5e skill, spell, or ability for the action, or null when none applies.
- Suggest only actions this character can plausibly take RIGHT NOW: use only the listed carried items and class abilities, and respect active conditions.
- Do NOT invent items the character does not carry. If they carry only rags, no gear-dependent actions.
- Vary the register: one bold, one cautious or observant, one social or clever where the scene allows.
- React to the scene beat below; do not restate it.

Scene (latest DM narration): ${sceneText.slice(-1200)}
Location: ${body.location ?? "Unknown"}
Character: ${character.name}, ${character.class} ${character.level ?? 1}
Skill proficiencies: ${character.skills || "none recorded"}
Active conditions: ${conditions.length ? conditions.join(", ") : "none"}
Carried items: ${items.length ? items.join(", ") : "nothing but rags"}`

    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      messages: [{ role: "user", content: prompt }],
    })

    // ensureObserveChip is the backstop: if the model ignored the observe rule
    // the deterministic chip is appended anyway. The look-around action is a
    // load-bearing game mechanic (it is what plays a location's cinematic), so
    // its presence is guaranteed here rather than left to the model.
    const parsed = parseSuggestions(result.text)
    // An empty parse must stay empty: the client reads [] as "generation
    // failed" and falls back to the four static chips, which carry their own
    // look-around. Returning a lone observe chip here would replace that whole
    // fallback row with a single button.
    return NextResponse.json({ suggestions: parsed.length ? ensureObserveChip(parsed) : [] })
  } catch (error) {
    console.error("[suggestions] generation failed:", error)
    return NextResponse.json({ suggestions: [] })
  }
}
