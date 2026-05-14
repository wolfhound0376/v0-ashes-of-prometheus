import { NextRequest, NextResponse } from "next/server"
import { experimental_generateSpeech as generateSpeech } from "ai"
import { openai } from "@ai-sdk/openai"

export async function POST(request: NextRequest) {
  try {
    const { text, voice = "onyx" } = await request.json()

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 })
    }

    // Use OpenAI TTS directly
    const result = await generateSpeech({
      model: openai.speech("tts-1"),
      text,
      voice,
    })

    // Return the audio as a stream
    const audioBuffer = result.audio.uint8Array.buffer
    
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
