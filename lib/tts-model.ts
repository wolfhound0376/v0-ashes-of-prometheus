// ============================================================================
// Which ElevenLabs model speaks, and what happens when it can't.
// ============================================================================
//
// Sam, 2026-10-08: "Try eleven labs v4 since it's free."
//
// Both voice routes (/api/tts for Malachar, /api/npc-tts for everyone else)
// were pinned to eleven_multilingual_v2. ElevenLabs now ships eleven_v4 as its
// top quality model, so that is what we ask for first.
//
// But a BLIND swap is the wrong shape here, and the existing unsupported_model
// handler in app/api/tts/route.ts is the scar tissue proving why: a model that
// this account's plan does not carry turns a working voice into a 502, and the
// page just goes quiet. The failure is silent at the only place it matters —
// the table hears nothing and nobody sees the error.
//
// So: ask for v4, and if ElevenLabs refuses for ANY reason, retry once on the
// model we know works. Not just `unsupported_model` — v4 also validates
// voice_settings differently from multilingual_v2 (stability is discrete in
// the v3/v4 line), and a settings rejection comes back as a plain 422, not a
// model error. Catching only the model error would leave exactly the silence
// this change is meant to prevent.
//
// Worst case this is identical to the old behaviour plus one wasted round
// trip. Best case Malachar sounds better for free.

/** First choice: ElevenLabs' current top-quality model. */
export const TTS_MODEL = "eleven_v4"

/** Proven fallback — what both routes used before 2026-10-08. */
export const TTS_FALLBACK_MODEL = "eleven_multilingual_v2"

export type VoiceSettings = {
  stability: number
  similarity_boost: number
  style: number
  use_speaker_boost: boolean
}

/**
 * v4 rejects the style/similarity knobs multilingual_v2 accepts, so the
 * primary attempt sends the conservative subset. The fallback attempt sends
 * the caller's full settings, exactly as before this change.
 */
export function settingsFor(model: string, settings: VoiceSettings): Partial<VoiceSettings> {
  if (model === TTS_FALLBACK_MODEL) return settings
  return { stability: settings.stability, use_speaker_boost: settings.use_speaker_boost }
}

/**
 * True when a failed attempt on `model` is worth retrying on the fallback.
 * Only the FIRST attempt retries, and only when there is somewhere to fall
 * back to — a fallback that fails is the end of the line, never a loop.
 *
 * 401/403 are auth and quota: a different model will not fix a dead key or an
 * exhausted plan, and retrying only doubles the damage. Everything else on the
 * primary model is worth one more try.
 */
export function shouldRetryOnFallback(model: string, status: number): boolean {
  if (model === TTS_FALLBACK_MODEL) return false
  if (status === 401 || status === 403) return false
  return status >= 400
}

// ============================================================================
// Per-voice delivery profiles.
//
// A voice made in ElevenLabs Voice Design is built on the v3 model, and its
// accent lives partly in how v3 reads it. Read on v4 (or multilingual_v2) the
// same voice id loses the accent and drifts from its design preview — measured
// on Turvy, 2026-10-09: v4, v3 and multilingual_v2 all dropped the Romanian
// accent; v3 with an explicit accent direction kept it.
//
// A profile pins such a voice to its own model, a direction prefixed to every
// line, and its own stability. The fallback model never gets the prefix:
// multilingual_v2 would read "[strong Romanian accent]" out loud.
// ============================================================================

export type VoiceDelivery = {
  model: string
  /** Prepended to the line on `model` only. v3 audio-tag syntax. */
  direction?: string
  /** v3 accepts only 0 (Creative), 0.5 (Natural) or 1 (Robust). */
  stability: number
}

export const VOICE_DELIVERY: Record<string, VoiceDelivery> = {
  // Empty. Turvy had { model: "eleven_v3", direction: "[strong Romanian
  // accent]", stability: 0.5 } on his designed voice; an Instant Voice Clone of
  // the design preview replaced it and needs none (Sam, 2026-10-09). Keep the
  // mechanism for the next designed voice that drifts.
}

export function deliveryFor(voiceId: string | null | undefined): VoiceDelivery | null {
  return (voiceId && VOICE_DELIVERY[voiceId]) || null
}
