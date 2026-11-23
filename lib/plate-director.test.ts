import { describe, expect, it } from "vitest"
import {
  CREATURES, TABLES, TERRAIN, directorPlate, drawFor, fieldFoes, onTable, pursuitAfter, PURSUIT_START, randomEncounter,
  rollDice, rollTable, savingThrow, hazardDamage, fallDamage, RUIN_ROOMS, ruinDraw, ruinNotices, ruinPlate } from "./plate-director.mjs"

const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length] }
const faceOf = (die: number, face: number) => (face - 0.5) / die   // the rand() value that rolls `face` on a d`die`

describe("the book's tables cover every face", () => {
  const covers = (rows: { lo: number; hi: number }[], die: number) => {
    for (let n = 1; n <= die; n++) expect(onTable(rows, n), `face ${n}`).not.toBeNull()
  }
  it("terrain d20 and creature d20", () => { covers(TERRAIN, 20); covers(CREATURES, 20) })
  it("every sub-table", () => { for (const t of Object.values(TABLES)) covers(t.rows, t.die) })
  it("terrain rows match the book's order (p.30)", () => {
    expect(TERRAIN.map((r) => r.id)).toEqual(["boneyard", "cliff-ladder", "crystal-clusters", "fungus-cavern", "gas-leak", "gorge", "high-ledge", "horrid-sounds",
      "lava-swell", "muck-pit", "rockfall", "rope-bridge", "ruins", "shelter", "sinkhole", "slime-mold", "steam-vent", "underground-stream", "warning-sign", "webs"])
  })
})

describe("Random Encounters d20 (p.30)", () => {
  it("1–13 nothing, 14–15 terrain, 16–17 creature, 18–20 both", () => {
    expect(randomEncounter(13).kind).toBe("none")
    expect(randomEncounter(14).kind).toBe("terrain")
    expect(randomEncounter(17).kind).toBe("creature")
    expect(randomEncounter(18).kind).toBe("both")
  })
  it("draws a terrain and a creature on an 18+", () => {
    const r = drawFor(seq(faceOf(20, 19), faceOf(20, 11), faceOf(20, 2))) as unknown as { kind: string; terrain: { id: string }; creature: { id: string } }
    expect(r.kind).toBe("both")
    expect(r.terrain.id).toBe("rockfall")
    expect(r.creature.id).toBe("ambushers")
  })
  it("draws nothing on a 13", () => { expect(drawFor(seq(faceOf(20, 13)))).toBeNull() })
})

describe("the drow pursuit level (p.29)", () => {
  it("starts at 4 and stays between 0 and 5", () => {
    expect(pursuitAfter(null as unknown as number, 0)).toBe(PURSUIT_START)
    expect(pursuitAfter(4, 3)).toBe(5)
    expect(pursuitAfter(1, -3)).toBe(0)
  })
})

describe("dice and saves", () => {
  it("rolls NdM and the ×10 of a ravine's depth", () => {
    expect(rollDice("3d6", () => 0.999)).toBe(18)
    expect(rollDice("2d6*10", () => 0)).toBe(20)
    expect(rollDice("1", () => 0.5)).toBe(1)
  })
  it("a save meets the DC on the number", () => {
    expect(savingThrow(2, 12, seq(faceOf(20, 10))).ok).toBe(true)
    expect(savingThrow(1, 12, seq(faceOf(20, 10))).ok).toBe(false)
  })
  it("gas leak: half on a save; rockfall: nothing on a save", () => {
    const gas = TERRAIN.find((r) => r.id === "gas-leak")!.steps.find((s: { t: string }) => s.t === "save")
    const rock = TERRAIN.find((r) => r.id === "rockfall")!.steps.find((s: { t: string }) => s.t === "save")
    expect(hazardDamage(gas, true, () => 0.999)).toBe(5)
    expect(hazardDamage(rock, true, () => 0.999)).toBe(0)
    expect(rock.times).toBe(3)
  })
  it("falling is 1d6 per 10 ft, capped at 20d6 (SRD)", () => {
    expect(fallDamage(30, () => 0.999)).toBe(18)
    expect(fallDamage(500, () => 0.999)).toBe(120)
  })
})

