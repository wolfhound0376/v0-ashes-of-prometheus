import { describe, expect, it } from "vitest"
import {
  OBSERVERS, TASKS, castableInManacles, crews, disobey, escortFor, npcCountFor, pickCompanions, pickTask,
  planDay, resolvePocket, searchFinds, seeded, shiftAt, stanceDuringLabor, suspicionReasons, taskWeight,
  type CrewMember, type Observer,
} from "./labor"

const pc = (id: string): CrewMember => ({ kind: "pc", id, name: id })
const npc = (id: string): CrewMember => ({ kind: "npc", id, name: id })
const HEROES = ["fifi", "kenta", "scott", "samson"].map(pc)
const PRISONERS = ["eldeth", "ront", "jimjar", "topsy", "turvy", "stool", "derendil", "sarith", "buppido", "shuushar"].map(npc)
const drow: Observer = { ...OBSERVERS.drow, name: "Drow Guard" }
const quaggoth: Observer = { ...OBSERVERS.quaggoth, name: "Quaggoth" }

describe("the tasks", () => {
  it("has every chore the book lists [BOOK p.12]", () => {
    const book = TASKS.filter((t) => t.source === "book").map((t) => t.key)
    for (const k of ["water", "lift", "clean", "pots", "kitchen", "dishes", "laundry", "rocks", "rope", "supplies"]) expect(book).toContain(k)
  })

  it("marks only the pointless work as cruelty", () => {
    expect(TASKS.filter((t) => t.source === "book" && t.cruelty).map((t) => t.key).sort()).toEqual(["rocks", "rope", "supplies"])
  })

  it("never draws a task whose plate does not exist yet", () => {
    const lt = TASKS.find((t) => t.key === "lift-trouble")!
    expect(taskWeight(lt, {})).toBe(0)
    expect(taskWeight(lt, { platesReady: ["lift-cliffside"] })).toBeGreaterThan(0)
    for (let s = 0; s < 300; s++) expect(pickTask(seeded(s)).key).not.toBe("lift-trouble")
  })

  it("leaves the Expanded supplement out when asked for book only", () => {
    for (let s = 0; s < 300; s++) expect(pickTask(seeded(s), { bookOnly: true }).source).toBe("book")
  })

  it("prefers rooms the crew has not seen", () => {
    const water = TASKS.find((t) => t.key === "water")!
    expect(taskWeight(water, { areasSeen: [] })).toBeGreaterThan(taskWeight(water, { areasSeen: [9] }))
  })

  it("weighs cruelty more as the drow get bored, capped", () => {
    const rocks = TASKS.find((t) => t.key === "rocks")!
    expect(taskWeight(rocks, { day: 5, areasSeen: [10] })).toBeGreaterThan(taskWeight(rocks, { day: 1, areasSeen: [10] }))
    expect(taskWeight(rocks, { day: 99, areasSeen: [10] })).toBe(taskWeight(rocks, { day: 7, areasSeen: [10] }))
  })
})

describe("shifts", () => {
  it("splits the day into thirds at 06:00, 14:00, 22:00", () => {
    expect(shiftAt(6 * 60)).toBe(1)
    expect(shiftAt(13 * 60 + 59)).toBe(1)
    expect(shiftAt(14 * 60)).toBe(2)
    expect(shiftAt(21 * 60 + 59)).toBe(2)
    expect(shiftAt(22 * 60)).toBe(3)
    expect(shiftAt(3 * 60)).toBe(3)
    expect(shiftAt(1440 + 6 * 60)).toBe(1)
    expect(shiftAt(-60)).toBe(3)
  })
})

