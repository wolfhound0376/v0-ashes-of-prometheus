// Blood on the tiles.
//
// Sam: "Downed characters from melee attacks leave a small pool of blood. If
// you are inflicted with the bleeding condition from a weapon then blood
// loss pools (with subsequent damage) on the tiles. It stays there."
//
// A note on the rules, because this campaign has a history of invented
// mechanics reaching the table: SRD 5.1 has no Bleeding condition and no
// bleeding damage. So nothing here touches a hit point. A mark is laid when
// a WEAPON, swung in MELEE, either drops a creature to 0 or lands on one the
// DM has tagged "Bleeding" in its conditions — and that is the whole of what
// "Bleeding" does: it bleeds. The DM sets it and clears it by hand, the way
// any free-text condition is set.
//
// The marks live in vtt_maps.meta.marks, which every board already reads and
// which Realtime already publishes. They persist because the map row does.
//
// Pure. The route reads and writes the row; the board draws.

export interface BloodMark {
  /** Stable id so every board draws the same mark once. */
  id: string
  /** Grid square. */
  x: number
  y: number
  kind: "blood"
  /** Diameter in squares. A small pool is about a third of a square. */
  size: number
  /** Shape seed, so every board draws the same splatter. */
  seed: number
  /** ISO timestamp. */
  at: string
}

/** How many marks a map keeps. The oldest go first. A long campaign on one
 *  floor should look fought over, not tiled solid. */
export const MARK_CAP = 240

/**
 * Does this hit leave blood? Melee, with a weapon, and either the blow that
 * dropped them or a blow on someone already bleeding.
 */
export function bleeds(a: { melee: boolean; amount: number; fell: boolean; bleeding: boolean }): boolean {
  if (!a.melee || a.amount <= 0) return false
  return a.fell || a.bleeding
}

/**
 * Pool size in squares. The drop is "a small pool". A bleeding hit scales
 * with the damage, gently: a scratch is a spot, a greataxe is a spill, and
 * nothing reaches a whole square.
 */
export function poolSize(a: { amount: number; fell: boolean }): number {
  const base = a.fell ? 0.34 : 0.16
  const grow = Math.min(0.26, Math.max(0, a.amount) / 60)
  return Math.round((base + grow) * 100) / 100
}

/** Deterministic 32-bit seed from a string, so ids give shapes. */
export function seedFrom(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

export function makeMark(a: { x: number; y: number; size: number; at: string; salt: string }): BloodMark {
  const id = `blood-${a.x}-${a.y}-${a.at}-${a.salt}`
  return { id, x: a.x, y: a.y, kind: "blood", size: a.size, seed: seedFrom(id), at: a.at }
}

/** Coerce whatever the jsonb holds into marks; anything malformed is dropped. */
export function normaliseMarks(raw: unknown): BloodMark[] {
  if (!Array.isArray(raw)) return []
  const out: BloodMark[] = []
  for (const m of raw) {
    const r = m as Partial<BloodMark> | null
    if (!r || typeof r.id !== "string" || r.kind !== "blood") continue
    if (!Number.isInteger(r.x) || !Number.isInteger(r.y)) continue
    out.push({
      id: r.id,
      x: r.x as number,
      y: r.y as number,
      kind: "blood",
      size: typeof r.size === "number" && r.size > 0 ? r.size : 0.3,
      seed: typeof r.seed === "number" ? r.seed >>> 0 : seedFrom(r.id),
      at: typeof r.at === "string" ? r.at : "",
    })
  }
  return out
}

/** Append, de-duplicated by id, oldest dropped past the cap. */
export function appendMark(marks: BloodMark[], mark: BloodMark, cap = MARK_CAP): BloodMark[] {
  const kept = marks.filter((m) => m.id !== mark.id)
  kept.push(mark)
  return kept.length > cap ? kept.slice(kept.length - cap) : kept
}

/**
 * Where inside the square the pool sits, and how it is stretched. From the
 * seed, so it is the same on every screen. Offsets are in squares.
 */
export function placement(seed: number): { dx: number; dz: number; rot: number; stretch: number } {
  // Three cheap draws from one seed.
  const a = ((seed & 0xffff) / 0xffff)
  const b = (((seed >>> 8) & 0xffff) / 0xffff)
  const c = (((seed >>> 16) & 0xffff) / 0xffff)
  return {
    dx: (a - 0.5) * 0.36,
    dz: (b - 0.5) * 0.36,
    rot: c * Math.PI * 2,
    stretch: 0.85 + a * 0.3,
  }
}
