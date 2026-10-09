import { describe, expect, it } from "vitest"
import manifest from "../data/vo-manifest.json"
import { MALACHAR_VOICE_ID, PLAYER_CHARACTER_VOICES, SYSTEM_VOICE_ID, resolveNamedNpcVoiceId } from "../tts"

// The live voices must match the pre-recorded VO library, or a character
// changes voice between a recorded clip and a live line.
const cast = manifest.cast as Record<string, { voice_id: string }>

describe("canon voices match the VO library", () => {
  it.each([
    ["Ilvara Mizzrym", "ilvara"],
    ["Asha Vandree", "asha"],
    ["Shoor Vandree", "shoor"],
    ["Jorlan Duskryn", "jorlan"],
    ["Drow Guard", "drowguard"],
    ["Ront", "ront"],
    ["Buppido", "buppido"],
    ["Jimjar", "jimjar"],
    ["Eldeth Feldrun", "eldeth"],
    ["Sarith Kzekarit", "sarith"],
    ["Shuushar the Awakened", "shuushar"],
    ["Prince Derendil", "derendil"],
    ["Stool", "stool"],
    ["Malachar", "malachar"],
  ])("%s", (dbName, castKey) => {
    expect(resolveNamedNpcVoiceId(dbName)).toBe(cast[castKey].voice_id)
  })

  it("Malachar, players and the system voice", () => {
    expect(MALACHAR_VOICE_ID).toBe(cast.malachar.voice_id)
    expect(SYSTEM_VOICE_ID).toBe(cast.system.voice_id)
    for (const key of ["samson", "kenta", "fifi", "scott"]) {
      expect(PLAYER_CHARACTER_VOICES[key]).toBe(cast[key].voice_id)
    }
  })
})

describe("Topsy and Turvy resolve by their DB spelling", () => {
  it("each twin has its own voice", () => {
    const topsy = resolveNamedNpcVoiceId("Topsy")
    const turvy = resolveNamedNpcVoiceId("Turvy")
    expect(topsy).toBeTruthy()
    expect(turvy).toBeTruthy()
    expect(topsy).not.toBe(turvy)
  })
})

describe("Turvy's delivery profile", () => {
  it("speaks on v3 with the accent direction, at a stability v3 accepts", async () => {
    const { deliveryFor } = await import("../tts-model")
    const turvy = deliveryFor(resolveNamedNpcVoiceId("Turvy"))
    expect(turvy?.model).toBe("eleven_v3")
    expect(turvy?.direction).toMatch(/romanian accent/i)
    expect([0, 0.5, 1]).toContain(turvy?.stability)
    expect(deliveryFor(resolveNamedNpcVoiceId("Ront"))).toBeNull()
  })
})
