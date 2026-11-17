import { describe, expect, it } from "vitest"
import { sentences, spokenLine, SPOKEN_WORD_CAP } from "./malachar-spoken"

// The longest live Malachar line from 2026-11-15 (45 words).
const LONG =
  "Six days on cold stone. The bar was already here when you arrived — left behind by whoever came before you, or dropped during some forgotten struggle. You did not ask questions. You kept it close.\n\nSamson has been here two. The spider found him."

describe("spokenLine", () => {
  it("leaves a short line alone", () => {
    expect(spokenLine("The iron holds.")).toBe("The iron holds.")
  })

  it("stops a long line at a sentence end, within the cap", () => {
    const out = spokenLine(LONG)
    expect(out.split(/\s+/).length).toBeLessThanOrEqual(SPOKEN_WORD_CAP)
    expect(out.startsWith("Six days on cold stone.")).toBe(true)
    expect(/[.!?…]$/.test(out)).toBe(true)
  })

  it("always speaks the first sentence whole, even past the cap", () => {
    const one = "word ".repeat(30).trim() + "."
    expect(spokenLine(one)).toBe(one)
  })

  it("keeps a closing quote with its sentence", () => {
    expect(sentences('He says, "Run." Nobody does.')).toEqual(['He says, "Run."', "Nobody does."])
  })

  it("speaks nothing for nothing", () => {
    expect(spokenLine("   ")).toBe("")
  })
})
