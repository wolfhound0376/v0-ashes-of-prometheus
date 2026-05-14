import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { text, voice = "onyx" } = await request.json()

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 })
    }

    // Call OpenAI TTS API directly
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: voice,
        response_format: "mp3",
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("[TTS] OpenAI error:", error)
      return NextResponse.json({ error: "TTS generation failed" }, { status: 500 })
    }

    // Stream the audio response
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
