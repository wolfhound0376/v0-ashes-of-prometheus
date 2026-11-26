// The hit points the painted map hands to /api/walk-hp, read safely off a request body.
//
// Sam, 2026-11-25: wounds are kept until a rest, a heal or a level-up changes them. The map sends what a fight left
// each hero with; this is the one place that decides what a well-formed line of that looks like.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type Wound = { id: string; hp: number }

/** `[{characterId, hp}]` from a body: real ids, whole numbers from 0 to 999, the last line for a hero wins, 12 at most. */
export function woundsToWrite(raw: unknown): Wound[] {
  if (!Array.isArray(raw)) return []
  const by = new Map<string, number>()
  for (const x of raw) {
    const id = String((x as { characterId?: unknown })?.characterId ?? "")
    const n = Number((x as { hp?: unknown })?.hp)
    if (!UUID.test(id) || !Number.isFinite(n)) continue
    by.set(id, Math.max(0, Math.min(999, Math.floor(n))))
  }
  return [...by].slice(0, 12).map(([id, hp]) => ({ id, hp }))
}

/**
 * The hit points a hero begins a fight with: what their sheet says now, never more than their maximum. A hero on
 * their feet has at least 1 (0 is on the floor); a sheet with no current number is a hero at full.
 */
export function fightStartHp(hpMax: number, hpNow: number | null | undefined, down = false): number {
  const max = Math.max(1, Math.floor(Number(hpMax) || 1))
  if (hpNow == null || !Number.isFinite(Number(hpNow))) return max
  return Math.min(max, Math.max(down ? 0 : 1, Math.floor(Number(hpNow))))
}
