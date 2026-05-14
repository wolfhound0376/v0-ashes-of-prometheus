import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { text, voice = "onyx" } = await request.json()

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 })
    }

    // Use OpenAI TTS via AI Gateway
    const response = await fetch("https://ai-gateway.vercel.sh/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/tts-1",
        input: text,
        voice: voice,
        response_format: "mp3",
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[TTS] Error from AI Gateway:", errorText)
      return NextResponse.json({ error: "TTS generation failed" }, { status: 500 })
    }

    // Return the audio as a stream
    const audioBuffer = await response.arrayBuffer()
    
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    })
  } catch (error) {
    console.error("[TTS] Error:", error)
    return NextResponse.json({ error: "TTS generation failed" }, { status: 500 })
  }
}
