// THE LOAD GAME BOOK (Sam, 2026-11-23: "PR4"; research doc claude/Tables_Invites_Saves_Research_2026-11-23.md §3D).
//
// The shelf's rows grouped the way Baldur's Gate 3 shows them: one card per CAMPAIGN (its head — the world as it was
// last saved), newest first, and under each card its CHECKPOINTS, newest first (autosaves at End and before a
// Rewind, and the host's named "Save now"). Continue and Load play the head; a checkpoint is played with Rewind,
// never in Mortal Mode.
//
// Pure: no Supabase, no window — the route adds the pictures (lib/plate-art.ts) and the portraits.

import type { SaveKind, SaveRow } from "@/lib/saves"

export type Checkpoint = Pick<SaveRow, "id" | "name" | "saved_at" | "session_no" | "plate" | "party"> & { kind: Exclude<SaveKind, "head"> }

export type CampaignCard = SaveRow & {
  checkpoints: Checkpoint[]
  /** When anything in this campaign was last saved (the card's sort key). */
  lastPlayed: string
}

/** Group the shelf into campaigns. Rows written before part 2 (no kind) are heads of their own campaigns. */
export function bookOf(rows: SaveRow[]): CampaignCard[] {
  const heads = new Map<string, CampaignCard>()
  const loose: SaveRow[] = []
  for (const r of rows) {
    const kind = r.kind ?? "head"
    if (kind === "head") heads.set(r.campaign_id ?? r.id, { ...r, kind: "head", checkpoints: [], lastPlayed: r.saved_at })
    else loose.push(r)
  }
  for (const r of loose) {
    const card = heads.get(r.campaign_id ?? "")
    if (!card) continue // a checkpoint whose campaign is gone is not shown
    card.checkpoints.push({ id: r.id, name: r.name, saved_at: r.saved_at, session_no: r.session_no, plate: r.plate ?? null, party: r.party ?? [], kind: r.kind as Exclude<SaveKind, "head"> })
    if (r.saved_at > card.lastPlayed) card.lastPlayed = r.saved_at
  }
  const cards = [...heads.values()]
  for (const c of cards) c.checkpoints.sort((a, b) => b.saved_at.localeCompare(a.saved_at))
  return cards.sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed))
}

/** "3 h 20 m", "45 m", or "" when nothing has been played yet. */
export function playedFor(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(seconds ?? 0))
  if (s < 60) return ""
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h ? `${h} h ${m} m` : `${m} m`
}

/** Seconds of play to add at End: from the moment the session went live to now. Nothing for a lobby that never started. */
export function sessionSeconds(startedAt: string | null | undefined, now = Date.now()): number {
  if (!startedAt) return 0
  const t = Date.parse(startedAt)
  if (!Number.isFinite(t) || t > now) return 0
  return Math.min(Math.floor((now - t) / 1000), 24 * 3600) // a table left live for days counts one day at most
}
