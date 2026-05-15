import { streamText, convertToModelMessages, tool } from 'ai'
import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

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
      tools: {
        updateEnvironment: tool({
          description: 'Update the current environment/location when the scene changes. Use this when describing a new location, time change, or significant environmental shift.',
          parameters: z.object({
            name: z.string().describe('The name of the location (e.g., "Thornwood Forest", "The Gilded Tavern", "Malachar\'s Sanctum")'),
            timeOfDay: z.enum(['Morning', 'Midday', 'Afternoon', 'Evening', 'Night']).describe('The current time of day'),
            description: z.string().describe('A brief atmospheric description of the environment'),
            backgroundImageUrl: z.string().optional().describe('URL to a background image for the scene (optional)'),
            fogOverlayUrl: z.string().optional().describe('URL to a fog/atmosphere overlay (optional)'),
            ambientAnimation: z.string().optional().describe('CSS animation class for ambient effects (optional)'),
          }),
          execute: async ({ name, timeOfDay, description, backgroundImageUrl, fogOverlayUrl, ambientAnimation }) => {
            try {
              const supabase = createAdminClient()
              
              // Upsert the environment (update if exists, create if not)
              const { data, error } = await supabase
                .from('environments')
                .upsert({
                  name,
                  time_of_day: timeOfDay,
                  description,
                  background_image_url: backgroundImageUrl || null,
                  fog_overlay_url: fogOverlayUrl || null,
                  ambient_animation: ambientAnimation || null,
                  updated_at: new Date().toISOString(),
                }, {
                  onConflict: 'name',
                })
                .select()
                .single()
              
              if (error) {
                console.error('[World AI] Environment update error:', error)
                return { success: false, error: error.message }
              }
              
              return { success: true, environment: data }
            } catch (err) {
              console.error('[World AI] Environment update exception:', err)
              return { success: false, error: 'Failed to update environment' }
            }
          },
        }),
      },
      maxSteps: 3, // Allow tool use and follow-up
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

ENVIRONMENT TOOL — IMPORTANT: When the scene changes location, time of day shifts, or significant environmental changes occur, use the updateEnvironment tool to update the player's visual display. This keeps the avatar scene synchronized with your narration. Use it for:
- Entering a new area ("You step into the ancient crypt...")
- Time passing ("Hours pass as you travel... night falls")
- Major atmosphere changes ("The fog thickens around you...")
- Dramatic reveals ("As the illusion fades, you see Malachar's true sanctum")

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
