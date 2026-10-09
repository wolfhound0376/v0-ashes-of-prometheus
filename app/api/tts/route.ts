import { NextRequest, NextResponse } from "next/server"
import { MALACHAR_VOICE_ID } from "@/lib/tts"
import { TTS_MODEL, TTS_FALLBACK_MODEL, settingsFor, shouldRetryOnFallback } from "@/lib/tts-model"

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
      onyx: MALACHAR_VOICE_ID,       // Malachar — canon, see lib/tts.ts
      alloy: "21m00Tcm4TlvDq8ikWAM", // Rachel - clear female
    }

    const voiceId = voiceIds[voice] || voiceIds.onyx

    const settings = {
      stability: 0.5,
      similarity_boost: 0.75,
      style: voice === "onyx" ? 0.3 : 0.0,
      use_speaker_boost: true,
    }

    // Ask for v4; drop to the proven model if this account cannot use it.
    // See lib/tts-model.ts for why the retry is wider than unsupported_model.
    let response: Response | null = null
    let errorText = ""
    let usedModel = ""
    for (const model of [TTS_MODEL, TTS_FALLBACK_MODEL]) {
      usedModel = model
      response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({ text, model_id: model, voice_settings: settingsFor(model, settings) }),
      })
      if (response.ok) break
      errorText = await response.text()
      console.error(`[TTS] ElevenLabs rejected ${model} (${response.status}):`, errorText)
      if (!shouldRetryOnFallback(model, response.status)) break
      console.error(`[TTS] retrying on ${TTS_FALLBACK_MODEL}`)
    }

    if (!response || !response.ok) {
      const status = response?.status ?? 0
      // 401/403 is the key or the quota, not the model — say so plainly in the
      // log, because this is the case Sam will be looking for.
      if (status === 401 || status === 403) {
        console.error("[TTS] auth/quota failure — check the ElevenLabs key and remaining credits")
        return NextResponse.json({ error: "TTS provider rejected the credentials or quota", detail: errorText }, { status: 502 })
      }
      return NextResponse.json({ error: "TTS generation failed", detail: errorText }, { status: 500 })
    }
    console.log(`[TTS] spoke with ${usedModel}`)

    const audioBuffer = await response.arrayBuffer()

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "X-TTS-Model": usedModel,
      },
    })
  } catch (error) {
    console.error("[TTS] Error:", error)
    return NextResponse.json({ error: "TTS generation failed" }, { status: 500 })
  }
}
