// Create a new Malachar session via the Anthropic Managed Agents API
import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"

const AGENT_ID = process.env.ANTHROPIC_AGENT_ID || "agent_01KRp6Dt8rKZ8WEsinzTXgBM"

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const environmentId = process.env.ANTHROPIC_ENVIRONMENT_ID

  if (!apiKey) {
    console.error("[Malachar] Missing ANTHROPIC_API_KEY")
    return NextResponse.json(
      { error: "Malachar configuration missing", missingVars: ["ANTHROPIC_API_KEY"] },
      { status: 500 }
    )
  }

  if (!environmentId) {
    console.error("[Malachar] Missing ANTHROPIC_ENVIRONMENT_ID")
    return NextResponse.json(
      { error: "Malachar configuration missing", missingVars: ["ANTHROPIC_ENVIRONMENT_ID"] },
      { status: 500 }
    )
  }

  try {
    const { campaign } = await req.json()

    const client = new Anthropic({ apiKey })

    const session = await client.beta.sessions.create({
      agent: AGENT_ID,
      environment_id: environmentId,
      title: campaign?.name ? `${campaign.name} Session` : "World AI Session",
      metadata: campaign
        ? {
            campaign_name: campaign.name || "",
            current_episode: campaign.currentEpisode || "",
            current_location: campaign.currentLocation || "",
            heat_level: campaign.currentHeat || "",
          }
        : {},
    })

    console.log("[Malachar] Session created:", session.id)
    return NextResponse.json({ sessionId: session.id })
  } catch (error) {
    console.error("[Malachar] Session error:", error)
    const message = error instanceof Error ? error.message : "Failed to create session"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