describe("who goes [SAM: all heroes + 0–2 NPCs]", () => {
  it("sizes the companions by party size", () => {
    for (let s = 0; s < 200; s++) {
      expect([0, 1]).toContain(npcCountFor(4, seeded(s)))
      expect([0, 1]).toContain(npcCountFor(5, seeded(s)))
      expect([1, 2]).toContain(npcCountFor(2, seeded(s)))
      expect([1, 2]).toContain(npcCountFor(3, seeded(s)))
      expect(npcCountFor(1, seeded(s))).toBe(2)
    }
    expect(npcCountFor(0, seeded(1))).toBe(0)
  })

  it("puts every hero on the same detail, every day", () => {
    for (let s = 0; s < 100; s++) {
      const plan = planDay({ day: 1 + (s % 7), pcs: HEROES, npcs: PRISONERS }, seeded(s))
      const party = plan.filter((d) => d.party)
      expect(party).toHaveLength(1)
      for (const h of HEROES) expect(party[0].crew.map((c) => c.id)).toContain(h.id)
      expect(plan.filter((d) => !d.party).every((d) => d.crew.every((c) => c.kind === "npc"))).toBe(true)
      expect(party[0].crew.filter((c) => c.kind === "npc").length).toBeLessThanOrEqual(1)
    }
  })

  it("never puts two NPCs the guards know are friends on one detail [BOOK]", () => {
    const seenFriends = [["topsy", "turvy"], ["eldeth", "jimjar"]] as const
    for (let s = 0; s < 200; s++) {
      const plan = planDay({ day: 2, pcs: [pc("fifi")], npcs: PRISONERS, seenFriends }, seeded(s))
      for (const d of plan) {
        const ids = d.crew.map((c) => c.id)
        expect(ids.includes("topsy") && ids.includes("turvy")).toBe(false)
        expect(ids.includes("eldeth") && ids.includes("jimjar")).toBe(false)
      }
    }
  })

  it("brings along the NPCs the party has seen least", () => {
    const times = Object.fromEntries(PRISONERS.map((n) => [n.id, 5])) as Record<string, number>
    times.stool = 0
    expect(pickCompanions(PRISONERS, 1, seeded(3), { timesWithParty: times })[0].id).toBe("stool")
  })

  it("works every living prisoner exactly once a day", () => {
    for (let s = 0; s < 100; s++) {
      const plan = planDay({ day: 1, pcs: HEROES, npcs: PRISONERS }, seeded(s))
      const ids = plan.flatMap((d) => d.crew.map((c) => c.id))
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids.sort()).toEqual([...HEROES, ...PRISONERS].map((m) => m.id).sort())
    }
  })

  it("keeps NPC-only crews to two or three, and one task per crew in a shift [BOOK]", () => {
    for (let s = 0; s < 100; s++) {
      const plan = planDay({ day: 1, pcs: HEROES, npcs: PRISONERS }, seeded(s))
      for (const shift of [1, 2, 3]) {
        const npcOnly = plan.filter((d) => !d.party && d.shift === shift)
        for (const d of npcOnly) expect(d.crew.length).toBeLessThanOrEqual(3)
        expect(new Set(npcOnly.map((d) => d.task)).size).toBe(npcOnly.length)
      }
    }
  })

  it("deals a lone prisoner into a crew of one rather than dropping them", () => {
    expect(crews([npc("a")], [])).toEqual([[npc("a")]])
    expect(crews([], [])).toEqual([])
  })

  it("is the same day twice from the same seed", () => {
    expect(planDay({ day: 3, pcs: HEROES, npcs: PRISONERS }, seeded(42))).toEqual(planDay({ day: 3, pcs: HEROES, npcs: PRISONERS }, seeded(42)))
  })
})

describe("the escort", () => {
  it("is one drow and one quaggoth with their bestiary Perception", () => {
    const e = escortFor()
    expect(e.map((o) => o.bestiary).sort()).toEqual(["drow", "quaggoth"])
    expect(e.find((o) => o.bestiary === "drow")!.passivePerception).toBe(12)
    expect(e.find((o) => o.bestiary === "quaggoth")!.passivePerception).toBe(11)
  })

  it("never uses Jorlan — his row has no Wisdom to roll against", () => {
    expect(escortFor().some((o) => /jorlan/i.test(o.name))).toBe(false)
  })
})

