// Send a message to a Malachar session
import { NextRequest, NextResponse } from "next/server"

const MALACHAR_API_URL = process.env.MALACHAR_API_URL
const MALACHAR_API_KEY = process.env.Claude_Lich_API

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  
  if (!MALACHAR_API_URL || !MALACHAR_API_KEY) {
    return NextResponse.json(
      { error: "Malachar configuration missing" },
      { status: 500 }
    )
  }

  try {
    const { content, context } = await req.json()

    // Send event to Malachar session
    const response = await fetch(
      `${MALACHAR_API_URL}/v1/sessions/${sessionId}/events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${MALACHAR_API_KEY}`,
        },
        body: JSON.stringify({
          type: "user_message",
          content: content,
          // Include any additional context (dice rolls, location changes, etc.)
          metadata: context || {},
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
