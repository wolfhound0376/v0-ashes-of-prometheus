// Stream events from a Malachar session
import { NextRequest } from "next/server"

const MALACHAR_API_URL = process.env.MALACHAR_API_URL
const MALACHAR_API_KEY = process.env.MALACHAR_API_KEY

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  
  if (!MALACHAR_API_URL || !MALACHAR_API_KEY) {
    return new Response("Malachar configuration missing", { status: 500 })
  }

  try {
    // Connect to Malachar's event stream
    const response = await fetch(
      `${MALACHAR_API_URL}/v1/sessions/${sessionId}/events/stream`,
      {
        headers: {
          "Authorization": `Bearer ${MALACHAR_API_KEY}`,
          "Accept": "text/event-stream",
        },
      }
    )

    if (!response.ok) {
      return new Response("Failed to connect to Malachar stream", { 
        status: response.status 
      })
    }

    // Forward the SSE stream to the client
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    })
  } catch (error) {
    console.error("[Malachar] Stream error:", error)
    return new Response("Stream connection failed", { status: 500 })
  }
}
