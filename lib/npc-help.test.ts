import { describe, expect, it } from "vitest"
import { NO_STANDING } from "@/lib/npc-asks"
import { helpChance, helpLine, helperFor, offersHelp } from "@/lib/npc-help"

const st = (o: Partial<typeof NO_STANDING>) => ({ ...NO_STANDING, ...o })

describe("NPC help on checks", () => {
  it("only Jimjar is a helper, by first name", () => {
    expect(helperFor("Jimjar")).not.toBeNull()
    expect(helperFor("jimjar the gambler")).not.toBeNull()
    expect(helperFor("Eldeth Feldrun")).toBeNull()
  })
  it("the better he likes you, the likelier he is, and never once soured", () => {
    expect(helpChance(st({ resentment: 12 }))).toBe(0)
    expect(helpChance(NO_STANDING)).toBe(0.25)
    expect(helpChance(st({ trust: 6 }))).toBe(0.6)
    expect(helpChance(st({ trust: 8, affection: 8 }))).toBe(0.85)
  })
  it("it is a MAY: the same standing can go either way on the roll", () => {
    const j = helperFor("Jimjar")
    expect(offersHelp(j, "lock", NO_STANDING, 0.1)).toBe(true)
    expect(offersHelp(j, "lock", NO_STANDING, 0.9)).toBe(false)
    expect(offersHelp(j, "lock", st({ resentment: 20 }), 0)).toBe(false)
    expect(offersHelp(null, "lock", NO_STANDING, 0)).toBe(false)
  })
  it("his line names you the way he would", () => {
    expect(helpLine("lock", "shorty", 0)).toContain("shorty")
    expect(helpLine("trap-disarm", "Fifi", 0.99)).toContain("Fifi")
    expect(helpLine("trap-find", "Bard", 0)).not.toContain("{you}")
  })
})
