import { describe, it, expect } from "vitest"
import { cleanSpeed, narrationKey, MALACHAR_VOICE, MAX_NARRATION_CHARS } from "./narration-cache"

const GATE = "The pen gate opens a hand's width. A drow in a stained leather apron comes in with a satchel of vials, and the gate is locked behind her."

describe("cleanSpeed", () => {
  it("keeps the walk's tempo as sent", () => {
    expect(cleanSpeed(1.15)).toBe(1.15)
  })

  it("clamps to the band ElevenLabs accepts", () => {
    expect(cleanSpeed(5)).toBe(1.2)
    expect(cleanSpeed(0.1)).toBe(0.7)
  })

  it("falls back to natural tempo on junk rather than throwing", () => {
    for (const bad of [undefined, null, "1.15", NaN, Infinity, {}]) {
      expect(cleanSpeed(bad)).toBe(1)
    }
  })

  // Without rounding, 1.15 and 1.1500000000000001 would be two cache entries
  // for the same line — a silent, permanent double charge.
  it("rounds, so float noise cannot split one line across two cache entries", () => {
    expect(cleanSpeed(1.1500000000000001)).toBe(cleanSpeed(1.15))
  })
})

describe("narrationKey", () => {
  it("is stable for the same line — this is what makes the cache work at all", () => {
    expect(narrationKey(GATE, MALACHAR_VOICE, 1.15)).toBe(narrationKey(GATE, MALACHAR_VOICE, 1.15))
  })

  it("changes with the text", () => {
    expect(narrationKey(GATE, MALACHAR_VOICE, 1.15)).not.toBe(narrationKey(GATE + "!", MALACHAR_VOICE, 1.15))
  })

  // The two that would serve stale audio if they were left out of the key.
  it("changes with the tempo", () => {
    expect(narrationKey(GATE, MALACHAR_VOICE, 1.15)).not.toBe(narrationKey(GATE, MALACHAR_VOICE, 1.0))
  })

  it("changes with the voice", () => {
    expect(narrationKey(GATE, MALACHAR_VOICE, 1.15)).not.toBe(narrationKey(GATE, "someOtherVoiceId", 1.15))
  })

  it("lands under the narration prefix with an .mp3 name", () => {
    expect(narrationKey(GATE, MALACHAR_VOICE, 1.15)).toMatch(/^narration\/[0-9a-f]{32}\.mp3$/)
  })

  it("leaves room for the longest beat the route will accept", () => {
    expect(GATE.length).toBeLessThan(MAX_NARRATION_CHARS)
  })
})
