import { describe, expect, it } from "vitest"
import { parseTalkPurpose, parseTalkSkill, settleTalkCheck, talkDc, talkPurpose } from "@/lib/talk-check"

describe("a talk line that names a skill (Sam's playtest 2026-11-15, point 2)", () => {
  it("reads the skill off the end of the line, as the Parley sends it", () => {
    expect(parseTalkSkill("Tell him the drow need us whole. (Persuasion)")).toEqual({ text: "Tell him the drow need us whole.", skill: "persuasion" })
    expect(parseTalkSkill("Ask what he needs done (Insight)")?.skill).toBe("insight")
    expect(parseTalkSkill("Slip it into his pocket (Sleight of Hand)")?.skill).toBe("sleight_of_hand")
  })
  it("leaves an ordinary line alone", () => {
    expect(parseTalkSkill("How long have you been here?")).toBeNull()
    expect(parseTalkSkill("He nods (slowly)")).toBeNull()          // a parenthesis that is not a skill
    expect(parseTalkSkill("(Persuasion)")).toBeNull()               // a skill with nothing said
  })
})

describe("the game sets the DC from the NPC's attitude, never Malachar", () => {
  it("climbs the SRD typical-DC ladder from devoted to hostile", () => {
    expect([talkDc("devoted"), talkDc("warm"), talkDc("neutral"), talkDc("wary"), talkDc("hostile")]).toEqual([5, 10, 15, 20, 25])
  })
  it("treats an NPC with no attitude yet as neutral", () => {
    expect(talkDc(null)).toBe(15)
    expect(talkDc("")).toBe(15)
    expect(talkDc("baffled")).toBe(15)
  })
})

describe("the result is read back from the request's purpose", () => {
  it("round-trips skill and NPC, and knows a settled one", () => {
    const p = talkPurpose("persuasion", "Ront")
    expect(parseTalkPurpose(p)).toEqual({ skill: "persuasion", npc: "Ront", settled: false })
    expect(parseTalkPurpose(`${p}:done`)).toEqual({ skill: "persuasion", npc: "Ront", settled: true })
    expect(parseTalkPurpose("camp:forage")).toBeNull()
  })
  it("passes on the DC or better, and always on a natural 20", () => {
    expect(settleTalkCheck(15, 12, 15)).toBe(true)
    expect(settleTalkCheck(14, 11, 15)).toBe(false)
    expect(settleTalkCheck(22, 20, 25)).toBe(true)
  })
})
