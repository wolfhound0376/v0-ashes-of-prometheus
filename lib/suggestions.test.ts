import { describe, expect, it } from "vitest"
import { buildSuggestionContext, type SpeakerKind } from "./suggestions"

// Mirrors lib/tts.ts classifySpeaker without its browser-side voice state.
const classify = (speaker?: string | null): SpeakerKind => {
  const name = (speaker ?? "").toLowerCase()
  if (/\bmalachar\b/.test(name)) return "dm"
  if (name === "fifi of copperas cove") return "player"
  return "npc"
}

// Shape taken from the live `dialogue` table, 2026-10-10 20:56–21:02: one
// Malachar reply split into narration + Eldeth rows, Eldeth's line last.
const eldethNight = [
  { id: "1", speaker: "Malachar", text: "Jorlan Duskryn steps out of the dark passage, a stack of clay bowls in his hands." },
  { id: "2", speaker: "Jorlan Duskryn", text: "If I could give you a means to escape from here — would you take it?" },
  { id: "3", speaker: "Fifi of Copperas Cove", text: "Eldeth, what is that noise?" },
  { id: "4", speaker: "Malachar", text: "The scraping stops. Dead silence — then a guard's torch gutters out." },
  { id: "5", speaker: "Eldeth Feldrun", text: "That sound. It's been coming closer every night for three days." },
]

describe("buildSuggestionContext", () => {
  it("takes the latest NPC line as the beat, not the Malachar prose before it", () => {
    const ctx = buildSuggestionContext(eldethNight, classify)
    expect(ctx.beatKey).toBe("5")
    expect(ctx.sceneText.endsWith("Eldeth Feldrun: That sound. It's been coming closer every night for three days.")).toBe(true)
  })

  it("reads the conversation partner off the last NPC who spoke", () => {
    const ctx = buildSuggestionContext(eldethNight, classify)
    expect(ctx.talkingTo).toBe("Eldeth Feldrun")
    expect(ctx.present).toEqual(["Jorlan Duskryn", "Eldeth Feldrun"])
  })

  it("lets an explicit talk partner override the feed", () => {
    const ctx = buildSuggestionContext(eldethNight, classify, { talkWith: "Jorlan" })
    expect(ctx.talkingTo).toBe("Jorlan")
  })

  it("adds the NPC on stage to those present without duplicating", () => {
    expect(buildSuggestionContext(eldethNight, classify, { onStage: "Eldeth Feldrun" }).present).toEqual(["Jorlan Duskryn", "Eldeth Feldrun"])
    expect(buildSuggestionContext(eldethNight, classify, { onStage: "Ront" }).present).toContain("Ront")
  })

  it("labels narration as the DM and keeps the exchange oldest-first", () => {
    const ctx = buildSuggestionContext(eldethNight, classify)
    const lines = ctx.sceneText.split("\n")
    expect(lines[0].startsWith("Narration: Jorlan Duskryn steps out")).toBe(true)
    expect(lines[2]).toBe("Fifi of Copperas Cove: Eldeth, what is that noise?")
    expect(lines.length).toBe(5)
  })

  it("does not move the beat when only the player has spoken since", () => {
    const rows = [...eldethNight, { id: "6", speaker: "Fifi of Copperas Cove", text: "I listen harder." }]
    const ctx = buildSuggestionContext(rows, classify)
    expect(ctx.beatKey).toBe("5")
    expect(ctx.sceneText.includes("I listen harder.")).toBe(false)
  })

  it("returns an empty context when no one but players has spoken", () => {
    const ctx = buildSuggestionContext([{ id: "1", speaker: "Fifi of Copperas Cove", text: "hello?" }], classify)
    expect(ctx).toEqual({ beatKey: null, sceneText: "", talkingTo: null, present: [] })
  })

  it("keeps the newest line when trimming a long exchange", () => {
    const long = Array.from({ length: 10 }, (_, i) => ({ id: String(i), speaker: "Malachar", text: "x".repeat(500) + i }))
    long.push({ id: "last", speaker: "Eldeth Feldrun", text: "Well?" })
    const ctx = buildSuggestionContext(long, classify)
    expect(ctx.sceneText.length).toBeLessThanOrEqual(1600)
    expect(ctx.sceneText.endsWith("Eldeth Feldrun: Well?")).toBe(true)
    expect(ctx.sceneText.split("\n").length).toBeLessThanOrEqual(6)
  })

  it("falls back to the row text as the key when a row has no id", () => {
    const ctx = buildSuggestionContext([{ speaker: "Malachar", text: "The gate creaks." }], classify)
    expect(ctx.beatKey).toBe("The gate creaks.")
    expect(ctx.talkingTo).toBeNull()
  })
})
