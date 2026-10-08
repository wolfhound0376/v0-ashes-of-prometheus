import { describe, it, expect } from "vitest"
import {
  TTS_MODEL,
  TTS_FALLBACK_MODEL,
  settingsFor,
  shouldRetryOnFallback,
  type VoiceSettings,
} from "./tts-model"

const SETTINGS: VoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.3,
  use_speaker_boost: true,
}

describe("model choice", () => {
  it("asks for v4 first", () => {
    expect(TTS_MODEL).toBe("eleven_v4")
  })

  it("falls back to the model both routes used before this change", () => {
    expect(TTS_FALLBACK_MODEL).toBe("eleven_multilingual_v2")
  })

  it("never has the same model as primary and fallback — that would make the retry pointless", () => {
    expect(TTS_MODEL).not.toBe(TTS_FALLBACK_MODEL)
  })
})

describe("settingsFor", () => {
  it("sends the full settings unchanged on the fallback, so behaviour is byte-identical to before", () => {
    expect(settingsFor(TTS_FALLBACK_MODEL, SETTINGS)).toEqual(SETTINGS)
  })

  it("drops style and similarity_boost for v4, which validates them differently", () => {
    const out = settingsFor(TTS_MODEL, SETTINGS)
    expect(out).toEqual({ stability: 0.5, use_speaker_boost: true })
    expect(out).not.toHaveProperty("style")
    expect(out).not.toHaveProperty("similarity_boost")
  })
})

describe("shouldRetryOnFallback", () => {
  it("retries a model rejection on the primary", () => {
    expect(shouldRetryOnFallback(TTS_MODEL, 400)).toBe(true)
  })

  it("retries a settings rejection too — a 422 is exactly how v4 refuses style/similarity", () => {
    // This is the case a narrow unsupported_model-only check would miss, and
    // missing it is silence at the table.
    expect(shouldRetryOnFallback(TTS_MODEL, 422)).toBe(true)
  })

  it("retries a provider-side 500", () => {
    expect(shouldRetryOnFallback(TTS_MODEL, 500)).toBe(true)
  })

  it("does NOT retry a dead key — a different model cannot fix 401", () => {
    expect(shouldRetryOnFallback(TTS_MODEL, 401)).toBe(false)
  })

  it("does NOT retry an exhausted plan — 403 is quota, not the model", () => {
    expect(shouldRetryOnFallback(TTS_MODEL, 403)).toBe(false)
  })

  it("never retries the fallback itself, at any status — no loops", () => {
    for (const status of [400, 401, 403, 422, 429, 500, 503]) {
      expect(shouldRetryOnFallback(TTS_FALLBACK_MODEL, status)).toBe(false)
    }
  })

  it("does not retry a success", () => {
    expect(shouldRetryOnFallback(TTS_MODEL, 200)).toBe(false)
  })
})
