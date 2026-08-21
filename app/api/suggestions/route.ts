import { NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { ensureObserveChip, parseSuggestions } from "@/lib/suggestions"
import { createAdminClient } from "@/lib/supabase/admin"

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

    // === FILMED MOMENTS ===
    // Some actions in a location have a cinematic shot for them. A player can
    // only reach one by DOING the thing, and until now they had to guess the
    // words — the film existed but nothing pointed at it.
    //
    // So the cue names are handed to the suggester as SUBJECT MATTER, not as
    // buttons. It renders them into ordinary in-character actions; the player
    // picks one; Malachar narrates it and emits the cue himself. The chip is
    // fiction the whole way down, which is Sam's standing rule (18 Aug 2026):
    // the camera cue belongs inside the fiction as something the character
    // does, never a meta-button bolted on beside it.
    //
    // Deliberately NOT filtered by what this character has already seen. A
    // filmed action is a good action either way, and filtering would turn the
    // chip row into a content checklist that empties as the scene is explored.
    let filmedMoments: string[] = []
    if (body.location) {
      try {
        const admin = createAdminClient()
        const { data: key } = await admin.rpc("scene_key", { p_name: body.location })
        if (key) {
          const { data: rows } = await admin
            .from("cinematic_clips")
            .select("state")
            .eq("kind", "action")
            .eq("scene_key", key as string)
            .not("state", "is", null)
            .not("video_url", "is", null)
            .gt("weight", 0)
          filmedMoments = Array.from(
            new Set((rows || []).map((r: { state: string | null }) => (r.state || "").trim()).filter(Boolean)),
          )
        }
      } catch (e) {
        // Chips must never fail on account of film. No list simply means the
        // suggester works exactly as it did before this feature existed.
        console.error("[suggestions] filmed-moment lookup failed:", e)
      }
    }

    const filmedBlock = filmedMoments.length
      ? `
Filmed moments available in this location: ${filmedMoments.join(", ")}.
These are hyphenated shorthand for things a character can DO here (for example
"sharpen-shard" means working an edge onto a shard). When ONE of them fits the
scene and this character naturally, make one of your non-observe entries that
action, written as ordinary in-character speech — never the shorthand itself,
never a hint that anything is filmed. If none fit the moment, ignore this list
entirely; a forced action is worse than none.`
      : ""

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
${filmedBlock}

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
