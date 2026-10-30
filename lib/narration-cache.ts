// ============================================================================
// Where a spoken story beat is cached, and under what name.
// ============================================================================
//
// Sam, 2026-10-30: "elevenlabs might have a lot to do." The beats the Underwalk
// speaks aloud are FIXED strings — "The pen gate opens a hand's width..." is
// identical every run — so each one is synthesised once and kept in Supabase
// storage under a hash of what was said. ElevenLabs is charged once per unique
// line ever, not once per play.
//
// The key covers the VOICE and the SPEED as well as the text, so turning
// NARR_SPEED or changing the narrator's voice produces new objects instead of
// serving yesterday's audio at the old tempo. That is the whole reason this is
// a hash of a tuple and not of the text alone.

import { createHash } from "node:crypto"

export const NARRATION_BUCKET = "vtt-assets"
export const NARRATION_PREFIX = "narration"

/** The lich voice — the same id /api/tts calls "onyx". */
export const MALACHAR_VOICE = "NiQt0cwFeLsVf6cAmcCp"

/** Longer than this is a caller mistake, and synthesising it silently is the expensive kind. */
export const MAX_NARRATION_CHARS = 400

/**
 * Clamp to the band ElevenLabs accepts, and round to two decimals so that
 * floating-point noise in the caller cannot split one line across two cache
 * entries (1.15 and 1.1500000000000001 must be the same object).
 */
export function cleanSpeed(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : 1
  return Math.round(Math.min(1.2, Math.max(0.7, n)) * 100) / 100
}

/** The storage path for one spoken line. */
export function narrationKey(text: string, voiceId: string, speed: number): string {
  const h = createHash("sha256").update(`${voiceId}|${speed}|${text}`).digest("hex").slice(0, 32)
  return `${NARRATION_PREFIX}/${h}.mp3`
}
