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

/**
 * A FIGHT OUTLIVES A REFRESH (Sam, 2026-11-15: "Something must protect syncs between cooperative play when one person
 * refreshes his browser"). The authority holds everything only in its page; a refresh there used to leave the fight
 * held by nobody for a minute and then lost. Now a screen showing the fight may CLAIM it once the authority has sent
 * nothing for this long, and carries it on from its own copy; and a page that knows it has lost its fight (it reloaded)
 * RELEASES it at once so a mirror can.
 */
export const CLAIM_QUIET_MS = 8_000

/** May a screen take over this fight now? Live, and its authority quiet for CLAIM_QUIET_MS. */
export function mayClaim(f: LiveFight | null, now: number): boolean {
  return !!f && !f.ended_at && now - Date.parse(f.auth_seen) >= CLAIM_QUIET_MS
}
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

/**
 * A SCENE IS SHARED THE SAME WAY (Sam, 2026-11-20: "all events should be world events"). Outside a fight, the screen
 * that triggers a scene (the pen gate's volley, the surgeon, a film) is its authority and every other screen on that
 * plate shows it, over this same lane: the same row, the same ticks. A scene's row carries its plate as
 * "scene:<plate>", so no new table or column is needed and a page from before this change (which compares the plate
 * with its own) simply does not see it.
 */
export const SCENE_PREFIX = "scene:"
export function isScenePlate(plate: unknown): boolean {
  return typeof plate === "string" && plate.startsWith(SCENE_PREFIX)
}

/**
 * What "open a fight (or a scene) on this plate" comes to: join the one that is held, or take it (ending a stale one
 * first). A FIGHT OUTRANKS A SCENE: a fight that opens while a scene holds the run's one live row ends the scene and
 * takes the row, so a scene can never leave a fight unshared. A scene that opens while a fight is held joins it (the
 * caller sees it is not its scene and plays alone, as every scene did before).
 */
export function openDecision(f: LiveFight | null, now: number, plate = ""): { kind: "join"; fight: LiveFight } | { kind: "take"; endStale: string | null } {
  if (f && isHeld(f, now) && !(isScenePlate(f.plate) && !isScenePlate(plate))) return { kind: "join", fight: f }
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
