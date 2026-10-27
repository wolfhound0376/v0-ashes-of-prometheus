// ============================================================================
// WALK ACTION HAND-OFF — the painted map tells Malachar what a hero just did.
//
// Listen, Search here, Look closer, Pray, Inspire and the like roll on the map
// and then need the DM to say what comes of it ("What can they hear beyond
// it?"). The map posts {type: "aop:action", id, text, characterId, ask: true}
// to the page around it; components/walk/walk-roll-bridge.tsx sends the text
// to /api/chat as a stage direction about that hero and posts the reply back
// as {type: "aop:action-reply", id, text, sandbox}.
//
// Sam, 2026-10-27: "I was sneaking and listening but nothing happened when I
// listened". Until this file the map posted `aop:action` and nothing in the
// app listened for it, so every hand-off went nowhere.
//
// TWO KINDS. `ask: true` marks a hand-off the player clicked in this browser:
// it is sent on directly. `event: true` (with `sig`) marks an AUTOMATIC one —
// a guard spots the sneak, combat opens, Jorlan speaks at the bars — which
// runs in every browser at the table at once; the bridge first claims its
// fingerprint at /api/walk-event, and only the first screen to claim it sends
// it on, so Malachar answers each event once (Sam, 2026-10-27: "Build all of
// it"). Anything with neither flag is ignored.
// ============================================================================

/** Longest hand-off text accepted. The map's longest line is ~600 characters. */
export const WALK_ACTION_MAX = 2000

export interface WalkActionRequest {
  type: "aop:action"
  id: string
  text: string
  characterId: string | null
  /** An automatic event: claim `sig` at /api/walk-event first; only the first screen sends it on. */
  event: boolean
  sig: string | null
  /** A private turn (a silent prayer): the answer comes back to this screen only and is not written to the shared log.
   *  Clicks only — an automatic event is the table's by nature. */
  private: boolean
}

/** The server's window for one event (/api/walk-event): the same thing again after this is a new event. */
export const WALK_EVENT_BUCKET_MS = 30_000

/** An event fingerprint as the map makes it ("ev-" + base-36 hash). Checked before anything is written. */
export function isWalkEventSig(v: unknown): v is string {
  return typeof v === "string" && /^ev-[a-z0-9]{4,40}$/.test(v)
}

export interface WalkActionReply {
  type: "aop:action-reply"
  id: string
  ok: boolean
  /** Malachar's reply, when there is one. */
  text?: string
  /** True for a rehearsal turn: nothing went to the log, so the map shows the reply itself. */
  sandbox?: boolean
  error?: string
}

/** The request, or null for anything the bridge must ignore. */
export function parseWalkActionRequest(d: unknown): WalkActionRequest | null {
  if (!d || typeof d !== "object") return null
  const m = d as Record<string, unknown>
  const event = m.event === true && isWalkEventSig(m.sig)
  if (m.type !== "aop:action" || (m.ask !== true && !event)) return null
  if (typeof m.id !== "string" || !m.id || m.id.length > 64) return null
  if (typeof m.text !== "string") return null
  const text = m.text.trim()
  if (!text || text.length > WALK_ACTION_MAX) return null
  const characterId = typeof m.characterId === "string" && m.characterId ? m.characterId : null
  return { type: "aop:action", id: m.id, text, characterId, event: m.ask !== true && event, sig: event ? (m.sig as string) : null, private: m.ask === true && m.private === true }
}
