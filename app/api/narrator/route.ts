import { anthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'
import { composeNarratorPrompt, ASHES_OF_PROMETHEUS_PROMPT, type NarratorContext } from '@/lib/personas/lich-dm'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { messages, context } = await req.json() as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      context?: NarratorContext
    }

    // Compose the full system prompt with persona + campaign + context
    const systemPrompt = composeNarratorPrompt({
      campaignSystemPrompt: ASHES_OF_PROMETHEUS_PROMPT,
      campaignKind: 'fantasy',
      context,
    })

    // Use Claude for the Lich's voice
    // Opus for big moments, Sonnet for connective tissue
    const result = streamText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: systemPrompt,
      messages,
      temperature: 0.8, // Slightly creative but controlled
      maxTokens: 1024,
    })

    return result.toDataStreamResponse()
  } catch (error) {
    console.error('Narrator API error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to generate response' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
