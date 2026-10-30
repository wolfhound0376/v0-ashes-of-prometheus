// ENTERING THE MAP TOGETHER (Sam, 2026-10-29: "The DM should NOT enter the map after them but we all enter
// the same time").
//
// Before this, the DM went straight from the Act card to the map while each player walked through their own
// /awaken at their own pace, so people landed on the Underwalk one at a time, minutes apart. Now there is one
// gate per session. Each seated player reaches it when their /awaken ends; the DM reaches it after his Act card.
// Nobody passes until the gate opens, and it opens for everyone at the same wall-clock moment (`goAt`), which
// every screen counts down to from the server's clock.
//
// The gate opens when ANY of these is true:
//   1. every expected player is at the gate         → the last one's arrival + GRACE_MS
//   2. the DM pressed "Bring them in now"           → his press + GRACE_MS
//   3. no player is expected (the DM alone, or only his own companions) → the session start + GRACE_MS
//   4. CEILING_MS has passed since the session started → then, so a closed laptop never holds the table
//
// Expected = seated, not a DM-run companion, not excused ("away"). A player excused or let back in later
// simply finds the gate already open and walks straight through.
//
// Kept in world_flags, one row per arrival (`entry:<session>:<characterId>`) so two players arriving at once
// never overwrite each other, plus `entry-go:<session>` for the DM's press. The session number is in the key,
// so last session's rows can never open this one's gate; a campaign restart clears them with every other flag.
//
// Pure: no Supabase, no window.

export const ENTRY_PREFIX = "entry:"
export const entryKey = (session: number, characterId: string) => `${ENTRY_PREFIX}${session}:${characterId}`
export const entryGoKey = (session: number) => `entry-go:${session}`

/** The beat between the gate opening and everyone stepping through, so every screen hears about it in time. */
export const GRACE_MS = 2500
/** The longest the gate waits for a player who never arrives, counted from the session's start. */
export const CEILING_MS = 5 * 60 * 1000

export type EntrySeat = { id: string; name: string; dm?: boolean; away?: boolean }
export type Person = { id: string; name: string }

/** The players the gate waits for. */
export function expectedOf(seats: readonly EntrySeat[]): Person[] {
  return seats.filter((s) => !s.dm && !s.away).map((s) => ({ id: s.id, name: s.name }))
}

export type GateInput = {
  expected: readonly Person[]
  /** characterId → when they reached the gate (ms since epoch). */
  arrivedAt: Readonly<Record<string, number>>
  /** When the DM pressed "Bring them in now", if he did. */
  forcedAt: number | null
  /** When the session went live. */
  startedAt: number | null
  now: number
}

export type GateState = {
  /** The moment everyone steps through, or null while still waiting. */
  goAt: number | null
  why: "all" | "dm" | "alone" | "ceiling" | null
  arrived: Person[]
  waitingFor: Person[]
}

export function gate(i: GateInput): GateState {
  const arrived = i.expected.filter((p) => typeof i.arrivedAt[p.id] === "number")
  const waitingFor = i.expected.filter((p) => typeof i.arrivedAt[p.id] !== "number")
  const base = { arrived, waitingFor }
  if (i.forcedAt != null) return { ...base, goAt: i.forcedAt + GRACE_MS, why: "dm" }
  const start = i.startedAt ?? i.now
  if (i.expected.length === 0) return { ...base, goAt: start + GRACE_MS, why: "alone" }
  if (waitingFor.length === 0) {
    const last = Math.max(...arrived.map((p) => i.arrivedAt[p.id]))
    return { ...base, goAt: last + GRACE_MS, why: "all" }
  }
  if (i.now >= start + CEILING_MS) return { ...base, goAt: start + CEILING_MS, why: "ceiling" }
  return { ...base, goAt: null, why: null }
}

/** How long a screen should still wait, given the server's clock. Never negative. */
export function msUntil(goAt: number | null, serverNow: number): number | null {
  return goAt == null ? null : Math.max(0, goAt - serverNow)
}
