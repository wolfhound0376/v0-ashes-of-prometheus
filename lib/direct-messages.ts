// Player-to-player messages — the pure half (Sam, 2026-10-26: a button on the dashboard and on the pixel map
// "to communicate with another player").
//
// A message is a `dialogue` row with channel 'direct', `speaker` = the sender's hero name and `recipient` =
// the addressee's hero name (migration 20261026210000_dialogue_direct_messages.sql). Nothing here touches
// Supabase; the button (components/message-player-button.tsx) does the reading and writing.

export const DIRECT_CHANNEL = "direct" as const

export type DirectRow = {
  id: string
  speaker: string
  recipient: string | null
  text: string
  created_at: string
}

/** A seat as /api/table reports it — only the fields this needs. */
export type SeatLike = { id: string; name: string; dm?: boolean; away?: boolean; thumbnail?: string | null }

export type Contact = { id: string; name: string; thumbnail: string | null }

/** Longest message accepted; a note between players, not a letter. */
export const MAX_MESSAGE = 500

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase()

/**
 * Who this hero can message: everyone else seated at the live table. A DM-run companion is not a player (the DM
 * speaks for it through Malachar), and a player the DM stepped away is not at the table right now.
 */
export function contactsFor(seats: readonly SeatLike[], myId: string | null | undefined): Contact[] {
  return seats
    .filter((s) => s.id !== myId && !s.dm && !s.away && s.name?.trim())
    .map((s) => ({ id: s.id, name: s.name.trim(), thumbnail: s.thumbnail ?? null }))
}

/** True when the row belongs to the conversation between `me` and `them`, in either direction. */
export function inThread(row: Pick<DirectRow, "speaker" | "recipient">, me: string, them: string): boolean {
  return (same(row.speaker, me) && same(row.recipient, them)) || (same(row.speaker, them) && same(row.recipient, me))
}

/** The conversation between two heroes, oldest first. */
export function threadOf<R extends DirectRow>(rows: readonly R[], me: string, them: string): R[] {
  return rows.filter((r) => inThread(r, me, them)).sort((a, b) => a.created_at.localeCompare(b.created_at))
}

/** True when a row was sent to `me` (so it can be unread). */
export function isForMe(row: Pick<DirectRow, "speaker" | "recipient">, me: string): boolean {
  return same(row.recipient, me) && !same(row.speaker, me)
}

/**
 * Unread messages per sender: rows addressed to me, newer than the last time I opened that sender's thread.
 * `lastRead` maps a lower-cased sender name to an ISO timestamp.
 */
export function unreadBySender(rows: readonly DirectRow[], me: string, lastRead: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    if (!isForMe(r, me)) continue
    const key = r.speaker.trim().toLowerCase()
    const seen = lastRead[key]
    if (seen && r.created_at <= seen) continue
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}

export function totalUnread(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0)
}

/** Cleans a message for sending; null when there is nothing to send. */
export function cleanMessage(text: string): string | null {
  const t = text.replace(/\s+/g, " ").trim()
  if (!t) return null
  return t.length > MAX_MESSAGE ? t.slice(0, MAX_MESSAGE) : t
}

/** The row to insert. `recipient` is the addressee's hero name, exactly as the table shows it. */
export function directRow(from: string, to: string, text: string) {
  return { speaker: from, speaker_type: "player", channel: DIRECT_CHANNEL, recipient: to, text }
}
