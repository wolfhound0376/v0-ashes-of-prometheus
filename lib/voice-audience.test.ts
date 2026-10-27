import { describe, expect, it } from "vitest"
import { hearsNpcVoice } from "./voice-audience"

const lynkes = { dm: false, name: "Lynkes" }
const gandalf = { dm: false, name: "Gandalf" }
const dm = { dm: true, name: null }

describe("hearsNpcVoice — Sam 2026-10-26: only the addressed player hears; the DM hears all", () => {
  it("the addressed player hears it", () => {
    expect(hearsNpcVoice({ recipient: "Lynkes" }, lynkes)).toBe(true)
  })
  it("another player sees it but does not hear it", () => {
    expect(hearsNpcVoice({ recipient: "Lynkes" }, gandalf)).toBe(false)
  })
  it("the DM screen hears every NPC voice", () => {
    expect(hearsNpcVoice({ recipient: "Lynkes" }, dm)).toBe(true)
  })
  it("matches names case- and space-insensitively", () => {
    expect(hearsNpcVoice({ recipient: "  lynkes " }, lynkes)).toBe(true)
  })
  it("a line addressed to nobody is heard by everyone, as before", () => {
    expect(hearsNpcVoice({ recipient: null }, gandalf)).toBe(true)
    expect(hearsNpcVoice({}, gandalf)).toBe(true)
    expect(hearsNpcVoice({ recipient: "  " }, gandalf)).toBe(true)
  })
  it("a screen that does not know who it is keeps the old behaviour", () => {
    expect(hearsNpcVoice({ recipient: "Lynkes" }, null)).toBe(true)
  })
  it("a player whose hero name is unknown hears nothing addressed to someone else", () => {
    expect(hearsNpcVoice({ recipient: "Lynkes" }, { dm: false, name: null })).toBe(false)
  })
})
