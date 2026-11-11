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
    expect(MALACHAR_PERSONA).toMatch(/cannot fudge a roll/)
    expect(MALACHAR_PERSONA).toMatch(/deny a success they earned/)
    expect(MALACHAR_PERSONA).toMatch(/never adjust them in either direction/)
    expect(MALACHAR_PERSONA).toMatch(/direct rules question gets a true and complete answer/)
  })

  it("has none of the old softeners", () => {
    for (const soft of [/warmth has to be audible/i, /people who like each other/i, /you are the commentary/i]) {
      expect(MALACHAR_PERSONA).not.toMatch(soft)
    }
  })

  it("still forbids hints", () => {
    expect(MALACHAR_PERSONA).toMatch(/You never hint/)
    expect(MALACHAR_LAST_WORD).toMatch(/no hints/)
  })

  it("has no asterisks or backticks, which TTS would read aloud", () => {
    expect(MALACHAR_PERSONA + MALACHAR_LAST_WORD).not.toMatch(/[*`]/)
  })
})
