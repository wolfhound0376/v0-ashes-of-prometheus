// Create a new Malachar session
import { NextResponse } from "next/server"

const MALACHAR_API_URL = process.env.MALACHAR_API_URL
const MALACHAR_API_KEY = process.env.MALACHAR_API_KEY
const MALACHAR_AGENT_ID = process.env.MALACHAR_AGENT_ID

export async function POST(req: Request) {
  if (!MALACHAR_API_URL || !MALACHAR_API_KEY || !MALACHAR_AGENT_ID) {
    return NextResponse.json(
      { error: "Malachar configuration missing" },
      { status: 500 }
    )
  }

  try {
    const { campaign } = await req.json()

    // Create a new session with Malachar
    const response = await fetch(`${MALACHAR_API_URL}/v1/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MALACHAR_API_KEY}`,
      },
      body: JSON.stringify({
        agent_id: MALACHAR_AGENT_ID,
        environment: "production",
        // Attach campaign context as resources
        resources: campaign ? [
          {
            type: "text",
            name: "campaign_context",
            content: JSON.stringify({
              campaign_name: campaign.name,
              current_episode: campaign.currentEpisode,
              current_location: campaign.currentLocation,
              heat_level: campaign.currentHeat,
              system_context: campaign.systemPrompt,
            }),
          }
        ] : [],
        // Enable memory for cross-session persistence
        memory: {
          enabled: true,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Malachar] Session creation failed:", errorText)
      return NextResponse.json(
        { error: "Failed to create Malachar session" },
        { status: response.status }
      )
    }

    const session = await response.json()
    return NextResponse.json({ sessionId: session.id })
  } catch (error) {
    console.error("[Malachar] Session error:", error)
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    )
  }
}
