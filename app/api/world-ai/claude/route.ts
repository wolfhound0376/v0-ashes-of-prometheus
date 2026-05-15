// World AI Claude fallback - uses Vercel AI Gateway (zero config)
import { streamText, convertToModelMessages } from "ai"

export async function POST(req: Request) {
  try {
    const { messages, systemPrompt } = await req.json()

    // Convert messages if they have parts format
    const modelMessages = messages[0]?.parts 
      ? await convertToModelMessages(messages)
      : messages

    const result = streamText({
      model: "anthropic/claude-sonnet-4",
      system: systemPrompt,
      messages: modelMessages,
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error("[World AI Claude] Error:", error)
    return new Response(
      JSON.stringify({ error: "Failed to generate response" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
