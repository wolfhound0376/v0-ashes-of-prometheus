// Create a new Malachar session
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  // Read env vars inside function to pick up changes without restart
  const MALACHAR_API_URL = process.env.MALACHAR_API_URL
  const MALACHAR_API_KEY = process.env.MALACHAR_API_KEY
  const MALACHAR_AGENT_ID = process.env.MALACHAR_AGENT_ID
  
  // Check which env vars are missing
  const missingVars = []
  if (!MALACHAR_API_URL) missingVars.push("MALACHAR_API_URL")
  if (!MALACHAR_API_KEY) missingVars.push("MALACHAR_API_KEY")
  if (!MALACHAR_AGENT_ID) missingVars.push("MALACHAR_AGENT_ID")
  
  if (missingVars.length > 0) {
    console.error("[Malachar] Missing environment variables:", missingVars.join(", "))
    return NextResponse.json(
      { 
        error: "Malachar configuration missing", 
        missingVars,
        hint: "Please add these environment variables in Settings > Vars"
      },
      { status: 500 }
    )
  }
  
  console.log("[Malachar] Creating session with agent:", MALACHAR_AGENT_ID)
  console.log("[Malachar] API URL:", MALACHAR_API_URL)

  try {
    const { campaign } = await req.json()
    
    const sessionUrl = `${MALACHAR_API_URL}/v1/sessions`
    console.log("[Malachar] Creating session at:", sessionUrl)

    // Create a new session with Malachar
    // Note: The Managed Agents API requires an environment_id
    // Check if user has provided one, otherwise we'll need it
    const MALACHAR_ENV_ID = process.env.MALACHAR_ENVIRONMENT_ID
    
    if (!MALACHAR_ENV_ID) {
      console.error("[Malachar] Missing MALACHAR_ENVIRONMENT_ID - required for Managed Agents API")
      return NextResponse.json(
        { 
          error: "Missing MALACHAR_ENVIRONMENT_ID", 
          hint: "Please add your Anthropic environment ID in Settings > Vars"
        },
        { status: 500 }
      )
    }
    
    const response = await fetch(sessionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": MALACHAR_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "managed-agents-2026-04-01",
      },
      body: JSON.stringify({
        agent: MALACHAR_AGENT_ID,
        environment_id: MALACHAR_ENV_ID,
        title: campaign?.name ? `${campaign.name} Session` : "World AI Session",
        metadata: campaign ? {
          campaign_name: campaign.name || "",
          current_episode: campaign.currentEpisode || "",
          current_location: campaign.currentLocation || "",
          heat_level: campaign.currentHeat || "",
        } : {},
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Malachar] Session creation failed:", response.status, errorText)
      return NextResponse.json(
        { 
          error: "Failed to create Malachar session", 
          status: response.status,
          details: errorText.substring(0, 200) // Truncate for safety
        },
        { status: response.status }
      )
    }

    const session = await response.json()
    console.log("[Malachar] Session created:", session.id || session)
    return NextResponse.json({ sessionId: session.id || session.session_id })
  } catch (error) {
    console.error("[Malachar] Session error:", error)
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    )
  }
}
