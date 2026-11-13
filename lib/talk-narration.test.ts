import { describe, expect, it } from "vitest"
import { dropsNarration, reportsRoll, withoutNarration } from "./talk-narration"

const rows = [
  { speaker: "Malachar", speaker_type: "dm", text: "Her jaw tightens." },
  { speaker: "Eldeth Feldrun", speaker_type: "npc", text: "That is enough." },
  { speaker: "Malachar", speaker_type: "dm", text: "She looks away." },
]
const talk = { talkWith: "Eldeth Feldrun", message: "What do you know about the guards?", rawReply: 'Her jaw tightens. "That is enough." She looks away.', asksForRoll: false }

describe("narration in a conversation (Sam, 2026-11-13)", () => {
  it("a plain talk turn keeps only what the NPC said", () => {
    expect(withoutNarration(rows, talk).map((r) => r.speaker)).toEqual(["Eldeth Feldrun"])
  })
  it("a line to the DM, or no conversation at all, keeps the narration", () => {
    expect(withoutNarration(rows, { ...talk, talkWith: null })).toBe(rows)
  })
  it("a check keeps the narration: Malachar calling for the roll", () => {
    expect(withoutNarration(rows, { ...talk, asksForRoll: true })).toBe(rows)
  })
  it("a check keeps the narration: the player reporting the result", () => {
    expect(reportsRoll("🎲 Persuasion: 17")).toBe(true)
    expect(reportsRoll("[Dice Roll] Insight 12 [ROLL_RESULT:0b0e3f6e-1111-2222-3333-444455556666]")).toBe(true)
    expect(reportsRoll("I roll my eyes at her")).toBe(false)
    expect(withoutNarration(rows, { ...talk, message: "🎲 Persuasion: 17" })).toBe(rows)
  })
  it("something happening keeps the narration", () => {
    expect(dropsNarration({ ...talk, rawReply: 'He presses the wire into your hand. [ITEM_ADD: Bent wire] "Don\'t lose it."' })).toBe(false)
    expect(dropsNarration({ ...talk, rawReply: '"Out." [NPC_LEAVE: Ront]' })).toBe(false)
  })
  it("bookkeeping tags do not count as something happening", () => {
    expect(dropsNarration({ ...talk, rawReply: '[NPC_ENCOUNTER: Eldeth Feldrun | 0] [NPC_SPEECH: Eldeth Feldrun]"Aye."[/NPC_SPEECH] [NPC_DISPOSITION: Eldeth Feldrun | wary]' })).toBe(true)
  })
  it("never leaves an empty turn: no NPC line means the prose stays", () => {
    const prose = [{ speaker: "Malachar", speaker_type: "dm", text: "She says nothing at all." }]
    expect(withoutNarration(prose, talk)).toBe(prose)
  })
})
