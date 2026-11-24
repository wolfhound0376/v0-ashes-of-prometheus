import { describe, expect, it } from "vitest"
import { LORE_GUARD, LORE_SECTIONS, MALACHAR_LORE_CORE, MAX_SECTIONS, loreFor, sectionsFor } from "./malachar-lore"

const keys = (t: string) => sectionsFor(t).map((s) => s.key)

describe("Malachar's lore of his own kind", () => {
  it("brings the right memory to the right question", () => {
    expect(keys("Where is your phylactery, lich?")).toContain("vessel")
    expect(keys("How do we kill you?")).toContain("vessel")
    expect(keys("Were you ever human?")).toContain("becoming")
    expect(keys("What happened to your face?")).toContain("flesh")
    expect(keys("Have you met Szass Tam?")).toContain("kin")
    expect(keys("Are vampires your kin?")).toContain("kin")
    expect(keys("Where is your lair?")).toContain("lair")
    expect(keys("Can you be redeemed?")).toContain("redemption")
  })

  it("stays out of ordinary play, where the same words mean something else", () => {
    for (const line of [
      "I search the skeleton on the road",
      "We plan our escape from the pen",
      "I check the chest for traps",
      "Kill him before he raises the alarm",
      "I pray to Tymora for my soul",
      "Give me some bread",
      "I cast detect magic as a ritual",
      "We beg the drow for mercy",
    ]) expect(loreFor(line)).toBe("")
  })

  it("never hands over more than a couple of sections at once", () => {
    const everything = "your phylactery, were you ever human, your face, Szass Tam, your lair, redemption"
    expect(sectionsFor(everything).length).toBe(MAX_SECTIONS)
  })

  it("is always guarded: memory, not a lesson, and his own vessel stays secret", () => {
    const block = loreFor("What is a phylactery?")
    expect(block.startsWith(LORE_GUARD)).toBe(true)
    expect(LORE_GUARD).toMatch(/never tell them how a thing like you is ended/)
    expect(LORE_GUARD).toMatch(/never name your own vessel/)
  })

  it("keeps the always-on core short and true to 5E", () => {
    expect(MALACHAR_LORE_CORE.length).toBeLessThan(700)
    expect(MALACHAR_LORE_CORE).toMatch(/within days/)
    expect(MALACHAR_LORE_CORE).toMatch(/fed living souls/)
  })

  it("has no asterisks or backticks, which TTS would read aloud", () => {
    const all = [MALACHAR_LORE_CORE, LORE_GUARD, ...LORE_SECTIONS.map((s) => s.text)].join("\n")
    expect(all).not.toMatch(/[*`]/)
  })
})
