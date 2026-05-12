import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { composeNarratorPrompt, ASHES_OF_PROMETHEUS_PROMPT, type NarratorContext } from '@/lib/personas/lich-dm'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { playerInput, context, gameState } = await req.json() as {
      playerInput: string
      context?: string
      gameState?: { currentScene?: string; playerName?: string }
    }

    // Build context for the narrator
    const narratorContext: NarratorContext = {
      currentScene: gameState?.currentScene || 'Throne Room',
      recentHistory: context ? [context] : [],
    }

    // Compose the full system prompt with persona + campaign + context
    const systemPrompt = composeNarratorPrompt({
      campaignSystemPrompt: ASHES_OF_PROMETHEUS_PROMPT,
      campaignKind: 'fantasy',
      context: narratorContext,
    })

    // Use Claude for the Lich's voice
    const result = await generateText({
      model: anthropic('claude-3-5-sonnet-20241022'),
      system: systemPrompt,
      prompt: playerInput,
      temperature: 0.8,
      maxTokens: 1024,
    })

    return Response.json({ response: result.text })
  } catch (error) {
    console.error('Narrator API error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to generate response', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
