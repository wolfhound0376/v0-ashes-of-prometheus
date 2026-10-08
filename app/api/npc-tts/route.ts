import { type NextRequest, NextResponse } from "next/server"
import { resolveVoice, resolveNamedNpcVoiceId, sanitizeForTTS } from "@/lib/tts"
import { createAdminClient } from "@/lib/supabase/admin"
import { TTS_MODEL, TTS_FALLBACK_MODEL, settingsFor, shouldRetryOnFallback } from "@/lib/tts-model"

/**
 * Text-to-speech for a named NPC line.
 *
 * Voice resolution order:
 *   1. An explicit `voiceId` already stored on the NPC (voice_id column) — used
 *      verbatim, never re-resolved or overwritten.
 *   2. A canon named-NPC voice matched from `npcName` (e.g. Ront, Eldeth, the
 *      Lich). Named matches are canon and are persisted back to voice_id.
 *   3. Otherwise, match the closest ElevenLabs voice from `voiceDescription`.
 *      The resolved id is persisted back to voice_id ONLY when it was a genuine
 *      keyword match from that NPC's own description — never a generic default
 *      fallback — and the write is scoped to exactly the NPC being resolved.
 *   4. If there is no voiceId, name, nor a matchable description, a sensible
 *      default is chosen for this request only and is NOT persisted.
 *
 * Returns MPEG audio; the resolved voice id is echoed in the `X-Resolved-Voice`
 * response header for debugging.
 */
export async function POST(request: NextRequest) {
  try {
    const { text, voiceId, voiceDescription, npcName, npcId } = await request.json()

    const clean = sanitizeForTTS(text || "")
    if (!clean) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 })
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 500 })
    }

    // 1) Resolve the voice.
    const explicitVoiceId = typeof voiceId === "string" && voiceId.trim() ? voiceId.trim() : undefined
    let resolvedVoiceId: string
    // Only a genuine keyword match from THIS NPC's description may be persisted.
    let persistable = false
    const namedVoiceId = explicitVoiceId ? null : resolveNamedNpcVoiceId(npcName)
    if (explicitVoiceId) {
      resolvedVoiceId = explicitVoiceId
    } else if (namedVoiceId) {
      // A canon named NPC (e.g. Ront, Eldeth, the Lich) — this is authoritative
      // and safe to persist as the NPC's voice.
      resolvedVoiceId = namedVoiceId
      persistable = true
      console.log(
        "[v0] npc-tts resolved voice by canon name:",
        resolvedVoiceId,
        "| npc:", npcName ?? "(unknown)",
      )
    } else {
      const resolution = resolveVoice(voiceDescription)
      resolvedVoiceId = resolution.voiceId
      persistable = resolution.matchedFromDescription
      console.log(
        "[v0] npc-tts resolved voice:",
        resolvedVoiceId,
        "| matchedFromDescription:", persistable,
        "| npc:", npcName ?? "(unknown)",
      )
    }

    // 2) Persist a freshly-resolved voice ONLY when it was genuinely matched
    // from the NPC's own description (never a generic default), and scope the
    // write to exactly the NPC being resolved (by id when available, else name)
    // and only where voice_id is still empty so a canon voice is never replaced.
    // Best-effort: never fail playback if the DB write can't happen.
    if (persistable && (npcId || npcName)) {
      try {
        const admin = createAdminClient()
        let q = admin.from("npc_encounters").update({ voice_id: resolvedVoiceId }).is("voice_id", null)
        q = npcId ? q.eq("id", npcId) : q.eq("name", npcName)
        const { error } = await q
        if (error) {
          console.log("[v0] npc-tts voice_id write-back error:", error.message)
        } else {
          console.log("[v0] npc-tts voice_id persisted for:", npcId ? `id=${npcId}` : `name=${npcName}`)
        }
      } catch (err) {
        console.log("[v0] npc-tts voice_id write-back skipped:", (err as Error).message)
      }
    }

    // 3) Synthesize. v4 first, the proven model second — same two-attempt rule
    // as /api/tts, so the players and Malachar never end up on different models
    // by accident. lib/tts-model.ts holds the reasoning.
    const settings = { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true }
    let response: Response | null = null
    let errorText = ""
    let usedModel = ""
    for (const model of [TTS_MODEL, TTS_FALLBACK_MODEL]) {
      usedModel = model
      response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}`, {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({ text: clean, model_id: model, voice_settings: settingsFor(model, settings) }),
      })
      if (response.ok) break
      errorText = await response.text()
      console.error(`[v0] npc-tts ElevenLabs rejected ${model} (${response.status}):`, errorText)
      if (!shouldRetryOnFallback(model, response.status)) break
    }

    if (!response || !response.ok) {
      const status = response?.status ?? 0
      if (status === 401 || status === 403) {
        console.error("[v0] npc-tts auth/quota failure — check the ElevenLabs key and remaining credits")
      }
      return NextResponse.json({ error: "TTS generation failed", detail: errorText }, { status: 500 })
    }
    console.log(`[v0] npc-tts spoke with ${usedModel}`)

    const audioBuffer = await response.arrayBuffer()
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "X-Resolved-Voice": resolvedVoiceId || "",
        "X-TTS-Model": usedModel,
      },
    })
  } catch (error) {
    console.error("[v0] npc-tts error:", error)
    return NextResponse.json({ error: "TTS generation failed" }, { status: 500 })
  }
}
