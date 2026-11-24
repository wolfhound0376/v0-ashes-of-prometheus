import { describe, expect, it } from "vitest"
import { MALACHAR_LAST_WORD, MALACHAR_PERSONA } from "./malachar-persona"

// These guard Sam's ruling of 2026-11-10 against a well-meaning later edit:
// Malachar is the adversary, bound by the rules, and the softeners stay out.
describe("Malachar's persona", () => {
  it("makes him the adversary, not a spectator", () => {
    expect(MALACHAR_PERSONA).toMatch(/you want these particular mortals dead/i)
    expect(MALACHAR_PERSONA).not.toMatch(/bored past caring/i)
  })

  it("keeps his reason unknown: he has one and may not state or invent it", () => {
    expect(MALACHAR_PERSONA).toMatch(/You have a reason/)
    expect(MALACHAR_PERSONA).toMatch(/do not make one up/)
  })

  it("binds him to the rules in both directions", () => {
    expect(MALACHAR_PERSONA).toMatch(/cannot change a number/)
    expect(MALACHAR_PERSONA).toMatch(/deny a success they earned/)
    expect(MALACHAR_PERSONA).toMatch(/never adjust one in either direction/)
    expect(MALACHAR_PERSONA).toMatch(/tell them the truth, whole and plain/)
  })

  it("has none of the old softeners", () => {
    for (const soft of [/warmth has to be audible/i, /people who like each other/i, /you are the commentary/i]) {
      expect(MALACHAR_PERSONA).not.toMatch(soft)
    }
  })

  // Sam, 2026-11-10: "He shouldn't really speak like a DM … They aren't going to be overly verbose."
  it("gives him a lich's voice: few words, and never the language of a game", () => {
    expect(MALACHAR_PERSONA).toMatch(/Few words\. This is the first law of your voice/)
    expect(MALACHAR_PERSONA).toMatch(/You never speak of the game/)
    expect(MALACHAR_PERSONA).not.toMatch(/HECKLER|COMEDIAN/)
    expect(MALACHAR_LAST_WORD).toMatch(/Never the language of a game/)
  })

  it("still forbids hints", () => {
    expect(MALACHAR_PERSONA).toMatch(/You never hint/)
    expect(MALACHAR_LAST_WORD).toMatch(/no hints/i)
  })

  // Sam, 2026-11-23, approving the Complete Guide to Liches pass: the revenge lich.
  it("is a revenge lich: the debt is old and not theirs, and whose it was stays unsaid", () => {
    expect(MALACHAR_PERSONA).toMatch(/a debt older than any of them/)
    expect(MALACHAR_PERSONA).toMatch(/never state and never hint at/)
    expect(MALACHAR_PERSONA).toMatch(/Their needs are beneath you/)
    expect(MALACHAR_PERSONA).toMatch(/Your pride is in your mind/)
    expect(MALACHAR_PERSONA).toMatch(/The offer is bait/)
    // the world may cheat; his voice may not
    expect(MALACHAR_PERSONA).toMatch(/You do not lie about the world/)
  })

  it("has no asterisks or backticks, which TTS would read aloud", () => {
    expect(MALACHAR_PERSONA + MALACHAR_LAST_WORD).not.toMatch(/[*`]/)
  })
})
