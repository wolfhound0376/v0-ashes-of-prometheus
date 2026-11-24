import { describe, expect, it } from "vitest"
import { BRIEF_MAX, formatBrief } from "./npc-brief"
import type { AgentCard } from "./npc-agents"

const card: AgentCard = {
  key: "eldeth", name: "Eldeth Feldrun", aliases: ["Eldeth"], role: "companion", character_id: "c1", sprite_slug: "eldeth",
  bible: "A shield dwarf of Gauntlgrym.", agenda: { wants: "home", fears: "dying far from home", secret: "the shield request", turns: "warms to the brave" },
  voice_note: "Blunt.", sources: "", chattiness: 3, remembered_through: null,
}
const mem = (line: string, about: string | null = null) => ({ agent_key: "eldeth", about_id: about, line, gravity: 50, created_at: "2026-11-23T00:00:00Z" })

describe("the brief every NPC call reads", () => {
  it("carries the card, the secret as a secret, memory and the DM's notes", () => {
    const b = formatBrief({ card, memories: [mem("Kenta shared his ration.", "k1")], coaching: [{ note: "Less talk at camp.", scope: "both", active: true }], heroId: "k1", heroName: "Kenta" })
    expect(b).toContain("WHO ELDETH FELDRUN IS")
    expect(b).toContain("SECRET (never say it outright")
    expect(b).toContain("Kenta shared his ration. [about the one in front of them]")
    expect(b).toContain("- Less talk at camp.")
  })
  it("says plainly when there is no memory yet", () => {
    expect(formatBrief({ card, memories: [], coaching: [] })).toContain("no memories of this run yet")
  })
  it("Malachar's is memory and coaching only (his persona is elsewhere)", () => {
    const b = formatBrief({ card: { ...card, name: "Malachar" }, memories: [mem("The rogue mocked him.")], coaching: [], cardText: false })
    expect(b).not.toContain("WHO ")
    expect(b).not.toContain("SECRET")
    expect(b).toContain("The rogue mocked him.")
  })
  it("never runs long", () => {
    const many = Array.from({ length: 50 }, (_, i) => mem(`A long remembered thing that happened, number ${i}, in the pen.`))
    expect(formatBrief({ card, memories: many, coaching: [] }).length).toBeLessThanOrEqual(BRIEF_MAX)
  })
})
