import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { EXTRACT_DC, EXTRACTION_METHOD, extract, isPrep, methodOf, preparedName } from "./extraction"
import { BREW_DC } from "./alchemy-bench"

describe("extract — the rule Sam approved, 2026-10-01", () => {
  it("shares the brewing DC", () => {
    expect(EXTRACT_DC).toBe(BREW_DC)
  })

  it("prepares on a plain success and teaches nothing", () => {
    const r = extract({ check: 12, die: 8, knownColumns: [1] })
    expect(r).toMatchObject({ ok: true, outcome: "prepared", learnColumn: null })
  })

  it("teaches the SECOND column when the check beats the DC by 5", () => {
    expect(extract({ check: 15, die: 13, knownColumns: [1] })).toMatchObject({ outcome: "prepared", learnColumn: 2 })
  })

  it("does not re-teach column 2 if it is already known", () => {
    expect(extract({ check: 18, die: 15, knownColumns: [1, 2] })).toMatchObject({ outcome: "prepared", learnColumn: null })
  })

  it("bruises on a miss by less than 5", () => {
    expect(extract({ check: 9, die: 7, knownColumns: [] })).toMatchObject({ outcome: "bruised" })
    expect(extract({ check: 6, die: 4, knownColumns: [] })).toMatchObject({ outcome: "bruised" })
  })

  it("ruins on a miss by 5 or more", () => {
    expect(extract({ check: 5, die: 3, knownColumns: [] })).toMatchObject({ outcome: "ruined" })
  })

  it("ruins on a natural 1 whatever the total", () => {
    expect(extract({ check: 14, die: 1, knownColumns: [] })).toMatchObject({ outcome: "ruined" })
  })

  it("refuses a face that is not a d20 face", () => {
    expect(extract({ check: 12, die: 0, knownColumns: [] })).toEqual({ ok: false, reason: "bad_check" })
    expect(extract({ check: 12, die: 21, knownColumns: [] })).toEqual({ ok: false, reason: "bad_check" })
  })
})

describe("methods", () => {
  it("gives every ingredient in the seeded grid exactly one method", () => {
    const seed = readFileSync(join(__dirname, "../supabase/migrations/20261001100000_extraction.sql"), "utf8")
    const inSql = [...seed.matchAll(/\('([a-z-]+)',\s*'(grind|cut|press|decant)'\)/g)].map((m) => [m[1], m[2]])
    expect(inSql.length).toBe(Object.keys(EXTRACTION_METHOD).length)
    for (const [slug, method] of inSql) expect(EXTRACTION_METHOD[slug], slug).toBe(method)
  })

  it("lets the catalogue row override the code table", () => {
    expect(methodOf("bluecap", { extraction: "press" })).toBe("press")
    expect(methodOf("bluecap", { extraction: "boil" })).toBe("grind")
    expect(methodOf("not-an-ingredient")).toBeNull()
  })

  it("names a prepared row so it never stacks onto the raw one", () => {
    expect(preparedName("Bluecap", "grind", false)).toBe("Bluecap (ground)")
    expect(preparedName("Bluecap", "grind", true)).toBe("Bluecap (ground, bruised)")
  })

  it("recognises a prep blob", () => {
    expect(isPrep({ method: "cut", bruised: false })).toBe(true)
    expect(isPrep({ method: "boil", bruised: false })).toBe(false)
    expect(isPrep(null)).toBe(false)
  })
})
