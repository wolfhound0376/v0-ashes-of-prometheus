import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { message, systemPrompt, context } = await req.json() as {
      message: string
      systemPrompt: string
      context: {
        episode: string
        location: string
        heat: string
      }
    }

    // Build the full context
    const contextString = `
CURRENT STATE:
- Episode: ${context.episode}
- Location: ${context.location}
- Heat Level: ${context.heat}

DM QUESTION: ${message}`

    const result = await generateText({
      model: anthropic('claude-opus-4-7'),
      system: systemPrompt,
      prompt: contextString,
      temperature: 0.7,
      maxTokens: 800,
    })

    return Response.json({ response: result.text })
  } catch (error) {
    console.error('World AI error:', error)
    return Response.json(
      { error: 'Failed to consult the world', details: String(error) },
      { status: 500 }
    )
  }
}
