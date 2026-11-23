import { describe, expect, it } from "vitest"
import { CLIMB_DC, ROAD_TRAP_RULES, climbTry, d, noticedBy, pitDamage, rollRoadTraps, seededRand, trapForD6, trapSeedKey, trapSig } from "./road-traps"

// a roller that plays back fixed faces, clamped to the die
const seq = (faces: number[]) => { let i = 0; return (s: number) => Math.min(s, Math.max(1, faces[i++ % faces.length])) }

describe("road traps follow SRD 5.1", () => {
  it("uses the book's DCs and dice", () => {
    expect(ROAD_TRAP_RULES["simple-pit"].spotDC).toBe(10)
    expect(ROAD_TRAP_RULES["hidden-pit"].spotDC).toBe(15)
    expect(ROAD_TRAP_RULES["spiked-pit"]).toMatchObject({ spotDC: 15, fall: "1d6", spikes: "2d10" })
    expect(ROAD_TRAP_RULES.net).toMatchObject({ spotDC: 10, netSaveDC: 10, netFreeDC: 10, fall: null })
  })
  it("maps the d6", () => {
    expect([1, 2, 3, 4, 5, 6].map(trapForD6)).toEqual(["simple-pit", "simple-pit", "hidden-pit", "hidden-pit", "net", "spiked-pit"])
  })
  it("notices with the best passive Perception at or over the DC, after the pace", () => {
    const party = [{ slug: "kenta", name: "Kenta", pp: 13 }, { slug: "ront", name: "Ront", pp: 15 }, { slug: "stool", name: "Stool", pp: null }]
    expect(noticedBy(15, party)?.slug).toBe("ront")
    expect(noticedBy(15, party, -5)).toBeNull()          // fast pace: 15 - 5 = 10 < 15
    expect(noticedBy(10, party, -5)?.passive).toBe(10)   // exactly the DC is enough
  })
  it("rolls 0 to 3 traps, ordered along the way, with their dice", () => {
    expect(rollRoadTraps([], 0, seq([1]))).toEqual([])
    const ts = rollRoadTraps([], 0, seq([4, 6, 50, 3, 4, 7, 6, 2, 9, 9, 9]))
    expect(ts.length).toBe(3)
    for (let i = 1; i < ts.length; i++) expect(ts[i].at).toBeGreaterThan(ts[i - 1].at)
    for (const t of ts) { expect(t.at).toBeGreaterThanOrEqual(0.15); expect(t.at).toBeLessThanOrEqual(0.9) }
    const spiked = ts[0]
    expect(spiked.kind).toBe("spiked-pit")
    expect(pitDamage(spiked).map((x) => x.type)).toEqual(["bludgeoning", "piercing"])
  })
})

describe("climbing out of a pit", () => {
  it("is DC 15 Strength (Athletics), the campaign book's pit", () => expect(CLIMB_DC).toBe(15))
  it("takes the higher die with advantage (Help from the rim)", () => {
    expect(climbTry([6, 14], 0, 2, false)).toMatchObject({ faces: [6], total: 8, ok: false })
    expect(climbTry([6, 14], 0, 2, true)).toMatchObject({ faces: [6, 14], die: 14, total: 16, ok: true })
  })
  it("rolls climb dice for every pit", () => {
    const [t] = rollRoadTraps([], 0, seq([2, 3, 50]))
    expect(t.kind).toBe("hidden-pit")
    expect(t.d20s.length).toBe(24)
  })
})

describe("one roll for the whole table", () => {
  it("the same leg and quarter hour gives the same traps and the same damage fingerprint", () => {
    const k1 = trapSeedKey("rm-1", "rm-2", 1_000_000), k2 = trapSeedKey("rm-2", "rm-1", 1_000_000 + 60_000)
    expect(k1).toBe(k2)
    const party = [{ slug: "kenta", name: "Kenta", pp: 12 }]
    const r1 = seededRand(k1), r2 = seededRand(k2)
    expect(rollRoadTraps(party, 0, (n) => d(n, r1))).toEqual(rollRoadTraps(party, 0, (n) => d(n, r2)))
    expect(trapSig(k1, "kenta", "Spiked pit")).toBe(trapSig(k2, "kenta", "Spiked pit"))
    expect(trapSig(k1, "kenta", "Spiked pit")).toMatch(/^ev-[a-z0-9]{4,40}$/)
    expect(trapSig(k1, "freia", "Spiked pit")).not.toBe(trapSig(k1, "kenta", "Spiked pit"))
  })
})
