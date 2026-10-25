import { describe, expect, it } from "vitest"
import { cleanName, describeSprite, validateSubmission, FORGE_FORMAT } from "./forge-submission"

const good = () => ({
  playerName: "Alejandro",
  heroName: "Varek of the Low Road",
  payload: { format: FORGE_FORMAT, character: { name: "Varek of the Low Road", level: 1, class: "Fighter" }, inventory: [] },
  assets: { voice: { mode: "skip" }, face: { mode: "skip" } },
})

describe("validateSubmission", () => {
  it("accepts a complete hand-in with everything skipped", () => {
    expect(validateSubmission(good())).toBeNull()
  })

  it("wants both names", () => {
    expect(validateSubmission({ ...good(), playerName: "  " })).toMatch(/your name/i)
    expect(validateSubmission({ ...good(), heroName: "" })).toMatch(/hero needs a name/i)
  })

  it("only takes a Character Forge export", () => {
    const s = good()
    s.payload.format = "something-else"
    expect(validateSubmission(s)).toMatch(/not a Character Forge export/i)
    // the format tag may ride on the character instead (the builder's own export puts it there)
    const t = good()
    t.payload = { format: "", character: { format: FORGE_FORMAT, name: "X", level: 1 } } as never
    expect(validateSubmission(t)).toBeNull()
  })

  it("bounds the level", () => {
    const s = good()
    s.payload.character.level = 25
    expect(validateSubmission(s)).toMatch(/level/i)
  })

  it("a recorded voice needs the recording and consent", () => {
    const s = good()
    s.assets = { voice: { mode: "record", samplePath: "", consent: true, consentBy: "Sam" } } as never
    expect(validateSubmission(s)).toMatch(/recording and the consent/i)
    s.assets = { voice: { mode: "record", samplePath: "forge/x/voice.webm", consent: true, consentBy: "Sam" } } as never
    expect(validateSubmission(s)).toBeNull()
  })

  it("face photos: one to three, with consent", () => {
    const s = good()
    s.assets = { face: { mode: "photos", paths: [], consent: true, consentBy: "Sam" } } as never
    expect(validateSubmission(s)).toMatch(/one to three/i)
    s.assets = { face: { mode: "photos", paths: ["a", "b", "c", "d"], consent: true, consentBy: "Sam" } } as never
    expect(validateSubmission(s)).toMatch(/one to three/i)
    s.assets = { face: { mode: "photos", paths: ["a", "b", "c"], consent: false, consentBy: "Sam" } } as never
    expect(validateSubmission(s)).toMatch(/consent/i)
    s.assets = { face: { mode: "photos", paths: ["a", "b", "c"], consent: true, consentBy: "Sam" } } as never
    expect(validateSubmission(s)).toBeNull()
  })

  it("rejects garbage", () => {
    expect(validateSubmission(null)).toBeTruthy()
    expect(validateSubmission("x")).toBeTruthy()
    expect(validateSubmission({ ...good(), assets: undefined })).toMatch(/choices are missing/i)
  })
})

describe("cleanName", () => {
  it("collapses whitespace and bounds length", () => {
    expect(cleanName("  Fifi   of  Copperas Cove ")).toBe("Fifi of Copperas Cove")
    expect(cleanName("x".repeat(100)).length).toBe(40)
    expect(cleanName(42)).toBe("")
  })
})

describe("describeSprite", () => {
  it("always puts the hero in rags with empty hands", () => {
    const d = describeSprite({ species: "Half-Orc", clazz: "Barbarian", hair: "black", skin: "olive", build: "broad", mark: "a scar across the cheek" })
    expect(d).toMatch(/^Half-Orc Barbarian, broad build, black hair, olive skin, a scar across the cheek;/)
    expect(d).toMatch(/ragged torn grey tunic/)
    expect(d).toMatch(/no weapons, no armor/)
  })

  it("leaves out the defaults and copes with nothing known", () => {
    const d = describeSprite({ hair: "shaved", skin: "pale", build: "average", mark: "none" })
    expect(d.startsWith("adventurer, shaved head, pale skin;")).toBe(true)
    expect(d).not.toMatch(/average/)
    expect(d).not.toMatch(/none/)
  })
})
