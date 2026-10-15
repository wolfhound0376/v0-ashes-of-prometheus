// Bardic Inspiration — the rule, pure, and the shape it is stored in.
//
// THE RULE (Bard, level 1). Scott's sheet cites SRD 5.2.1, which Sam ruled
// canon on 2026-10-01. SRD 5.2.1 is NOT ingested into campaign_chunks, so the
// 5.2.1 wording below is from memory and is marked to be checked against the
// book; the SRD 5.1 text IS ingested and is quoted where the two agree.
//
//   - A Bonus Action. One creature other than the bard, within 60 ft, who can
//     hear the bard (5.2.1: see or hear). It gains one Bardic Inspiration die.
//   - A creature holds only one die at a time (both editions).
//   - Uses = the bard's Charisma modifier, minimum 1. All come back on a long
//     rest (both editions). From level 5 they also come back on a short rest
//     (Font of Inspiration).
//   - The die: d6, d8 at 5, d10 at 10, d12 at 15 (both editions).
//   - How long it lasts: 10 minutes in 5.1; one hour in 5.2.1. CHECK 5.2.1.
//   - When it is spent: 5.1 — on any ability check, attack roll or saving
//     throw, after the d20 and before the DM says how it went. 5.2.1 — when
//     the holder FAILS a D20 Test (check, attack, save), turning the failure
//     into a possible success. The painted map already spends it only on a
//     roll that would fail, which is the 5.2.1 reading. CHECK 5.2.1.
//
// WHERE IT LIVES. One jsonb column, `characters.sheet_resources`, on every
// character row — PC or NPC, so Ront can hold Scott's die exactly as Fifi can:
//
//   the bard:    { "bardic_inspiration": { "used": 1 } }
//   the holder:  { "inspiration_held": { "die": 6, "from_id": "…", "from_name": "Scott", "granted_at": 4325 } }
//
// Only `used` is stored for the bard. The number of uses and the die size are
// worked out from the sheet every time (cha_modifier, level), so a level-up
// or a Charisma change can never leave a stale maximum behind.
//
// `granted_at` is the world clock in absolute minutes (lib/long-rest
// absoluteMinutes). Null when the clock could not be read — then the die does
// not expire on its own, and the reader says so rather than guessing.

/** 5.2.1 says one hour; 5.1 says ten minutes. The campaign is on 5.2.1. */
export const INSPIRATION_MINUTES = 60
/** Same 60 ft in both editions. */
export const INSPIRATION_RANGE_FT = 60

export type BardSheet = {
  class?: string | null
  level?: number | null
  cha_modifier?: number | null
  sheet_resources?: unknown
}

export type HeldInspiration = {
  die: number
  from_id: string | null
  from_name: string | null
  granted_at: number | null
}

export type Resources = Record<string, unknown> & {
  bardic_inspiration?: { used?: number }
  inspiration_held?: HeldInspiration
}

/** The stored object, or an empty one for null / a non-object. */
export function readResources(raw: unknown): Resources {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Resources) } : {}
}

/**
 * Bard levels on the row. `class` is free text today ("Bard", or "Rogue 3 /
 * Bard 2" once multiclass lands), so a bare "Bard" means every level is a bard
 * level and a split class reads the number after the word.
 */
export function bardLevel(c: { class?: string | null; level?: number | null }): number {
  const cls = String(c.class ?? "")
  if (!/\bbard\b/i.test(cls)) return 0
  const split = cls.match(/\bbard\s*(\d+)/i)
  if (split) return Math.max(0, Math.trunc(Number(split[1])))
  return Math.max(1, Math.trunc(Number(c.level) || 1))
}

/** d6 / d8 / d10 / d12 by bard level; 0 for a non-bard. */
export function inspirationDie(level: number): number {
  if (level <= 0) return 0
  if (level >= 15) return 12
  if (level >= 10) return 10
  if (level >= 5) return 8
  return 6
}

/** Uses per long rest: the Charisma modifier, never fewer than one. */
export function inspirationUses(chaModifier: number | null | undefined): number {
  return Math.max(1, Math.trunc(Number(chaModifier) || 0))
}

export type BardState = {
  isBard: boolean
  level: number
  die: number
  max: number
  used: number
  left: number
}

