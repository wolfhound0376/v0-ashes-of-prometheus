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
    // For Malachar (onyx): Custom lich voice - cold, ancient, contemptuous
    // For players (alloy): "Rachel" - clear, warm voice
    const voiceIds: Record<string, string> = {
      onyx: "NiQt0cwFeLsVf6cAmcCp",  // Custom Malachar lich voice
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
          model_id: "eleven_multilingual_v2",
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

      // Graceful handling if ElevenLabs rejects the model (e.g. another
      // deprecation). Log the exact error and return a clear 502 so the failure
      // is distinguishable from a generic server error.
      if (/unsupported_model/i.test(errorText)) {
        console.error(
          "[TTS] ElevenLabs reported unsupported_model. Current model_id: eleven_multilingual_v2. Full error:",
          errorText,
        )
        return NextResponse.json(
          { error: "TTS provider rejected the voice model (unsupported_model)", detail: errorText },
          { status: 502 },
        )
      }

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
