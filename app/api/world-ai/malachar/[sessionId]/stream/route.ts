// Stream events from a Malachar session via the Anthropic Managed Agents API
import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return new Response("ANTHROPIC_API_KEY not configured", { status: 500 })
  }

  try {
    const client = new Anthropic({ apiKey })

    // Get the SSE stream from the Anthropic Managed Agents API
    const stream = await client.beta.sessions.events.stream(sessionId)

    // Convert the SDK stream into a web-standard ReadableStream of SSE
    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        try {
          for await (const event of stream) {
            const ssePayload = `data: ${JSON.stringify(event)}\n\n`
            controller.enqueue(encoder.encode(ssePayload))
          }
          controller.close()
        } catch (err) {
          console.error("[Malachar] Stream error:", err)
          controller.error(err)
        }
      },
    })

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("[Malachar] Stream connection failed:", error)
    return new Response("Stream connection failed", { status: 500 })
  }
}
