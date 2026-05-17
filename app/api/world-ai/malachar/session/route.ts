// Create a new Malachar session via the Anthropic Managed Agents API
import { NextResponse } from "next/server"

const ANTHROPIC_API = "https://api.anthropic.com"
const BETA_HEADER = "managed-agents-2026-04-01"
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

    const response = await fetch(`${ANTHROPIC_API}/v1/sessions?beta=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-beta": BETA_HEADER,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
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
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error("[Malachar] Anthropic session create failed:", response.status, errBody)
      return NextResponse.json(
        { error: `Anthropic API error ${response.status}` },
        { status: response.status }
      )
    }

    const session = await response.json()
    console.log("[Malachar] Session created:", session.id)
    return NextResponse.json({ sessionId: session.id })
  } catch (error) {
    console.error("[Malachar] Session error:", error)
    const message = error instanceof Error ? error.message : "Failed to create session"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
