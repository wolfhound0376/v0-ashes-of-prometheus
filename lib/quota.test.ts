import { describe, expect, it } from "vitest"
import * as Q0 from "./quota.mjs"
const Q = Q0 as any   // plain .mjs shared with the walk page

const seeded = (s: number) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
const crew = [
  { id: "fifi", name: "Fifi of Waterdeep", cls: "Rogue", mods: { work: 1, soh: 7, perf: 1, pers: 1, con: 0 }, hp: 8, hpMax: 8 },
  { id: "kenta", name: "Kenta of Neverwinter", cls: "Sorcerer", mods: { work: 1, soh: 0, perf: 3, pers: 5, con: 2 }, hp: 8, hpMax: 8 },
  { id: "samson", name: "Samson Stillwater", cls: "Cleric", mods: { work: 0, soh: 2, perf: 0, pers: 0, con: 1 }, hp: 9, hpMax: 9 },
  { id: "scott", name: "Scott Reedwind of Luskan", cls: "Bard", mods: { work: 1, soh: 2, perf: 5, pers: 5, con: 2 }, hp: 10, hpMax: 10 },
]

describe("the quota", () => {
  it("d100 holds Sam's 28 items over 100 numbers", () => {
    expect(Q.D100).toHaveLength(100)
    expect(Q.D100.filter(Boolean)).toHaveLength(28)
    for (const k of Q.D100.filter(Boolean)) expect(Q.LOOT[k]).toBeTruthy()
  })
  it("risk by class", () => {
    expect(Q.riskFor("Rogue")).toBe("scheme")
    expect(Q.riskFor("Bard")).toBe("distract")
    expect(Q.riskFor("Cleric")).toBe("help")
    expect(Q.riskFor("Sorcerer")).toBe("charm")
  })
  it("quota scales with the crew (7 for four)", () => {
    expect(Q.quotaFor(4)).toBe(7)
    expect(Q.quotaFor(3)).toBe(5)
  })
  it("a whole shift of bots plays to the end, suspicion within 0..4", () => {
    for (let s = 1; s < 300; s++) {
      const rng = seeded(s)
      const st = Q.newShift({ task: "water", heroes: crew, bots: crew.map((c) => c.id) }, rng)
      expect(st.done).toBe(true)
      expect(st.round).toBe(4)
      expect(st.susp).toBeGreaterThanOrEqual(0)
      expect(st.susp).toBeLessThanOrEqual(Q.SUSP_MAX)
      expect(st.end).toBeTruthy()
      for (const id of st.order) expect(st.heroes[id].hp).toBeGreaterThanOrEqual(0)
    }
  })
  it("a seated hero's turn waits for them, then the next", () => {
    const rng = seeded(7)
    const st = Q.newShift({ task: "kitchen", heroes: crew, bots: [] }, rng, 1000)
    const first = Q.current(st)
    expect(first).toBeTruthy()
    expect(Q.choose(st, "nobody", "work", rng, 2000)).toBe("not your turn")
    expect(Q.choose(st, first, "work", rng, 2000)).toBeNull()
    expect(Q.current(st)).not.toBe(first)
  })
  it("an idle seated player keeps working after the timeout", () => {
    const rng = seeded(9)
    const st = Q.newShift({ task: "kitchen", heroes: crew, bots: [] }, rng, 0)
    const who = Q.current(st)
    expect(Q.nudge(st, rng, 1000)).toBe(false)
    expect(Q.nudge(st, rng, Q.TURN_MS + 1)).toBe(true)
    expect(Q.current(st)).not.toBe(who)
  })
  it("a taken number counts as nothing", () => {
    const rng = seeded(3)
    const taken: Record<number, boolean> = {}
    const list: (string | null)[] = Q.D100
    list.forEach((k, i) => { if (k) taken[i + 1] = true })
    const st = Q.newShift({ task: "water", heroes: [crew[0]], bots: ["fifi"], carry: { taken } }, rng)
    expect(st.stolen).toHaveLength(0)
  })
  it("every result has a line", () => {
    const rng = seeded(11)
    const st = Q.newShift({ task: "rocks", heroes: crew, bots: crew.map((c) => c.id) }, rng)
    for (const r of st.results) expect(Q.resultLine(st, r).length).toBeGreaterThan(5)
    expect(Q.endLines(st)).toBeInstanceOf(Array)
  })
})
