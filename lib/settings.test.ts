import { describe, expect, it } from "vitest"
import { DEFAULT_SETTINGS, parseSettings } from "./settings"

describe("parseSettings", () => {
  it("defaults both switches ON for a fresh browser", () => {
    expect(parseSettings(null)).toEqual({ cinematics: true, introMusic: true })
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings("")).toEqual(DEFAULT_SETTINGS)
  })

  it("reads a saved choice", () => {
    expect(parseSettings(JSON.stringify({ cinematics: false, introMusic: true }))).toEqual({ cinematics: false, introMusic: true })
    expect(parseSettings(JSON.stringify({ cinematics: false, introMusic: false }))).toEqual({ cinematics: false, introMusic: false })
  })

  it("falls back field by field, so one bad key never costs the other", () => {
    expect(parseSettings(JSON.stringify({ cinematics: "no", introMusic: false }))).toEqual({ cinematics: true, introMusic: false })
    expect(parseSettings(JSON.stringify({ introMusic: 0 }))).toEqual(DEFAULT_SETTINGS)
  })

  it("survives garbage in storage", () => {
    expect(parseSettings("{not json")).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings("42")).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings("null")).toEqual(DEFAULT_SETTINGS)
  })

  it("never hands back the shared default object", () => {
    const a = parseSettings(null)
    a.cinematics = false
    expect(DEFAULT_SETTINGS.cinematics).toBe(true)
  })
})
