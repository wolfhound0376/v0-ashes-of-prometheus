import { describe, expect, it } from "vitest"
import { chooseLineLanguage, languagePromptBlock } from "./npc-languages"

describe("chooseLineLanguage", () => {
  const drow = "Elvish, Undercommon"
  it("a drow answering Fifi uses the tongue she follows", () => {
    expect(chooseLineLanguage({ speaker: drow, addressee: "Common, Goblin, Thieves' Cant, Undercommon" })).toBe("Undercommon")
  })
  it("prefers Common when shared", () => {
    expect(chooseLineLanguage({ speaker: "Common, Dwarvish", addressee: "Common, Dwarvish" })).toBe("Common")
  })
  it("nothing shared: the NPC's own first tongue", () => {
    expect(chooseLineLanguage({ speaker: "Elvish", addressee: "Common" })).toBe("Elvish")
  })
  it("Malachar's tag wins when the NPC speaks it", () => {
    expect(chooseLineLanguage({ speaker: drow, tagged: "Elvish", addressee: "Common, Undercommon" })).toBe("Elvish")
  })
  it("a tag the NPC cannot speak is ignored", () => {
    expect(chooseLineLanguage({ speaker: "Elvish", tagged: "Dwarvish", addressee: "Common" })).toBe("Elvish")
  })
  it("no data for the NPC: trust the tag, else never scramble", () => {
    expect(chooseLineLanguage({ speaker: null, tagged: "Abyssal" })).toBe("Abyssal")
    expect(chooseLineLanguage({ speaker: null, addressee: "Common" })).toBeNull()
  })
})

describe("languagePromptBlock", () => {
  it("lists party and NPC tongues and the tag form", () => {
    const b = languagePromptBlock([{ name: "Jorlan", languages: "Elvish, Undercommon" }], [{ name: "Fifi", languages: "Common, Undercommon" }])
    expect(b).toContain("[NPC_SPEECH: Exact Canonical Name | Language]")
    expect(b).toContain("Jorlan: Elvish, Undercommon")
    expect(b).toContain("NEVER translate")
  })
})

import { tongueGaps } from "./npc-languages"

describe("no shared tongue (Derendil and Lynkes, 2026-11-13)", () => {
  const lynkes = { name: "Lynkes", languages: "Common, Halfling, Thieves' Cant" }
  const derendil = { name: "Prince Derendil", languages: "Elvish, Undercommon" }
  const sarith = { name: "Sarith Kzekarit", languages: "Elvish, Undercommon" }
  const jimjar = { name: "Jimjar", languages: "Gnomish, Undercommon, Common" }
  const eldeth = { name: "Eldeth Feldrun", languages: "Common, Dwarvish" }

  it("finds the pair and names who could interpret", () => {
    const gaps = tongueGaps([derendil, sarith, jimjar, eldeth], [lynkes])
    const d = gaps.find((g) => g.npc === "Prince Derendil")
    expect(d).toEqual({ npc: "Prince Derendil", hero: "Lynkes", interpreters: ["Jimjar"] })
    // Sarith shares nothing with her either, and is nobody's interpreter; Eldeth has Common and is no gap
    expect(gaps.map((g) => g.npc).sort()).toEqual(["Prince Derendil", "Sarith Kzekarit"])
  })
  it("says so when nobody can interpret", () => {
    expect(tongueGaps([derendil, eldeth], [lynkes])).toEqual([{ npc: "Prince Derendil", hero: "Lynkes", interpreters: [] }])
    expect(languagePromptBlock([derendil, eldeth], [lynkes])).toContain("Prince Derendil and Lynkes: no shared tongue. Nobody here can interpret.")
  })
  it("tells Malachar the NPC did not understand either, and to offer the interpreter", () => {
    const b = languagePromptBlock([derendil, jimjar], [lynkes])
    expect(b).toContain("Could interpret: Jimjar.")
    expect(b).toContain('never "repeats itself"')
  })
  it("is silent when everyone can talk, and for NPCs with no language data", () => {
    expect(languagePromptBlock([eldeth], [lynkes])).not.toContain("NO SHARED TONGUE")
    expect(tongueGaps([{ name: "Mystery", languages: null }], [lynkes])).toEqual([])
  })
})

import { loadNpcLanguages } from "./npc-languages"

function fakeDb(tables: Record<string, any[]>) {
  return {
    from(t: string) {
      const q: any = { rows: tables[t] ?? [] }
      q.select = () => q
      q.in = (col: string, vals: string[]) => ({ data: q.rows.filter((r: any) => vals.includes(r[col])), error: null })
      return q
    },
  }
}

describe("loadNpcLanguages", () => {
  const bestiary = [{ id: "b-gnome", languages: "Gnomish, Terran, Undercommon" }]
  it("is dormant until npc_encounters has a languages column", async () => {
    const db = fakeDb({ npc_encounters: [{ id: "eldeth", bestiary_id: "b-gnome", character_id: "pc" }], bestiary })
    expect((await loadNpcLanguages(db, ["eldeth"])).size).toBe(0)
  })
  it("the NPC's own row wins over a wrong bestiary link; character_id is never read", async () => {
    const db = fakeDb({
      npc_encounters: [
        { id: "eldeth", bestiary_id: "b-gnome", character_id: "pc", languages: "Common, Dwarvish" },
        { id: "jimjar", bestiary_id: "b-gnome", character_id: "pc", languages: null },
      ],
      bestiary,
      characters: [{ id: "pc", languages: "Common, Elvish" }],
    })
    const m = await loadNpcLanguages(db, ["eldeth", "jimjar"])
    expect(m.get("eldeth")).toBe("Common, Dwarvish")
    expect(m.get("jimjar")).toBe("Gnomish, Terran, Undercommon")
  })
})
