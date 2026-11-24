import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { bankMayAnswer, bankSet, fits, parseBank, type BankEntry } from "./option-bank"
import { buildMoment, type CardLite } from "./moment"

const cards: CardLite[] = [
  { key: "malachar", name: "Malachar" },
  { key: "eldeth", name: "Eldeth Feldrun", aliases: ["Eldeth"], sprite_slug: "eldeth" },
  { key: "buppido", name: "Buppido", sprite_slug: "buppido" },
]
const KENTA = "51e4202d-b4d5-4658-a9c1-6102713e77f1"
const pen = [{ plate: "11", state: { company: ["eldeth", "buppido"], companyAt: { eldeth: "11", buppido: "11" } }, heroes: { kenta: { cid: KENTA, plate: "11" } } }]
const hero = { items: ["Rusted iron bar"], conditions: [] as string[] }

// The seed, read from the migration itself, so the tests exercise what ships.
const seedSql = readFileSync("migrations/20261124040000_option_banks.sql", "utf8")
const seeded = (key: string): BankEntry[] => {
  const line = seedSql.split("\n").find((l) => l.includes(`where key = '${key}'`)) ?? ""
  const parts = line.split("$bank$")
  return parseBank(parts.length >= 3 ? JSON.parse(parts[1]) : [])
}

describe("option banks: files first", () => {
  it("every seeded bank is valid: short options, real tags", () => {
    for (const k of ["malachar", "eldeth", "ront", "derendil", "jimjar", "buppido", "jorlan"]) {
      const b = seeded(k)
      expect(b.length, k).toBeGreaterThanOrEqual(5)
      expect(b.filter((e) => e.observe).length, k).toBeGreaterThanOrEqual(1)
      for (const e of b) { expect(e.text.length).toBeLessThanOrEqual(60); expect(e.bait && e.observe).toBeFalsy() }
    }
  })

  it("answers the pen in open play from Malachar's bank: one observe last, at most one bait", () => {
    const m = buildMoment({ rows: pen, characterId: KENTA, cards })
    const set = bankSet(seeded("malachar"), m, hero, m.presentKeys, "beat-1")!
    expect(set).not.toBeNull()
    expect(set.at(-1)!.kind).toBe("observe")
    expect(set.filter((s) => s.intent === "bait").length).toBeLessThanOrEqual(1)
    expect(set.length).toBeLessThanOrEqual(4)
  })

  it("the same beat draws the same options (a reload must not reshuffle)", () => {
    const m = buildMoment({ rows: pen, characterId: KENTA, cards })
    expect(bankSet(seeded("malachar"), m, hero, m.presentKeys, "beat-7")).toEqual(bankSet(seeded("malachar"), m, hero, m.presentKeys, "beat-7"))
  })

  it("talking to Buppido draws Buppido's bank, never Malachar's pen chores", () => {
    const m = buildMoment({ rows: pen, characterId: KENTA, cards, talkingTo: "Buppido" })
    expect(m.authorKey).toBe("buppido")
    const set = bankSet(seeded("buppido"), m, hero, m.presentKeys, "beat-2")!
    expect(set.map((s) => s.text)).not.toContain("Test the gate's bars for a loose bolt")
    expect(set.every((s) => seeded("buppido").some((e) => e.text === s.text))).toBe(true)
  })

  it("an option that needs someone absent, an item not carried, or a free hand when manacled does not fit", () => {
    const m = buildMoment({ rows: [{ ...pen[0], state: { company: ["buppido"], companyAt: { buppido: "11" } } }], characterId: KENTA, cards })
    expect(fits({ text: "Ask Eldeth", when: { with: ["eldeth"] } }, m, hero, m.presentKeys)).toBe(false)
    expect(fits({ text: "Throw the rope", needs: "rope" }, m, hero, m.presentKeys)).toBe(false)
    expect(fits({ text: "Climb the bars", notIf: ["manacled"] }, m, { items: [], conditions: ["Manacled"] }, m.presentKeys)).toBe(false)
  })

  it("a bank too thin for the moment returns null, so the model answers", () => {
    const m = buildMoment({ rows: pen, characterId: KENTA, cards })
    expect(bankSet([{ text: "Only one thing", when: { plates: ["11"] } }], m, hero, m.presentKeys, "b")).toBeNull()
  })

  it("the model answers when a player has just spoken; the bank answers routine beats", () => {
    const npcs = ["Eldeth Feldrun", "Eldeth", "Buppido"]
    expect(bankMayAnswer("Narration: The watch changes.\nEldeth Feldrun: A word.", npcs)).toBe(true)
    expect(bankMayAnswer("Kenta of Neverwinter: Where is the key?\nEldeth Feldrun: Jorlan has it.", npcs)).toBe(false)
    expect(bankMayAnswer("Kenta of Neverwinter: I sleep.\nNarration: Night passes.\nNarration: You wake.\nBuppido: Hello, friend!", npcs)).toBe(true)
  })

  it("parseBank drops what it cannot trust", () => {
    const b = parseBank([{ text: "ok option", bait: true, observe: true }, { text: "" }, "junk", { text: "x".repeat(90) }])
    expect(b[0]).toMatchObject({ text: "ok option", observe: true })
    expect(b[0].bait).toBeUndefined() // an observation is never bait
    expect(b[1].text.length).toBe(60)
    expect(b.length).toBe(2)
  })
})
