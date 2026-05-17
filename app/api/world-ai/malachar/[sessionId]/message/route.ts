// Send a message to a Malachar session via the Anthropic Managed Agents API
import { NextRequest, NextResponse } from "next/server"
import { buildWorldContext, formatWorldContextForAI } from "@/lib/world-ai/world-context"

const ANTHROPIC_API = "https://api.anthropic.com"
const BETA_HEADER = "managed-agents-2026-04-01"

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

    // Build the message with world context prepended
    const messageWithContext = worldContextText
      ? `[WORLD CONTEXT - Reference this for campaign knowledge]\n${worldContextText}\n\n[PLAYER MESSAGE]\n${content}`
      : content

    // POST events to the Anthropic session
    const response = await fetch(
      `${ANTHROPIC_API}/v1/sessions/${sessionId}/events?beta=true`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-beta": BETA_HEADER,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          events: [
            {
              type: "user.message",
              content: [{ type: "text", text: messageWithContext }],
            },
          ],
        }),
      }
    )

    if (!response.ok) {
      const errBody = await response.text()
      console.error("[Malachar] Send events failed:", response.status, errBody)
      return NextResponse.json(
        { error: `Anthropic API error ${response.status}` },
        { status: response.status }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Malachar] Message error:", error)
    const message = error instanceof Error ? error.message : "Failed to send message"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
