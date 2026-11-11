import { describe, expect, it } from "vitest"
import { MALACHAR_MOODS, MALACHAR_MOOD_RULE, readMalacharMood, stripMalacharMood } from "./malachar-mood"
import { sanitizeForTTS } from "./tts"

describe("Malachar's mood tag", () => {
  it("reads each of the five, whatever the case or spacing", () => {
    for (const m of MALACHAR_MOODS) expect(readMalacharMood(`The gate holds.\n[MOOD:  ${m.toUpperCase()} ]`)).toBe(m)
  })
  it("drops a word that is not on the list, and a reply with no tag", () => {
    expect(readMalacharMood("You wait.\n[MOOD: gleeful]")).toBeNull()
    expect(readMalacharMood("You wait.")).toBeNull()
  })
  it("the last tag wins", () => {
    expect(readMalacharMood("[MOOD: laughing] He stops. [MOOD: angry]")).toBe("angry")
  })
  it("never reaches the player: cut from the prose, known word or not", () => {
    expect(stripMalacharMood("The stone is cold.\n\n[MOOD: mocking]")).toBe("The stone is cold.")
    expect(stripMalacharMood("A whip cracks. [MOOD: gleeful]\nThe drow are awake.")).toBe("A whip cracks.\nThe drow are awake.")
  })
  it("is never read aloud", () => {
    expect(sanitizeForTTS("The stone is cold. [MOOD: angry]")).not.toMatch(/MOOD|angry/i)
  })
  it("the prompt names all five", () => {
    for (const m of MALACHAR_MOODS) expect(MALACHAR_MOOD_RULE).toContain(`[MOOD: ${m}]`)
  })
})
