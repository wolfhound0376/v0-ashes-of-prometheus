// Send a message to a Malachar session with full world context
import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { buildWorldContext, formatWorldContextForAI } from "@/lib/world-ai/world-context"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 })
  }

  try {
    const { content, context } = await req.json()

    // Build world context from campaign data and database
    let worldContextText = ""
    if (context?.campaignId) {
      try {
        const worldContext = await buildWorldContext(
          context.campaignId,
          context.currentEpisode || "",
          context.currentLocation || "",
          context.currentHeat || ""
        )
        worldContextText = formatWorldContextForAI(worldContext)
      } catch (err) {
        console.error("[Malachar] Error building world context:", err)
      }
    }

    // Build the message with world context included
    const messageWithContext = worldContextText
      ? `[WORLD CONTEXT - Reference this for campaign knowledge]\n${worldContextText}\n\n[PLAYER MESSAGE]\n${content}`
      : content

    const client = new Anthropic({ apiKey })

    // Send user message event to the Malachar session
    await client.beta.sessions.events.send(sessionId, {
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text: messageWithContext }],
        },
      ],
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Malachar] Message error:", error)
    const message = error instanceof Error ? error.message : "Failed to send message"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