export function bardState(c: BardSheet): BardState {
  const level = bardLevel(c)
  if (!level) return { isBard: false, level: 0, die: 0, max: 0, used: 0, left: 0 }
  const max = inspirationUses(c.cha_modifier)
  const used = Math.min(max, Math.max(0, Math.trunc(Number(readResources(c.sheet_resources).bardic_inspiration?.used) || 0)))
  return { isBard: true, level, die: inspirationDie(level), max, used, left: max - used }
}

/** The die a character is carrying, if it is still good at `now`. */
export function heldInspiration(raw: unknown, now: number | null): HeldInspiration | null {
  const h = readResources(raw).inspiration_held
  if (!h || !Number.isInteger(h.die) || h.die <= 0) return null
  if (now != null && h.granted_at != null && now - h.granted_at > INSPIRATION_MINUTES) return null
  return h
}

export type GrantInput = {
  bard: BardSheet & { id: string; name: string }
  target: { id: string; name: string; sheet_resources?: unknown; hp_current?: number | null }
  /** Feet between them, when the surface knows it (the painted map does). */
  distanceFt?: number | null
  /** The world clock in absolute minutes, or null when it could not be read. */
  now: number | null
}

export type GrantResult =
  | { ok: true; bardResources: Resources; targetResources: Resources; die: number; left: number; note: string }
  | { ok: false; reason: string }

/** Spend one use and hand one die over — or say exactly why not. */
export function grantInspiration(g: GrantInput): GrantResult {
  const s = bardState(g.bard)
  if (!s.isBard) return { ok: false, reason: `${g.bard.name} is not a bard.` }
  if (g.target.id === g.bard.id) return { ok: false, reason: "A bard cannot inspire themself." }
  if (s.left <= 0) return { ok: false, reason: `${g.bard.name} has no Bardic Inspiration left (${s.max} of ${s.max} spent); a long rest restores them.` }
  if (g.distanceFt != null && g.distanceFt > INSPIRATION_RANGE_FT) return { ok: false, reason: `Too far: ${Math.round(g.distanceFt)} ft, and it must be within ${INSPIRATION_RANGE_FT} ft.` }
  if (heldInspiration(g.target.sheet_resources, g.now)) return { ok: false, reason: `${g.target.name} already has an inspiration die.` }

  const bardRes = readResources(g.bard.sheet_resources)
  const bardResources: Resources = { ...bardRes, bardic_inspiration: { ...(bardRes.bardic_inspiration ?? {}), used: s.used + 1 } }
  const targetResources: Resources = {
    ...readResources(g.target.sheet_resources),
    inspiration_held: { die: s.die, from_id: g.bard.id, from_name: g.bard.name, granted_at: g.now },
  }
  return {
    ok: true, bardResources, targetResources, die: s.die, left: s.left - 1,
    note: `${g.bard.name} inspires ${g.target.name} (d${s.die}). ${s.left - 1} of ${s.max} left.`,
  }
}

export type SpendResult =
  | { ok: true; resources: Resources; die: number; face: number; note: string }
  | { ok: false; reason: string }

/**
 * Roll and remove the held die. `face` comes from the caller when the table's
 * roller threw it; otherwise `rng` rolls it here.
 */
export function spendInspiration(
  c: { name: string; sheet_resources?: unknown },
  now: number | null,
  roll: { face?: number | null; rng?: () => number } = {},
): SpendResult {
  const h = heldInspiration(c.sheet_resources, now)
  if (!h) return { ok: false, reason: `${c.name} has no inspiration die to spend.` }
  const given = roll.face
  const face = Number.isInteger(given) && (given as number) >= 1 && (given as number) <= h.die
    ? (given as number)
    : 1 + Math.floor((roll.rng ?? Math.random)() * h.die)
  const resources = readResources(c.sheet_resources)
  delete resources.inspiration_held
  return { ok: true, resources, die: h.die, face, note: `${c.name} spends ${h.from_name ?? "a bard"}'s inspiration: d${h.die} = ${face}.` }
}

/**
 * The long rest: every use back, and any die already over its hour dropped.
 * Returns null when nothing changes, so the rest writes nothing it need not.
 */
export function restoreOnLongRest(raw: unknown, now: number | null): Resources | null {
  const res = readResources(raw)
  let changed = false
  if ((res.bardic_inspiration?.used ?? 0) > 0) {
    res.bardic_inspiration = { ...res.bardic_inspiration, used: 0 }
    changed = true
  }
  if (res.inspiration_held && !heldInspiration(raw, now)) {
    delete res.inspiration_held
    changed = true
  }
  return changed ? res : null
}
