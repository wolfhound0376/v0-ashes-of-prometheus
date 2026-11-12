/**
 * ONE FIGHT (Sam, 2026-11-10: "fight MUST be synced and wait for other players actions, and have complete parity").
 * The rules /api/walk-fight applies, kept pure so they can be tested (lib/walk-fight.test.ts).
 *
 *  - One live fight per campaign run. The screen that opens it is its AUTHORITY: the only one that rolls, decides and
 *    writes ticks. Every other screen shows it from the ticks.
 *  - A fight whose authority has gone quiet for FIGHT_STALE_MS is let go: the next screen to open one gets it.
 *  - Anyone seated may send an input; the authority itself checks it comes from the driver of the hero whose turn it is.
 */

export const FIGHT_STALE_MS = 60_000
export const MAX_BODY_BYTES = 256_000
export const MAX_READ = 200

export interface LiveFight {
  id: string
  plate: string
  auth_key: string
  auth_seen: string
  started_at: string
  ended_at: string | null
}

/** A live fight still held by a screen that is ticking. */
export function isHeld(f: LiveFight | null, now: number): boolean {
  if (!f || f.ended_at) return false
  return now - Date.parse(f.auth_seen) < FIGHT_STALE_MS
}

/** What "open a fight on this plate" comes to: join the one that is held, or take it (ending a stale one first). */
export function openDecision(f: LiveFight | null, now: number): { kind: "join"; fight: LiveFight } | { kind: "take"; endStale: string | null } {
  if (f && isHeld(f, now)) return { kind: "join", fight: f }
  return { kind: "take", endStale: f && !f.ended_at ? f.id : null }
}

/** Only the authority ticks or ends a fight. */
export function mayDrive(f: LiveFight | null, key: string): boolean {
  return !!f && !f.ended_at && f.auth_key === key
}

/** A body is JSON, an object, and not huge. */
export function cleanBody(b: unknown): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { ok: false, error: "body must be an object" }
  let s: string
  try {
    s = JSON.stringify(b)
  } catch {
    return { ok: false, error: "body is not JSON" }
  }
  if (s.length > MAX_BODY_BYTES) return { ok: false, error: "body too large" }
  return { ok: true, body: b as Record<string, unknown> }
}
