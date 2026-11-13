import { describe, expect, it } from "vitest"
import { cleanRehearsal, isRehearsalRoll, rehearsalLinesFor } from "./rehearsal-history"

describe("a rehearsal remembers itself (Sam, 2026-11-13)", () => {
  it("sends only the lines that exist on this screen alone", () => {
    const dialogue = [
      { id: "8c1d2c9e-0000-4000-8000-000000000001", speaker: "Malachar", text: "Stored history." },
      { id: "optimistic-a", speaker: "Kenta of Neverwinter", text: "(I try to talk the guard down.)" },
      { id: "optimistic-b", speaker: "Malachar", text: "Roll for it. [[1d20+3]]" },
      { id: "optimistic-c", speaker: "Kenta of Neverwinter", text: "🎲 Persuasion: 19" },
    ]
    expect(rehearsalLinesFor(dialogue, "[Dice Roll] Persuasion: 19").map((l) => l.text)).toEqual([
      "(I try to talk the guard down.)", "Roll for it. [[1d20+3]]", "🎲 Persuasion: 19",
    ])
  })
  it("leaves out the line being sent, which the route adds itself", () => {
    const dialogue = [
      { id: "optimistic-a", speaker: "Malachar", text: "Well?" },
      { id: "optimistic-b", speaker: "Kenta of Neverwinter", text: "I say nothing." },
    ]
    expect(rehearsalLinesFor(dialogue, "I say nothing.")).toEqual([{ speaker: "Malachar", text: "Well?" }])
    const dressed = [{ id: "optimistic-a", speaker: "Malachar", text: "Well?" }, { id: "optimistic-b", speaker: "Kenta of Neverwinter", text: "(I say nothing.)" }]
    expect(rehearsalLinesFor(dressed, "I say nothing.")).toEqual([{ speaker: "Malachar", text: "Well?" }])
  })
  it("drops anything malformed and caps what it keeps", () => {
    expect(cleanRehearsal("nope")).toEqual([])
    expect(cleanRehearsal([{ speaker: "A", text: "ok" }, { speaker: "", text: "x" }, { text: "no speaker" }, null, 7])).toEqual([{ speaker: "A", text: "ok" }])
    const many = Array.from({ length: 50 }, (_, i) => ({ speaker: "A", text: `line ${i}` }))
    const kept = cleanRehearsal(many)
    expect(kept).toHaveLength(30)
    expect(kept[29].text).toBe("line 49")
    expect(cleanRehearsal([{ speaker: "A", text: "x".repeat(5000) }])[0].text).toHaveLength(2000)
  })
  it("knows a rehearsal roll from a ledger roll", () => {
    expect(isRehearsalRoll("rehearsal-123")).toBe(true)
    expect(isRehearsalRoll("0b0e3f6e-1111-2222-3333-444455556666")).toBe(false)
    expect(isRehearsalRoll(undefined)).toBe(false)
  })
})
