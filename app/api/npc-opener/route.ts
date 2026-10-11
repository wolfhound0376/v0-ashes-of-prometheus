import { NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"

// Same direct-Anthropic provider as /api/chat and /api/suggestions.
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * The opening line an NPC says when they come up to talk on the painted map (/velkynvelve).
 *
 * Sam, 2026-10-11: "have them speak in their voice once talking to you directly by your name if they
 * know it, your race, or gestures (have the AI choose based on Malachar)". Malachar decides the manner;
 * the NPC speaks. Haiku, because this is one short line and it must arrive before the moment passes.
 *
 * The map sends who is talking (name plus the project's own one-line summary of them), where, and the
 * player character (name, species, class from the characters table). Nothing here invents campaign
 * facts: the prompt forbids it, and the line is flavour, not canon state — it is not written to the
 * dialogue log. The dashboard receives it as ?line= and voices it through /api/npc-tts.
 *
 * Failure is always HTTP 200 with nulls; the map falls back to a plain line.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "")
    const npcName = clip(body?.npcName, 60)
    if (!npcName) return NextResponse.json({ narration: null, line: null })
    const brief = clip(body?.brief, 200) || npcName
    const area = clip(body?.area, 60) || "Velkynvelve"
    const pc = body?.pc ?? {}
    const pcName = clip(pc.name, 60) || "the prisoner"
    const pcRace = clip(pc.race, 30)
    const pcClass = clip(pc.cls, 30)

    const prompt = `You are Malachar, the lich who narrates an Out of the Abyss D&D 5e campaign: theatrical, sly, darkly funny, a little cruel.
Write how one NPC opens a conversation with a player character.
Scene: ${area} in Velkynvelve, the drow outpost. The prisoners have shared the slave pen for several days.
NPC: ${brief}.
Player character: ${pcName}${pcRace || pcClass ? `, a ${[pcRace, pcClass].filter(Boolean).join(" ")}` : ""}.
Decide whether the NPC would know ${pcName}'s name by now. If yes, use it. If not, address them by their race or with a gesture.
The line is spoken in the NPC's own voice and manner, under 25 words. Do not invent facts about the campaign.
The narration is one short sentence, present tense, describing how the NPC approaches (no dialogue in it).
Reply with only JSON: {"narration": "...", "line": "..."}`

    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      messages: [{ role: "user", content: prompt }],
    })
    const m = result.text.match(/\{[\s\S]*\}/)
    const parsed = m ? JSON.parse(m[0]) : null
    const line = typeof parsed?.line === "string" ? parsed.line.trim().replace(/^["“]|["”]$/g, "").slice(0, 280) : null
    const narration = typeof parsed?.narration === "string" ? parsed.narration.trim().slice(0, 240) : null
    return NextResponse.json({ narration, line })
  } catch (error) {
    console.error("[npc-opener] failed:", error)
    return NextResponse.json({ narration: null, line: null })
  }
}
