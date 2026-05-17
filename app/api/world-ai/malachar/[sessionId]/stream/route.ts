// Stream events from a Malachar session via the Anthropic Managed Agents API
// Proxies the upstream SSE stream so the client never sees the API key.
import { NextRequest } from "next/server"

const ANTHROPIC_API = "https://api.anthropic.com"
const BETA_HEADER = "managed-agents-2026-04-01"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return new Response("ANTHROPIC_API_KEY not configured", { status: 500 })
  }

  try {
    // Open the upstream SSE stream from the Anthropic Agents API
    const upstream = await fetch(
      `${ANTHROPIC_API}/v1/sessions/${sessionId}/events/stream?beta=true`,
      {
        headers: {
          "x-api-key": apiKey,
          "anthropic-beta": BETA_HEADER,
          "anthropic-version": "2023-06-01",
          Accept: "text/event-stream",
        },
      }
    )

    if (!upstream.ok) {
      const errBody = await upstream.text()
      console.error("[Malachar] Stream connect failed:", upstream.status, errBody)
      return new Response(`Anthropic API error ${upstream.status}`, { status: upstream.status })
    }

    if (!upstream.body) {
      return new Response("No stream body from Anthropic", { status: 502 })
    }

    // Pipe the upstream SSE body straight through to the client
    return new Response(upstream.body, {
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
