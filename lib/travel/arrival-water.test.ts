import { describe, expect, it } from "vitest"
import { resolveArrival, type EncounterRow, type EncounterTable, type NodeEvent } from "./arrival"
import { VESSELS, fleetSpeed, seats } from "./vessels"

const tables: EncounterTable[] = [
  { table_key: "darklake_random", die: 20, title: "Darklake Random Encounters", source: "ch.3" },
  { table_key: "darklake_creature", die: 12, title: "Darklake Creature Encounters", source: "ch.3" },
  { table_key: "underdark_random", die: 20, title: "Random Encounters", source: "ch.2" },
]
const rows: EncounterRow[] = [
  { table_key: "darklake_random", roll_min: 1, roll_max: 13, result: "No encounter", detail: { rolls: [] } },
  { table_key: "darklake_random", roll_min: 16, roll_max: 17, result: "One or more creatures", detail: { rolls: ["darklake_creature"] } },
  { table_key: "darklake_creature", roll_min: 4, roll_max: 4, result: "1 green hag", detail: {} },
  { table_key: "underdark_random", roll_min: 1, roll_max: 20, result: "Terrain", detail: { rolls: [] } },
]
const march = { miles_since_check: 0, day_miles: 7, checks_made: 0 }
const fixed = (...seq: number[]) => {
  let i = 0
  return () => seq[i++ % seq.length]
}

describe("Darklake crossings", () => {
  it("rolls one check per 4 hours afloat, carrying the remainder", () => {
    // 15 miles rowed at 1½ mph = 10 hours: two checks, 2 hours carried.
    const out = resolveArrival({ nodeName: "Marker 11", milesWalked: 15, march, events: [], tables, rows, roll: fixed(1), water: { hours: 10, carryHours: 0 } })
    expect(out.water).toMatchObject({ checks: 2, carryAfter: 2 })
    expect(out.rolls.map((r) => r.table_key)).toEqual(["darklake_random", "darklake_random"])
    expect(out.halt).toBe(false)
  })

  it("short crossings add up instead of rounding to nothing", () => {
    const out = resolveArrival({ nodeName: "x", milesWalked: 3, march, events: [], tables, rows, roll: fixed(1), water: { hours: 2, carryHours: 3 } })
    expect(out.water).toMatchObject({ checks: 1, carryAfter: 1 })
  })

  it("rowed miles never count toward the land march, and never roll the land tables", () => {
    const out = resolveArrival({ nodeName: "x", milesWalked: 30, march: { ...march, miles_since_check: 6 }, events: [], tables, rows, roll: fixed(1), water: { hours: 1, carryHours: 0 } })
    expect(out.march.miles_since_check).toBe(6)
    expect(out.rolls.some((r) => r.table_key === "underdark_random")).toBe(false)
  })

  it("stops the boat when a creature turns up", () => {
    const out = resolveArrival({ nodeName: "x", milesWalked: 6, march, events: [], tables, rows, roll: fixed(16, 4), water: { hours: 4, carryHours: 0 } })
    expect(out.halt).toBe(true)
    expect(out.title).toContain("1 green hag")
  })

  it("authored canon still wins, and the hours stay owed", () => {
    const ev: NodeEvent = { id: "e1", kind: "authored", title: "The lamp", body: null, payload: {}, fires_once: true, priority: 1 }
    const out = resolveArrival({ nodeName: "Shrine", milesWalked: 18, march, events: [ev], tables, rows, roll: fixed(20), water: { hours: 12, carryHours: 1 } })
    expect(out.title).toBe("The lamp")
    expect(out.water).toMatchObject({ checks: 0, carryAfter: 13 })
  })

  it("land legs are unchanged", () => {
    const out = resolveArrival({ nodeName: "x", milesWalked: 7, march, events: [], tables, rows, roll: fixed(5) })
    expect(out.water).toBeUndefined()
    expect(out.rolls[0]?.table_key).toBe("underdark_random")
  })
})

describe("vessels", () => {
  it("carry the book's numbers", () => {
    expect(VESSELS.keelboat).toMatchObject({ ac: 15, hp_max: 100, damage_threshold: 10, crew: 1, passengers: 6, speed_mph: 1.5 })
    expect(VESSELS.coracle).toMatchObject({ ac: 11, hp_max: 25, crew: 1, passengers: 3 })
    expect(VESSELS.barrel).toMatchObject({ ac: 11, hp_max: 20, passengers: 0, speed_mph: 1 })
  })
  it("count seats and pace only for boats still afloat", () => {
    const fleet = [
      { crew: 1, passengers: 3, speed_mph: 1.5, lost_at: null },
      { crew: 1, passengers: 0, speed_mph: 1, lost_at: null },
      { crew: 1, passengers: 6, speed_mph: 1.5, lost_at: "2026-10-10" },
    ]
    expect(seats(fleet)).toBe(5)
    expect(fleetSpeed(fleet)).toBe(1)
    expect(fleetSpeed([])).toBeNull()
  })
})
