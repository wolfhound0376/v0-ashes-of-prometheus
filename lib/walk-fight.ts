/**
 * ONE FIGHT (Sam, 2026-11-10: "fight MUST be synced and wait for other players actions, and have complete parity").
 * The rules /api/walk-fight applies, kept pure so they can be tested (lib/walk-fight.test.ts).
 *
 *  - One live fight per campaign run. The screen that opens it is its AUTHORITY: the only one that rolls, decides and
 *    writes ticks. Every other screen shows it from the ticks.
 *  - A fight whose authority has gone quiet for FIGHT_STALE_MS is let go: the next screen to open one gets it.
 *  - A FIGHT SURVIVES ITS SCREEN (review of #1272: reload or close the screen that runs a fight and every other
 *    screen stayed frozen in combat). A fight whose authority has been quiet for FIGHT_HANDOVER_MS is HANDED ON to a
 *    screen that is showing it, which carries on from the last tick. The order is One World's own (driverOf: the DM,
 *    then the lowest seat), with the screen that went quiet last; each place further down the order waits
 *    FIGHT_HANDOVER_STEP_MS longer, so the next in line takes it if the first is not there. The row is changed with a
 *    compare-and-set, so exactly one screen gets it. A fight nobody could carry for FIGHT_LOST_MS may be ended by anyone
 *    seated. A fight that is ticking can be neither taken nor ended by another screen.
 *  - Anyone seated may send an input; the authority itself checks it comes from the driver of the hero whose turn it is.
 */

import { driverOf, type Seat } from "./walk-world"

export const FIGHT_STALE_MS = 60_000
/** Silence from the authority before the fight is handed on. Its ticks come at least every 2.5 s. */
export const FIGHT_HANDOVER_MS = 8_000
/** Each place further down the hand-over order waits this much longer. */
export const FIGHT_HANDOVER_STEP_MS = 2_000
/** Silence after which a fight no screen has carried on may be ended by any seated screen. */
export const FIGHT_LOST_MS = 30_000
export const MAX_BODY_BYTES = 256_000
export const MAX_READ = 200

export interface LiveFight {
  id: string
  plate: string
  auth_key: string
  auth_seen: string
  started_at: string
  ended_at: string | null
  campaign_run_id?: string
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

/** How long the authority has been silent. */
export function quietFor(f: LiveFight, now: number): number {
  return now - Date.parse(f.auth_seen)
}

/**
 * Who a quiet fight is offered to, first to last: One World's hand-over order for a hero whose player is gone
 * (driverOf: the DM if connected, then the lowest connected seat), with the screen that went quiet moved to the end
 * (it may be back after a reload, but a screen that never stopped watching goes first).
 */
export function handoverOrder(seats: Record<string, Seat> | null | undefined, authKey: string, now: number): string[] {
  const left: Record<string, Seat> = { ...(seats || {}) }
  const order: string[] = []
  for (let k = driverOf(null, left, now); k != null && order.length < 64; k = driverOf(null, left, now)) {
    order.push(k)
    delete left[k]
  }
  return order.includes(authKey) ? [...order.filter((k) => k !== authKey), authKey] : order
}

/**
 * May `who` take this fight over now? Never while its authority is ticking. Otherwise each screen in the hand-over
 * order gets its turn: place n may take it once the silence has lasted FIGHT_HANDOVER_MS + n * FIGHT_HANDOVER_STEP_MS.
 * A caller One World does not know as connected waits behind everyone it does.
 */
export function takeDecision(
  f: LiveFight | null, who: string, seats: Record<string, Seat> | null | undefined, now: number,
): { ok: true } | { ok: false; why: "ended" | "held" | "wait"; waitMs: number } {
  if (!f || f.ended_at) return { ok: false, why: "ended", waitMs: 0 }
  const quiet = quietFor(f, now)
  if (quiet < FIGHT_HANDOVER_MS) return { ok: false, why: "held", waitMs: FIGHT_HANDOVER_MS - quiet }
  const order = handoverOrder(seats, f.auth_key, now)
  const place = order.includes(who) ? order.indexOf(who) : order.length
  const due = FIGHT_HANDOVER_MS + place * FIGHT_HANDOVER_STEP_MS
  return quiet >= due ? { ok: true } : { ok: false, why: "wait", waitMs: due - quiet }
}

/** A fight nobody has carried on may be ended by any seated screen, never one that is ticking. */
export function mayEndLost(f: LiveFight | null, now: number): boolean {
  return !!f && !f.ended_at && quietFor(f, now) >= FIGHT_LOST_MS
}

/** The table is not there (migration unapplied): PostgREST says PGRST205 "Could not find the table ... in the schema cache", Postgres 42P01. */
export function tableMissing(e: { code?: string | null; message?: string | null } | string | null | undefined): boolean {
  const s = typeof e === "string" ? e : `${e?.code ?? ""} ${e?.message ?? ""}`
  return /PGRST205|42P01|schema cache|relation .* does not exist/i.test(s)
}
