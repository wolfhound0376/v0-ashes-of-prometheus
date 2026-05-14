import { streamText, convertToModelMessages } from 'ai'
import { type NextRequest } from 'next/server'

// World AI Chat API - D&D Campaign Engine powered by Claude
export async function POST(request: NextRequest) {
  try {
    const { messages, campaign } = await request.json()

    // Build the system prompt from campaign data
    const systemPrompt = campaign?.systemPrompt || getDefaultSystemPrompt()
    
    // Build context from campaign settings
    const contextInfo = campaign ? buildContextInfo(campaign) : ''
    const fullSystemPrompt = contextInfo 
      ? `${systemPrompt}\n\nCURRENT SESSION CONTEXT:\n${contextInfo}`
      : systemPrompt

    // Convert UI messages to model format
    const modelMessages = await convertToModelMessages(messages)

    // Stream response using Claude via AI Gateway
    const result = streamText({
      model: 'anthropic/claude-sonnet-4',
      system: fullSystemPrompt,
      messages: modelMessages,
      maxOutputTokens: 1024,
      temperature: 0.8, // Slightly creative for storytelling
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error('[World AI] Chat error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to generate response' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

function getDefaultSystemPrompt(): string {
  return `You are the World AI for a D&D 5E campaign. Be a fast, precise mid-session reference. Default to ONE paragraph. Never preamble.

DICE RULES — CRITICAL: NEVER fabricate roll results. If the user gives you a result, use exactly that number. To ask for a new roll, write [[XdY+Z]].

You help the DM by:
- Describing scenes vividly with sensory detail
- Voicing NPCs in character
- Rolling on encounter tables when asked
- Providing quick rule references
- Suggesting music cues
- Tracking NPC locations and motivations

Stay in character as the world. Be evocative but concise.`
}

function buildContextInfo(campaign: {
  name?: string
  currentEpisode?: string
  currentLocation?: string
  currentHeat?: string
}): string {
  const parts: string[] = []
  
  if (campaign.name) {
    parts.push(`Campaign: ${campaign.name}`)
  }
  if (campaign.currentEpisode) {
    parts.push(`Episode: ${campaign.currentEpisode}`)
  }
  if (campaign.currentLocation) {
    parts.push(`Location: ${campaign.currentLocation}`)
  }
  if (campaign.currentHeat) {
    parts.push(`Heat Level: ${campaign.currentHeat}`)
  }
  
  return parts.join('\n')
}
