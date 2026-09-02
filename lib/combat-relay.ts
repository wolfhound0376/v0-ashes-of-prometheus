// ============================================================================
// SWINGS — what an NPC just did, relayed to every seat that is watching.
//
// The NPC turn is resolved by ONE browser: the DM's, because it holds the key
// and because four seats racing to resolve a goblin's attack would deal its
// damage four times. So the DM's seat is the only one that ever receives the
// server's account of the swing — who struck whom, hit or miss, by how much.
//
// Everyone else sees the consequences arrive over realtime: the token glides,
// a number rises off the target. What they never saw was the swing itself, or
// the target getting out of its way. This module carries the server's answer
// from the seat that has it to the seats that do not, so all of them animate
// the same blow from the same dice.
//
// It is the same client-side pattern lib/sfx-cues uses, for the same reason:
// the seat that acted already has the facts, and a server-side channel would
// be a second copy of them. The receiver plays LOCALLY and never relays, so
// two seats cannot bounce one swing back and forth.
//
// TOLERANCE IS THE POINT, as it is for cues. A payload off the wire is
// validated field by field, a malformed one is dropped without a sound, and
// nothing in here may throw into the board. A missed animation on one seat
// is not worth taking the turn down for.
// ============================================================================
import { createClient } from "@/lib/supabase/client"

/**
 * One NPC attack, in the same vocabulary the player's cast verb reports
 * (see app/api/combat/route.ts): `outcome` and `margin` are what defenceFor
 * turns into a motion; `hit` and `crit` are what the blade sounds like.
 */
export interface SwingEvent {
  caster_token: string
  target_token: string
  /** The attack's name off the stat block — "Scimitar", "Bite", "Hand Crossbow". */
  weapon: string
  ranged: boolean
  /** Where the creature moved to before striking, or null if it stood still. */
  to: { x: number; y: number } | null
  hit: boolean
  crit: boolean
  fumble: boolean
  amount: number
  roll: number
  total: number
  dc: number
  margin: number
  /** hit | crit | miss | fumble — a weapon never asks for a save. */
  outcome: string
  /** The sandbox board and the live one share a channel; this keeps them apart. */
  sandbox: boolean
}

const CHANNEL = "combat-broadcast"
const EVENT = "swing"

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

/** Untrusted input off the wire (or off a response) → a SwingEvent, or null. */
export function parseSwing(v: unknown): SwingEvent | null {
  try {
    if (!v || typeof v !== "object") return null
    const s = v as Record<string, unknown>
    if (typeof s.caster_token !== "string" || !s.caster_token) return null
    if (typeof s.target_token !== "string" || !s.target_token) return null
    if (typeof s.outcome !== "string" || !s.outcome) return null
    if (!num(s.margin) || !num(s.amount)) return null
    const to = s.to && typeof s.to === "object" ? (s.to as Record<string, unknown>) : null
    return {
      caster_token: s.caster_token,
      target_token: s.target_token,
      weapon: typeof s.weapon === "string" && s.weapon ? s.weapon : "Attack",
      ranged: s.ranged === true,
      to: to && num(to.x) && num(to.y) ? { x: to.x, y: to.y } : null,
      hit: s.hit === true,
      crit: s.crit === true,
      fumble: s.fumble === true,
      amount: s.amount,
      roll: num(s.roll) ? s.roll : 0,
      total: num(s.total) ? s.total : 0,
      dc: num(s.dc) ? s.dc : 0,
      margin: s.margin,
      outcome: s.outcome,
      sandbox: s.sandbox === true,
    }
  } catch {
    return null
  }
}

/**
 * Hand a swing to the other seats. The caller has already played it locally;
 * this must never be called from the receive path.
 */
export function relaySwing(swing: SwingEvent): void {
  try {
    void createClient()
      .channel(CHANNEL)
      .subscribe()
      .send({ type: "broadcast", event: EVENT, payload: { swing } })
  } catch (err) {
    console.warn("[combat] swing relay failed, animated locally only:", err)
  }
}

/** Listen for swings from the other seats. Returns its own teardown. */
export function subscribeSwings(handler: (swing: SwingEvent) => void): () => void {
  try {
    const client = createClient()
    const channel = client
      .channel(CHANNEL)
      .on("broadcast", { event: EVENT }, (message: { payload?: unknown }) => {
        const swing = parseSwing((message?.payload as { swing?: unknown })?.swing)
        if (!swing) return
        try {
          handler(swing)
        } catch (err) {
          console.warn("[combat] swing handler failed, ignored:", err)
        }
      })
      .subscribe()
    return () => {
      try {
        void client.removeChannel(channel)
      } catch {
        /* teardown must never throw during unmount */
      }
    }
  } catch (err) {
    console.warn("[combat] swing subscription unavailable:", err)
    return () => {}
  }
}
