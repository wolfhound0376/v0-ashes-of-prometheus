import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { fill, openerRoute, parseOpenerBank, pickOpener, type OpenerEntry } from "./opener-bank"

const bank: OpenerEntry[] = [
  { narration: "She comes over.", line: "You. {race}.", next: "Will you fight?" },
  { narration: "She leans on the bars.", line: "Quiet in the pen.", next: "Seen the stash?", when: { areas: ["slave pen"] } },
  { narration: "She squints.", line: "A dwarf, at last.", next: "Gauntlgrym?", when: { areas: ["slave pen"], races: ["dwarf"] } },
]

describe("openerRoute: the model only when the moment needs it", () => {
  it("a first approach to a stranger comes from the bank", () => {
    expect(openerRoute({}).source).toBe("bank")
    expect(openerRoute({ situation: "  ", knowsName: false, standing: null, memoriesAbout: 0 }).source).toBe("bank")
  })
  it("anything that has to come from what happened pays for the model", () => {
    expect(openerRoute({ situation: "caught sneaking" })).toEqual({ source: "model", why: "reacting to what just happened" })
    expect(openerRoute({ knowsName: true }).source).toBe("model")
    expect(openerRoute({ standing: "trusts them a little" }).source).toBe("model")
    expect(openerRoute({ memoriesAbout: 2 }).source).toBe("model")
  })
})

describe("pickOpener", () => {
  it("the most specific entry that fits wins", () => {
    expect(pickOpener(bank, { area: "Slave Pen", race: "dwarf" })?.line).toBe("A dwarf, at last.")
    expect(pickOpener(bank, { area: "Slave Pen", race: "human" })?.line).toBe("Quiet in the pen.")
  })
  it("off the plates it was written for, only the general entries fit; {race} is filled in or 'stranger'", () => {
    expect(pickOpener(bank, { area: "Main Hall", race: "half-elf" })?.line).toBe("You. half-elf.")
    expect(pickOpener(bank, { area: "Main Hall" })?.line).toBe("You. stranger.")
  })
  it("nothing fits: null, and the model writes it", () => {
    expect(pickOpener([bank[1]], { area: "Main Hall" })).toBeNull()
    expect(pickOpener([], { area: "Slave Pen" })).toBeNull()
  })
  it("skips what was just said unless that leaves nothing", () => {
    const two: OpenerEntry[] = [{ narration: "a.", line: "One.", next: "Q1?" }, { narration: "b.", line: "Two.", next: "Q2?" }]
    for (const r of [0, 0.5, 0.99]) expect(pickOpener(two, { exclude: ["One."] }, () => r)?.line).toBe("Two.")
    expect(pickOpener([two[0]], { exclude: ["One."] })?.line).toBe("One.")
  })
})

describe("parseOpenerBank", () => {
  it("drops the malformed and never guesses", () => {
    const out = parseOpenerBank([
      { narration: "ok.", line: "Hello there.", next: "Yes?" },
      { narration: "no next.", line: "Hello." },
      { narration: "same.", line: "Same line.", next: "same line." },
      "junk",
      { narration: "She waits.", line: "Hi.", next: "Ho?", when: { areas: ["Slave Pen"], fight: true } },
    ])
    expect(out.map((e) => e.line)).toEqual(["Hello there.", "Hi."])
    expect(out[1].when).toEqual({ areas: ["slave pen"] })
  })
  it("fill", () => expect(fill("{race} and {race}", "")).toBe("stranger and stranger"))
})

describe("the seeded opener banks", () => {
  const sql = readFileSync("migrations/20261124050000_opener_banks.sql", "utf8")
  const seeds = new Map<string, OpenerEntry[]>()
  for (const line of sql.split("\n")) {
    if (!line.startsWith("update public.npc_agents set opener_bank")) continue
    const parts = line.split("$bank$")
    const key = /where key = '([a-z]+)'/.exec(line)?.[1] ?? ""
    seeds.set(key, JSON.parse(parts[1]))
  }
  const heroes = ["kenta", "samson", "scott", "fifi", "lynkes", "gandalf", "kingasaur", "freia"]
  it("every main NPC but Malachar has at least three, and every one survives the parser", () => {
    for (const k of ["eldeth", "ront", "derendil", "jimjar", "sarith", "buppido", "jorlan"]) {
      const b = seeds.get(k) ?? []
      expect(b.length, k).toBeGreaterThanOrEqual(3)
      expect(parseOpenerBank(b).length, k).toBe(b.length)
    }
  })
  it("they are for strangers: no hero's name in any of them, and line and next stay short", () => {
    for (const [k, b] of seeds) for (const e of b) {
      const text = `${e.narration} ${e.line} ${e.next}`.toLowerCase()
      for (const h of heroes) expect(text.includes(h), `${k}: ${h}`).toBe(false)
      expect(e.line.split(/\s+/).length, k).toBeLessThanOrEqual(25)
      expect(e.next.split(/\s+/).length, k).toBeLessThanOrEqual(30)
    }
  })
})
