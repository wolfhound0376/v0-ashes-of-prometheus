// ONE SPEAKER PER CONVERSATION (Sam, 2026-11-20, after a playtest where Fifi and Kenta both talked to Jorlan:
// "It was a mess. We were not in sync, he was talking to both of us at the same time with options rapidly
// cycling. Communication should be just like BG3. The principal character communicates, others can watch and
// even suggest but not directly interact.")
//
// What the log showed that night (dialogue, 01:50:31-01:52:01 UTC): Jorlan opened the same talk five separate
// times, to "human" and to "half-breed" in turn, and offered the escape twice. Nothing in the game knew a
// conversation was already going: each screen started its own with him, and each reply got its own answer.
//
// The rule, as Baldur's Gate 3 plays it:
//   - Whoever starts talking to an NPC HOLDS THE FLOOR with that NPC. Their lines are the only ones the NPC answers.
//   - Anyone else who goes to that NPC LISTENS IN: they see the talk, and what they type goes to the speaker as a
//     SUGGESTION, never to the NPC and never to Malachar.
//   - The floor is given up when the speaker leaves the talk, and lapses by itself if their screen goes quiet
//     (a closed tab must not lock an NPC for the night).
//   - Two heroes may still hold two different conversations with two different NPCs at once.
//   - The DM is never refused.
//
// The floor lives in table talk_floor (one row per NPC in conversation), written only through /api/talk-floor.
// This file is the rule; the Underwalk (scripts/velkynvelve-walk/template.html) applies the same rule inline.

/** A speaker's screen beats this often while the talk is open. */
export const FLOOR_BEAT_MS = 6_000
/** With no beat for this long the floor is free again. House number, not Sam's. */
export const FLOOR_STALE_MS = 45_000
export const SUGGESTION_MAX = 200
export const SUGGESTIONS_KEPT = 6

export type FloorSuggestion = { from: string; text: string; at: string }
export type FloorRow = {
  npc: string
  npc_name: string
  speaker: string
  speaker_id: string | null
  started_at: string
  beat_at: string
  suggestions: FloorSuggestion[] | null
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ")

/** The row key for an NPC: their name, lowercased. */
export const floorKey = (npc: unknown) => norm(npc).slice(0, 60)

export const sameHero = (a: unknown, b: unknown) => !!norm(a) && norm(a) === norm(b)

/** "Jorlan" and "Jorlan Duskryn" are one NPC; "Drow Guard" and "Drow Elite Warrior" are not. */
export function sameNpc(a: unknown, b: unknown): boolean {
  const x = floorKey(a), y = floorKey(b)
  if (!x || !y) return false
  if (x === y) return true
  const xs = x.split(" "), ys = y.split(" ")
  return (xs.length === 1 && ys[0] === x) || (ys.length === 1 && xs[0] === y)
}

export function floorLive(row: Pick<FloorRow, "beat_at"> | null | undefined, nowMs: number): boolean {
  if (!row) return false
  const at = Date.parse(row.beat_at)
  return Number.isFinite(at) && nowMs - at < FLOOR_STALE_MS
}

/** The live floor for this NPC, if someone holds it. */
export function floorFor<T extends Pick<FloorRow, "npc" | "beat_at">>(rows: T[] | null | undefined, npc: unknown, nowMs: number): T | null {
  return (rows ?? []).find((r) => sameNpc(r.npc, npc) && floorLive(r, nowMs)) ?? null
}

/** Who else is speaking with this NPC right now: their hero's name, or null when the floor is free or already mine. */
export function heldByAnother(rows: Array<Pick<FloorRow, "npc" | "beat_at" | "speaker">> | null | undefined, npc: unknown, hero: unknown, nowMs: number): string | null {
  const row = floorFor(rows, npc, nowMs)
  return row && !sameHero(row.speaker, hero) ? row.speaker : null
}

export function cleanSuggestion(text: unknown): string {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, SUGGESTION_MAX)
}

/** Add one suggestion; a hero's newer suggestion replaces their older one, and only the last few are kept. */
export function addSuggestion(list: FloorSuggestion[] | null | undefined, s: FloorSuggestion): FloorSuggestion[] {
  return [...(list ?? []).filter((x) => !sameHero(x.from, s.from)), s].slice(-SUGGESTIONS_KEPT)
}

/** The suggestions still worth showing the speaker: made after their own last line. */
export function freshSuggestions(list: FloorSuggestion[] | null | undefined, sinceMs: number): FloorSuggestion[] {
  return (list ?? []).filter((s) => Date.parse(s.at) > sinceMs)
}
