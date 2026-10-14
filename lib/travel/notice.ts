// lib/travel/notice.ts — the passive roll at every marker.
//
// Sam (2026-10-14): a short cue at each node "with a passive roll", default DC 12
// for plain markers, and the passive-roll sound is heard even when nothing is found.
//
// SRD 5.1 "Noticing Threats" (PHB ch.8): while travelling, characters use their
// passive Wisdom (Perception) scores to notice hidden threats. Each character's
// own score counts, so the best eyes in the party are the ones that notice. The
// pace applies first: fast pace is −5 (OotA-Enc ch.2 p.24) — the caller hands in
// scores with the pace already applied (`marchPassivePerception`).
//
// The DC itself is homebrew, authored per node in travel_nodes.metadata.notice_dc
// (Sam's default 12). No dice: a passive score is compared, never rolled.

export const DEFAULT_NOTICE_DC = 12
export const NOTICE_SOURCE = "SRD 5.1 Noticing Threats (passive Perception); DC homebrew per node, default 12 (Sam, 2026-10-14)"

export interface Eyes {
  id: string
  name: string
  /** Passive Wisdom (Perception), pace penalty already applied. */
  passive: number
}

export interface NoticeResult {
  dc: number
  /** The sharpest eyes in the party, or null when nobody is on the march. */
  best: Eyes | null
  noticed: boolean
  /** best.passive − dc; negative when missed. */
  margin: number
  /** What the DC guards, from the node's metadata — null means "nothing here to find". */
  reveals: string | null
  text: string | null
  /** The chip on the map: "Fifi's eyes · passive 13 vs DC 12 · noticed". */
  chip: string
  source: string
}

/** The node's authored notice fields, read from its metadata jsonb. */
export function noticeSpec(metadata: Record<string, unknown> | null | undefined): { dc: number; reveals: string | null; text: string | null } {
  const m = metadata ?? {}
  const dcRaw = Number(m.notice_dc)
  const dc = Number.isFinite(dcRaw) && dcRaw > 0 ? Math.round(dcRaw) : DEFAULT_NOTICE_DC
  const reveals = typeof m.notice_reveals === "string" && m.notice_reveals.trim() ? m.notice_reveals.trim() : null
  const text = typeof m.notice_text === "string" && m.notice_text.trim() ? m.notice_text.trim() : null
  return { dc, reveals, text }
}

/** Compare the party's passive scores with the node's DC. Pure. */
export function noticeAt(spec: { dc: number; reveals: string | null; text: string | null }, party: readonly Eyes[]): NoticeResult {
  let best: Eyes | null = null
  for (const e of party) if (!best || e.passive > best.passive) best = e
  const noticed = !!best && best.passive >= spec.dc
  const margin = best ? best.passive - spec.dc : -spec.dc
  const chip = best
    ? `${best.name}'s eyes · passive ${best.passive} vs DC ${spec.dc} · ${noticed ? "noticed" : "missed"}`
    : `No one on the march · DC ${spec.dc}`
  return {
    dc: spec.dc,
    best,
    noticed,
    margin,
    reveals: noticed ? spec.reveals : null,
    text: noticed ? spec.text : null,
    chip,
    source: NOTICE_SOURCE,
  }
}
