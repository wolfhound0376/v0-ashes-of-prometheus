import { type NextRequest, NextResponse } from "next/server"
import { resolveVoiceFromDescription, sanitizeForTTS } from "@/lib/tts"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Text-to-speech for a named NPC line.
 *
 * Voice resolution order:
 *   1. An explicit `voiceId` already stored on the NPC (voice_id column).
 *   2. Otherwise, match the closest ElevenLabs voice from `voiceDescription`
 *      and write that id back to voice_id on ALL rows sharing the NPC name so
 *      the character keeps the same voice from then on.
 *
 * Returns MPEG audio; the resolved voice id is echoed in the `X-Resolved-Voice`
 * response header for debugging.
 */
export async function POST(request: NextRequest) {
  try {
    const { text, voiceId, voiceDescription, npcName } = await request.json()

    const clean = sanitizeForTTS(text || "")
    if (!clean) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 })
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 500 })
    }

    // 1) Resolve the voice.
    let resolvedVoiceId: string | undefined = typeof voiceId === "string" && voiceId.trim() ? voiceId.trim() : undefined
    let didResolveFromDescription = false
    if (!resolvedVoiceId) {
      resolvedVoiceId = resolveVoiceFromDescription(voiceDescription)
      didResolveFromDescription = true
    }

    // 2) Persist a freshly-resolved voice so it stays consistent. Best-effort:
    // never fail playback if the DB write can't happen (e.g. missing creds).
    if (didResolveFromDescription && npcName) {
      try {
        const admin = createAdminClient()
        await admin.from("npc_encounters").update({ voice_id: resolvedVoiceId }).eq("name", npcName)
      } catch (err) {
        console.log("[v0] npc-tts voice_id write-back skipped:", (err as Error).message)
      }
    }

    // 3) Synthesize.
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}`, {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: clean,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] npc-tts ElevenLabs error:", errorText)
      return NextResponse.json({ error: "TTS generation failed" }, { status: 500 })
    }

    const audioBuffer = await response.arrayBuffer()
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "X-Resolved-Voice": resolvedVoiceId || "",
      },
    })
  } catch (error) {
    console.error("[v0] npc-tts error:", error)
    return NextResponse.json({ error: "TTS generation failed" }, { status: 500 })
  }
}