describe("pocketing something [BOOK p.19]", () => {
  it("beats a passive score by meeting it", () => {
    const r = resolvePocket(12, [{ observer: drow, watching: false }, { observer: quaggoth, watching: false }])
    expect(r.kept).toBe(true)
    expect(r.margin).toBe(0)
  })

  it("is caught under a passive score", () => {
    const r = resolvePocket(11, [{ observer: drow, watching: false }])
    expect(r).toMatchObject({ kept: false, caughtBy: "Drow Guard" })
  })

  it("loses a tie against an active watcher", () => {
    const r = resolvePocket(14, [{ observer: drow, watching: true, d20: 12 }])   // 12 + 2 = 14
    expect(r).toMatchObject({ kept: false, caughtBy: "Drow Guard" })
  })

  it("has to beat every watcher", () => {
    const r = resolvePocket(15, [{ observer: drow, watching: false }, { observer: quaggoth, watching: true, d20: 15 }])
    expect(r).toMatchObject({ kept: false, caughtBy: "Quaggoth" })
  })

  it("is a close call (suspicious) when the margin is 2 or less", () => {
    expect(resolvePocket(14, [{ observer: drow, watching: false }]).suspicious).toBe(true)
    expect(resolvePocket(15, [{ observer: drow, watching: false }]).suspicious).toBe(false)
  })
})

describe("suspicion and the search [SAM: never routine]", () => {
  it("searches nobody without a reason", () => {
    expect(suspicionReasons({})).toEqual([])
    expect(suspicionReasons({ pockets: [resolvePocket(20, [{ observer: drow, watching: false }])], biggestHidden: "dagger" })).toEqual([])
  })

  it("names each reason it has", () => {
    const close = resolvePocket(13, [{ observer: drow, watching: false }])
    expect(suspicionReasons({ pockets: [close], turnsOutOfSight: 1, biggestHidden: "large", informed: true }))
      .toEqual(["close-call", "out-of-sight", "too-big", "informed"])
  })

  it("finds it when the drow meets or beats the hide", () => {
    expect(searchFinds(15, 15)).toBe(true)
    expect(searchFinds(14, 15)).toBe(false)
  })
})

describe("disobedience [SAM]", () => {
  const withNpc = [pc("fifi"), npc("Eldeth")]
  it("always warns first, whatever the roll", () => {
    expect(disobey(0, 20, withNpc, false, seeded(1))).toEqual({ kind: "warning" })
    expect(disobey(0, 1, withNpc, false, seeded(1))).toEqual({ kind: "warning" })
  })

  it("lets a crewmate defuse it on 11+", () => {
    expect(disobey(1, 11, withNpc, false, seeded(1))).toEqual({ kind: "defused", by: "Eldeth" })
  })

  it("volleys on 10 or less", () => {
    expect(disobey(1, 10, withNpc, false, seeded(1))).toEqual({ kind: "volleys", surgeon: true })
  })

  it("volleys with no NPC on the detail, whatever the roll", () => {
    expect(disobey(1, 20, [pc("fifi")], false, seeded(1))).toEqual({ kind: "volleys", surgeon: true })
  })

  it("sends the surgeon only once a run", () => {
    expect(disobey(2, 3, withNpc, true, seeded(1))).toEqual({ kind: "volleys", surgeon: false })
  })
})

describe("casting in manacles [SAM + SRD 5.1 components]", () => {
  it("allows verbal-only spells", () => {
    expect(castableInManacles(["V"])).toBe(true)
  })
  it("refuses anything with a somatic or material component", () => {
    expect(castableInManacles(["V", "S"])).toBe(false)
    expect(castableInManacles(["V", "M"])).toBe(false)
    expect(castableInManacles(["S"])).toBe(false)
    expect(castableInManacles(["V", "S", "M (a bit of fleece)"])).toBe(false)
  })
})

describe("the party's stance on a detail", () => {
  it("stays captive while they work", () => expect(stanceDuringLabor(false)).toBe("captive"))
  it("turns to escaping only when a PC breaks from the escort", () => expect(stanceDuringLabor(true)).toBe("escaping"))
})
