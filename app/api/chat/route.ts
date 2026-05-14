import { streamText } from "ai"
import { createClient } from "@/lib/supabase/server"
import { buildWorldContext, formatWorldContextForAI } from "@/lib/world-ai/world-context"
import { CAMPAIGNS } from "@/lib/world-ai/campaigns"

export async function POST(req: Request) {
  const { message, campaignId = "abyss" } = await req.json()
  
  const supabase = await createClient()
  const campaign = CAMPAIGNS[campaignId as keyof typeof CAMPAIGNS] || CAMPAIGNS.abyss
  
  // Get recent dialogue history for context (last 20 messages)
  const { data: recentDialogue } = await supabase
    .from("dialogue")
    .select("speaker, text")
    .order("created_at", { ascending: false })
    .limit(20)
  
  // Build world context with character data
  const worldContext = await buildWorldContext(
    campaignId,
    campaign.contexts.defaults.episode,
    campaign.contexts.locations[0],
    campaign.contexts.defaults.heat
  )
  const worldContextText = formatWorldContextForAI(worldContext)
  
  // Build conversation history for the AI
  const conversationHistory = (recentDialogue || [])
    .reverse()
    .map(d => ({
      role: d.speaker === "Malachar" ? "assistant" : "user" as const,
      content: `${d.speaker}: ${d.text}`
    }))
  
  // Save player message to dialogue
  await supabase.from("dialogue").insert({
    speaker: worldContext.characters[0]?.name || "Player",
    text: message,
    source: "player"
  })
  
  // The Lich Malachar system prompt
  const lichPrompt = `You are Malachar, a lich who serves as Dungeon Master. You speak with dark elegance, ancient wisdom, and subtle menace. You never break character.

${campaign.systemPrompt}

${worldContextText}

RULES:
- Address the player by their character name
- Reference their class abilities, stats, and inventory when relevant
- For dice rolls, write [[XdY+Z]] and wait for the player to roll
- Keep responses concise (1-3 paragraphs) unless describing important scenes
- Track their progress through the campaign
- When they acquire items, describe the transfer narratively`

  const result = streamText({
    model: "anthropic/claude-sonnet-4-20250514",
    system: lichPrompt,
    messages: [
      ...conversationHistory,
      { role: "user", content: message }
    ],
    onFinish: async ({ text }) => {
      // Save Malachar's response after streaming completes
      await supabase.from("dialogue").insert({
        speaker: "Malachar",
        text,
        source: "world_ai"
      })
    }
  })
  
  return result.toTextStreamResponse()
}
