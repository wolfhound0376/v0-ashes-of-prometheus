import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { text, voice = "onyx" } = await request.json()

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 })
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 500 })
    }

    // ElevenLabs voice IDs
    // For Malachar (onyx): "Adam" - deep, authoritative male voice
    // For players (alloy): "Rachel" - clear, warm voice
    const voiceIds: Record<string, string> = {
      onyx: "pNInz6obpgDQGcFmaJgB",  // Adam - deep male
      alloy: "21m00Tcm4TlvDq8ikWAM", // Rachel - clear female
    }

    const voiceId = voiceIds[voice] || voiceIds.onyx

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: voice === "onyx" ? 0.3 : 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[TTS] ElevenLabs error:", errorText)
      return NextResponse.json({ error: "TTS generation failed" }, { status: 500 })
    }

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
