import { NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createAdminClient } from "@/lib/supabase/admin"
import { chooseLineLanguage, loadNpcLanguages } from "@/lib/npc-languages"
import { findNpcRow, npcKnowsName, relationshipSummary } from "@/lib/npc-acquaintance"

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
    // what just happened, when the NPC is opening because of it (the map: guards and Ilvara caught a hero sneaking)
    const situation = clip(body?.situation, 240)
    const pc = body?.pc ?? {}
    const pcName = clip(pc.name, 60) || "the prisoner"
    const pcRace = clip(pc.race, 30)
    const pcClass = clip(pc.cls, 30)

    // What this NPC really knows and feels (lib/npc-acquaintance.ts): the name only once it was told,
    // the standing from the gravity system, the personality from their own row.
    let knowsName = false
    let standing: string | null = null
    let personality = ""
    let lang: string | null = null
    try {
      const db = createAdminClient()
      const npcRow = await findNpcRow(db, npcName)
      if (npcRow) personality = [npcRow.description, npcRow.disposition ? `disposition: ${npcRow.disposition}` : ""].filter(Boolean).join("; ")
      const { data: pcRows } = await db.from("characters").select("id, name, languages").ilike("name", pcName).limit(1)
      const pcRow = pcRows?.[0]
      // The tongue the opener is spoken in (lib/npc-languages): what the NPC shares
      // with this PC, else its own. null when the NPC has no language data.
      if (npcRow?.id) {
        const npcLangs = await loadNpcLanguages(db, [npcRow.id])
        lang = chooseLineLanguage({ speaker: npcLangs.get(npcRow.id) ?? null, addressee: pcRow?.languages ?? null })
      }
      if (pcRow) {
        knowsName = await npcKnowsName(db, npcName, pcRow.id)
        if (npcRow) standing = await relationshipSummary(db, npcRow.id, pcRow.id)
      }
    } catch (e) {
      console.error("[npc-opener] acquaintance lookup failed:", e)
    }

    const prompt = `You are Malachar, the lich who narrates an Out of the Abyss D&D 5e campaign: theatrical, sly, darkly funny, a little cruel.
Write how one NPC opens a conversation with a player character.
Scene: ${area} in Velkynvelve, the drow outpost. The prisoners have shared the slave pen for several days.
NPC: ${brief}.
${situation ? `What just happened: ${situation} The line reacts to THAT, in character — a threat, a question, a demand; whether they attack is decided later in the conversation, so do not narrate an attack.` : ""}
Player character: ${pcName}${pcRace || pcClass ? `, a ${[pcRace, pcClass].filter(Boolean).join(" ")}` : ""}.
${personality ? `Their personality and manner: ${personality}.` : ""}
${knowsName ? `The NPC knows ${pcName}'s name and may use it.` : `The NPC does NOT know this character's name. Never say "${pcName}" or invent a name. Address them by what the NPC can see (that they are a ${pcRace || "stranger"}, how they look) or with a gesture.`}
${standing ? `How the NPC feels about them (trust, fear, respect, affection, debt, resentment): ${standing}. Let that set how warm, wary or cold the line is.` : "They have no history together yet: a fellow prisoner the NPC has noticed but does not know."}
The line is spoken in the NPC's own voice and manner, under 25 words.${lang && lang !== "Common" ? ` The NPC speaks it in ${lang}; write the words as they mean them (the game renders the foreign sound). The narration may say they speak in ${lang} but must not translate it.` : ""} Do not invent facts about the campaign.
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
    return NextResponse.json({ narration, line, lang })
  } catch (error) {
    console.error("[npc-opener] failed:", error)
    return NextResponse.json({ narration: null, line: null })
  }
}
