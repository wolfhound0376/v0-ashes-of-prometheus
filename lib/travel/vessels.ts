// Boats on the Darklake.
//
// Every number here is published; nothing is improvised.
//
//   Out of the Abyss - D&D Encounters, ch.3 (The Darklake):
//   - "Since there is no wind in the Underdark, all water travel involves either
//     rowing at 1½ miles per hour, or floating with prevailing currents at
//     1 mile per hour."
//   - "Most craft navigating the waters of the Darklake are zurkhwood vessels
//     piloted by the kuo-toa or the duergar. These boats are equivalent to
//     keelboats" (DMG ch.5, Airborne and Waterborne Vehicles).
//   - "the cap of a giant zurkhwood mushroom can be hollowed out to make a
//     coracle equivalent to a rowboat, but with half a rowboat's hit points ...
//     one day's work per raft."
//   - A barrel: "a speed of 1 mph, requires a crew of 1, allows for no
//     passengers or cargo, and has AC 11, hp 20, and damage threshold 0."
//
//   DMG p.119, Airborne and Waterborne Vehicles:
//   - Keelboat: crew 1, passengers 6, AC 15, HP 100, damage threshold 10.
//   - Rowboat: crew 1, passengers 3, AC 11, HP 50.
//
// Speed: the DMG gives a keelboat 1 mph, but the Darklake has no wind and the
// book says all water travel there is rowing at 1½ mph. The book wins.

export type VesselKind = "keelboat" | "coracle" | "barrel"

export interface VesselStats {
  kind: VesselKind
  label: string
  ac: number
  hp_max: number
  damage_threshold: number
  crew: number
  passengers: number
  speed_mph: number
  source: string
}

export const VESSELS: Record<VesselKind, VesselStats> = {
  keelboat: {
    kind: "keelboat",
    label: "Zurkhwood keelboat",
    ac: 15,
    hp_max: 100,
    damage_threshold: 10,
    crew: 1,
    passengers: 6,
    speed_mph: 1.5,
    source:
      "Out of the Abyss ch.3 (zurkhwood vessels are keelboats; Darklake rowing 1½ mph); DMG p.119 keelboat (crew 1, passengers 6, AC 15, HP 100, DT 10)",
  },
  coracle: {
    kind: "coracle",
    label: "Zurkhwood coracle",
    ac: 11,
    hp_max: 25,
    damage_threshold: 0,
    crew: 1,
    passengers: 3,
    speed_mph: 1.5,
    source:
      "Out of the Abyss ch.3 (zurkhwood cap coracle = rowboat at half hit points, one day's work); DMG p.119 rowboat (crew 1, passengers 3, AC 11, HP 50)",
  },
  barrel: {
    kind: "barrel",
    label: "Barrel",
    ac: 11,
    hp_max: 20,
    damage_threshold: 0,
    crew: 1,
    passengers: 0,
    speed_mph: 1,
    source: "Out of the Abyss ch.3 (barrel: 1 mph, crew 1, no passengers, AC 11, hp 20, DT 0)",
  },
}

export function isVesselKind(k: unknown): k is VesselKind {
  return k === "keelboat" || k === "coracle" || k === "barrel"
}

export interface VesselRow {
  id: string
  kind: VesselKind
  name: string | null
  hp_current: number
  hp_max: number
  crew: number
  passengers: number
  speed_mph: number
  lost_at: string | null
}

/** Boats the party still has. */
export function afloat<T extends { lost_at: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.lost_at)
}

/** How many people the party's boats carry, crew included. */
export function seats(rows: { crew: number; passengers: number; lost_at: string | null }[]): number {
  return afloat(rows).reduce((n, r) => n + Number(r.crew) + Number(r.passengers), 0)
}

/** The fleet moves at the pace of its slowest boat. */
export function fleetSpeed(rows: { speed_mph: number; lost_at: string | null }[]): number | null {
  const a = afloat(rows)
  return a.length ? Math.min(...a.map((r) => Number(r.speed_mph))) : null
}
