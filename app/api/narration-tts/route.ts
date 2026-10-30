import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import {
  NARRATION_BUCKET,
  MALACHAR_VOICE,
  MAX_NARRATION_CHARS,
  cleanSpeed,
  narrationKey,
} from "@/lib/narration-cache"
import { TTS_MODEL, TTS_FALLBACK_MODEL, settingsFor, shouldRetryOnFallback } from "@/lib/tts-model"

// ============================================================================
// THE NARRATOR'S VOICE, PAID FOR ONCE.
// ============================================================================
//
// Sam, 2026-10-30: the Underwalk's story beats are read aloud, and "elevenlabs
// might have a lot to do" if every line went through. Two things keep that
// true, and they reinforce each other:
//
//   1. Only OPT-IN beats reach this route at all. The walk marks a handful of
//      story moments with { say: true }; the other ~300 log lines (rolls,
//      damage, skill checks) never call it, which also keeps Sam's own ruling
//      that rolls are never spoken.
//
//   2. Those beats are FIXED STRINGS — "The pen gate opens a hand's width..."
//      is identical every run — so the audio is cached in Supabase storage by
//      a hash of the text. ElevenLabs is charged once per unique line EVER,
//      not once per play. After the first session the narrator is free.
//
// The two properties line up on purpose: the lines worth hearing are the ones
// that cache, and the interpolated lines that would never cache (names, dice)
// are the ones not worth hearing.
//
// The cache key covers the voice, the model-independent settings and the text,
// so changing NARR_SPEED or the voice produces new objects rather than serving
// stale audio at the old tempo.

function audio(buf: ArrayBuffer, cached: boolean) {
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(buf.byteLength),
      "X-Narration-Cache": cached ? "hit" : "miss",
      // The bytes for a given URL never change (the key is a hash of the
      // content), so the browser may keep them as long as it likes.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const text = String(body?.text ?? "").trim()
    if (!text) return NextResponse.json({ error: "No text provided" }, { status: 400 })
    // A beat is a sentence or two. Anything longer is a caller mistake, and
    // silently synthesising it would be the expensive kind of mistake.
    if (text.length > MAX_NARRATION_CHARS) {
      return NextResponse.json({ error: "Narration line too long", length: text.length }, { status: 400 })
    }

    const speed = cleanSpeed(body?.speed)
    const voiceId = MALACHAR_VOICE
    const key = narrationKey(text, voiceId, speed)

    // ---- cache read ----
    const hit = await supabaseAdmin.storage.from(NARRATION_BUCKET).download(key)
    if (hit.data) {
      console.log(`[narration] cache hit ${key}`)
      return audio(await hit.data.arrayBuffer(), true)
    }

    // ---- miss: synthesise ----
    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 500 })

    const settings = { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true, speed }

    let response: Response | null = null
    let errorText = ""
    for (const model of [TTS_MODEL, TTS_FALLBACK_MODEL]) {
      response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: { Accept: "audio/mpeg", "Content-Type": "application/json", "xi-api-key": apiKey },
        body: JSON.stringify({ text, model_id: model, voice_settings: settingsFor(model, settings) }),
      })
      if (response.ok) break
      errorText = await response.text()
      console.error(`[narration] ElevenLabs rejected ${model} (${response.status}):`, errorText)
      if (!shouldRetryOnFallback(model, response.status)) break
    }

    if (!response || !response.ok) {
      const status = response?.status ?? 0
      if (status === 401 || status === 403) {
        console.error("[narration] auth/quota failure — check the ElevenLabs key and remaining credits")
        return NextResponse.json({ error: "TTS provider rejected the credentials or quota" }, { status: 502 })
      }
      return NextResponse.json({ error: "TTS generation failed", detail: errorText }, { status: 500 })
    }

    const buf = await response.arrayBuffer()

    // ---- cache write ----
    // A failed upload must NOT fail the request: the table still hears the
    // line, we just pay for it again next time. upsert, because two seats can
    // reach the same new beat in the same second.
    const up = await supabaseAdmin.storage
      .from(NARRATION_BUCKET)
      .upload(key, buf, { contentType: "audio/mpeg", upsert: true, cacheControl: "31536000" })
    if (up.error) console.error("[narration] cache write failed (line still served):", up.error.message)
    else console.log(`[narration] cached ${key} (${buf.byteLength} bytes)`)

    return audio(buf, false)
  } catch (error) {
    console.error("[narration] Error:", error)
    return NextResponse.json({ error: "Narration failed" }, { status: 500 })
  }
}
