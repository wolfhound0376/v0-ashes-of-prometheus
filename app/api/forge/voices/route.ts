import { NextRequest, NextResponse } from "next/server"
import { ELEVEN_VOICE_LIBRARY } from "@/lib/tts"
import { TTS_MODEL, TTS_FALLBACK_MODEL, settingsFor, shouldRetryOnFallback } from "@/lib/tts-model"

// /api/forge/voices — the Voice step's "pick a voice" tab.
//
//   GET                → the curated library (lib/tts.ts ELEVEN_VOICE_LIBRARY): ids, names, a
//                        few words each. These are the same stable voices the NPC pipeline
//                        draws from, so a hero's library voice is as canon as any NPC's.
//   POST { voiceId }   → one spoken sample line (audio/mpeg) in that voice, so the player can
//                        hear it before choosing. The line is fixed and short; the audio is
//                        cached per voice for the life of the instance, so a table of five
//                        auditioning the same eight voices costs eight renders, not forty.
//
// The default path in the blueprint is "pick a voice, record only if you want to" — a library
// voice needs no clone, no consent box and no wait, and it is what every NPC already has.

export const dynamic = "force-dynamic"

/** What the sample says. One line, the character's own situation, no rules content. */
const SAMPLE_LINE = "They took everything but my name. Let them try to take that."

const cache = new Map<string, ArrayBuffer>()

export async function GET() {
  const voices = ELEVEN_VOICE_LIBRARY.map((v) => ({ id: v.id, name: v.name, gender: v.gender, tags: v.tags.slice(0, 4) }))
  return NextResponse.json({ voices, sampleLine: SAMPLE_LINE })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const voiceId = typeof body?.voiceId === "string" ? body.voiceId.trim() : ""
  const voice = ELEVEN_VOICE_LIBRARY.find((v) => v.id === voiceId)
  if (!voice) return NextResponse.json({ error: "Not a library voice" }, { status: 400 })

  const hit = cache.get(voiceId)
  if (hit) return new NextResponse(hit, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } })

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 503 })

  const settings = { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true }
  let response: Response | null = null
  for (const model of [TTS_MODEL, TTS_FALLBACK_MODEL]) {
    response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { Accept: "audio/mpeg", "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({ text: SAMPLE_LINE, model_id: model, voice_settings: settingsFor(model, settings) }),
    })
    if (response.ok) break
    if (!shouldRetryOnFallback(model, response.status)) break
  }
  if (!response || !response.ok) {
    const detail = response ? await response.text().catch(() => "") : "no response"
    console.error("[forge/voices] sample failed:", response?.status, detail.slice(0, 200))
    return NextResponse.json({ error: "Could not render the sample" }, { status: 502 })
  }
  const audio = await response.arrayBuffer()
  cache.set(voiceId, audio)
  return new NextResponse(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } })
}
