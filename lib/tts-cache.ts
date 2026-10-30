// ============================================================================
// EVERY SPOKEN LINE IS PAID FOR ONCE.
// ============================================================================
//
// Sam, 2026-10-30: "recycling should only cover NPC barks, system flavors, and
// all audio." This module is the "all audio" half.
//
// /api/narration-tts already proved the shape (lib/narration-cache.ts): hash
// the tuple that determines the bytes, keep the mp3 in Supabase storage under
// that hash, and ElevenLabs is charged once per unique utterance EVER rather
// than once per play. Nothing else was using it, so a guard shouting "Step
// back!" for the fortieth time was synthesised — and billed — forty times.
//
// The key covers the VOICE, the SETTINGS and the TEXT, because all three
// change the bytes. It deliberately does NOT cover the model: /api/tts and
// /api/npc-tts both ask for v4 and silently drop to the proven model when the
// account can't use it, and which of the two answered is not something the
// caller chose. Keying on it would mean a line cached on the fallback is
// re-billed the day v4 starts working — so instead the first successful take
// of an utterance is the take, whichever model produced it. Re-record by
// changing the voice or the settings, which DO move the key.
//
// Two rules the callers rely on:
//   - A cache miss must never be fatal. Storage being down costs money, not
//     the line. Every helper here swallows its own errors.
//   - Nothing over MAX_CACHEABLE_CHARS is stored. Long lines are improvised
//     prose that will never be said twice; caching them fills the bucket with
//     write-only objects. They still get spoken, just not kept.

import { createHash } from "node:crypto"

export const TTS_BUCKET = "vtt-assets"
export const TTS_PREFIX = "tts-cache"

/**
 * Longer than this and the line is almost certainly improvised — a one-off
 * that would never be requested twice. Claude's number, not Sam's: it is a
 * little over two spoken sentences, which covers barks, warnings, greetings
 * and the fixed story beats while leaving generated prose uncached.
 */
export const MAX_CACHEABLE_CHARS = 600

/** Everything about a request that changes the audio that comes back. */
export type TtsCacheParts = {
  voiceId: string
  text: string
  /** Voice settings as sent to ElevenLabs. Key order does not matter. */
  settings?: Record<string, unknown> | null
  /**
   * A free-text discriminator for anything else that alters the bytes — the
   * delivery direction prefix a designed voice gets, say. Leave unset when
   * there is nothing extra.
   */
  variant?: string | null
}

/** Stable JSON: keys sorted, so {a,b} and {b,a} are the same cache entry. */
function stable(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value !== "object") return String(value)
  const obj = value as Record<string, unknown>
  return Object.keys(obj)
    .sort()
    .map((k) => `${k}=${stable(obj[k])}`)
    .join(",")
}

/** The storage path for one spoken utterance. */
export function ttsCacheKey(parts: TtsCacheParts): string {
  const tuple = [parts.voiceId, stable(parts.settings ?? null), parts.variant ?? "", parts.text].join("|")
  const h = createHash("sha256").update(tuple).digest("hex").slice(0, 32)
  return `${TTS_PREFIX}/${h}.mp3`
}

/** Whether this utterance is worth keeping. Short, non-empty, has a voice. */
export function isCacheable(parts: TtsCacheParts): boolean {
  const text = parts.text?.trim() ?? ""
  return !!parts.voiceId && text.length > 0 && text.length <= MAX_CACHEABLE_CHARS
}

type StorageLike = {
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{ data: Blob | null; error: unknown }>
      upload: (
        path: string,
        body: ArrayBuffer | Uint8Array,
        opts?: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>
    }
  }
}

/**
 * Return the cached bytes for this utterance, or null on a miss OR on any
 * failure at all. A cache that cannot be read is a cache miss, never an error
 * the player hears.
 */
export async function readCachedAudio(
  client: StorageLike,
  key: string,
  tag = "tts-cache",
): Promise<ArrayBuffer | null> {
  try {
    const hit = await client.storage.from(TTS_BUCKET).download(key)
    if (!hit.data) return null
    console.log(`[${tag}] cache hit ${key}`)
    return await hit.data.arrayBuffer()
  } catch (e) {
    console.log(`[${tag}] cache read skipped:`, (e as Error).message)
    return null
  }
}

/**
 * Keep the bytes. Best-effort by design: a failed upload costs the next play's
 * credits, never this play's line. upsert because two seats can reach the same
 * new bark in the same second.
 */
export async function writeCachedAudio(
  client: StorageLike,
  key: string,
  buf: ArrayBuffer,
  tag = "tts-cache",
): Promise<void> {
  try {
    const up = await client.storage
      .from(TTS_BUCKET)
      .upload(key, buf, { contentType: "audio/mpeg", upsert: true, cacheControl: "31536000" })
    if (up.error) console.error(`[${tag}] cache write failed (line still served):`, up.error.message)
    else console.log(`[${tag}] cached ${key} (${buf.byteLength} bytes)`)
  } catch (e) {
    console.error(`[${tag}] cache write skipped:`, (e as Error).message)
  }
}
