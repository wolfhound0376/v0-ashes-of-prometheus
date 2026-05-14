// Send a message to a Malachar session with full world context
import { NextRequest, NextResponse } from "next/server"
import { buildWorldContext, formatWorldContextForAI } from "@/lib/world-ai/world-context"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  
  // Read env vars inside function to pick up changes without restart
  const MALACHAR_API_URL = process.env.MALACHAR_API_URL
  const MALACHAR_API_KEY = process.env.MALACHAR_API_KEY
  
  if (!MALACHAR_API_URL || !MALACHAR_API_KEY) {
    return NextResponse.json(
      { error: "Malachar configuration missing" },
      { status: 500 }
    )
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
      ? `[WORLD CONTEXT - Reference this for campaign knowledge]\n${worldContextText}\n\n[USER MESSAGE]\n${content}`
      : content

    // Send event to Malachar session
    const response = await fetch(
      `${MALACHAR_API_URL}/v1/sessions/${sessionId}/events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": MALACHAR_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "managed-agents-2026-04-01",
        },
        body: JSON.stringify({
          events: [
            {
              type: "user.message",
              content: [
                { type: "text", text: messageWithContext }
              ],
            }
          ],
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Malachar] Message send failed:", errorText)
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: response.status }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Malachar] Message error:", error)
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    )
  }
}