describe("fights field only what the map has a stat block for", () => {
  it("splits the ambushers into fielded and missing", () => {
    const r = rollTable("ambushers", seq(faceOf(20, 7), faceOf(4, 3)))!
    expect(r.fight[0].id).toBe("grick")
    const f = fieldFoes(r.fight, seq(faceOf(4, 3)), (id: string) => id === "grick")
    expect(f.ids).toEqual(["grick", "grick", "grick"])
    expect(f.missing).toEqual([])
    expect(fieldFoes([{ id: "chuul", n: "1" }], () => 0, () => false).missing).toEqual(["chuul"])
  })
})

describe("where the director works", () => {
  it("only on the cavern plates", () => {
    expect(directorPlate("biome-tunnels")).toBe(true)
    expect(directorPlate("node-11-slave-pen")).toBe(false)
    expect(directorPlate("road-webs")).toBe(false)
  })
})

describe("the Ruins: one roll per room", () => {
  const ROOMS = RUIN_ROOMS as Record<string, { hook: string; rows: any[]; hidden?: { id: string; passive: number; found: string } }>
  const rooms = Object.keys(ROOMS)
  it("has six rooms, and every face of the d20 lands on exactly one row", () => {
    expect(rooms).toHaveLength(6)
    for (const slug of rooms) {
      expect(ruinPlate(slug)).toBe(true)
      for (let n = 1; n <= 20; n++) expect(ROOMS[slug].rows.filter((r: any) => n >= r.lo && n <= r.hi)).toHaveLength(1)
    }
    expect(ruinPlate("road-webs")).toBe(false)
    expect(directorPlate("ruins-ossuary")).toBe(false)   // the cavern director does not also roll here
  })
  it("keeps the book's Ruins row whole in the reliquary: half the time, 1d4 trinkets", () => {
    const book = TABLES.ruins.rows
    expect(ruinDraw("ruins-reliquary", seq(faceOf(20, 10)))!.say).toBe(book[0].say)
    const hit = ruinDraw("ruins-reliquary", seq(faceOf(20, 11)))!
    expect(hit.say).toBe(book[1].say)
    expect(hit.tell).toBe(book[1].tell)
  })
  it("brings the skeletons out of the ossuary, two to six of them", () => {
    expect(ruinDraw("ruins-ossuary", seq(faceOf(20, 5)))!.fight).toBeUndefined()
    const r = ruinDraw("ruins-ossuary", seq(faceOf(20, 6)))!
    expect(r.fight[0].id).toBe("skeleton-swordsman")
    expect(fieldFoes(r.fight, () => 0, () => true).ids).toHaveLength(2)
    expect(fieldFoes(r.fight, () => 0.999, () => true).ids).toHaveLength(6)
  })
  it("puts the horror in the sanctum: a madness save, and on a high roll the grell", () => {
    expect(ruinDraw("ruins-sanctum", seq(faceOf(20, 4)))!.steps).toBeUndefined()
    expect(ruinDraw("ruins-sanctum", seq(faceOf(20, 5)))!.steps![0]).toMatchObject({ t: "madness", ability: "wis", dc: 11 })
    expect(ruinDraw("ruins-sanctum", seq(faceOf(20, 15)))!.fight[0].id).toBe("grell")
  })
  it("hides three things, found only when the best passive Perception meets the score", () => {
    const hidden = rooms.map((s) => ROOMS[s].hidden).filter(Boolean)
    expect(hidden.map((h: any) => h.id).sort()).toEqual(["ruins-cache-crypt", "ruins-cache-reliquary", "ruins-cache-threshold"])
    const h = ROOMS["ruins-reliquary"].hidden!
    expect(ruinNotices(h, 14)).toBe(false)
    expect(ruinNotices(h, 15)).toBe(true)
    expect(ruinNotices(null, 30)).toBe(false)
    expect(ruinNotices(h, NaN)).toBe(false)
  })
  it("is not a room anywhere else", () => {
    expect(ruinDraw("biome-tunnels", () => 0)).toBeNull()
  })
})
