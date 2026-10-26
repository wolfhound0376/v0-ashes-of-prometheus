import { describe, expect, it } from "vitest"
import {
  canonicalLanguage,
  choosableLanguages,
  gibberish,
  languageGrant,
  parseLanguages,
  renderSpeechFor,
  sharedLanguages,
  understands,
  hearDialogueRow,
  listenerFromCharacter,
  partyListener,
  rowLanguages,
} from "./languages"

describe("canonicalLanguage", () => {
  it("folds spellings and dialects", () => {
    expect(canonicalLanguage("elven")).toBe("Elvish")
    expect(canonicalLanguage("Thieves Cant")).toBe("Thieves' Cant")
    expect(canonicalLanguage("deep speech")).toBe("Deep Speech")
    expect(canonicalLanguage("Terran")).toBe("Primordial") // SRD: dialects of Primordial
    expect(canonicalLanguage("one extra language")).toBeNull()
  })
})

describe("parseLanguages — live DB shapes", () => {
  it("reads the comma text in characters.languages", () => {
    expect(parseLanguages("Common, Goblin, Thieves' Cant, Undercommon").speaks).toEqual([
      "Common", "Goblin", "Thieves' Cant", "Undercommon",
    ])
  })
  it("reads sheet_proficiencies.languages arrays", () => {
    expect(parseLanguages(["Common", "Elvish", "Undercommon"]).speaks).toEqual(["Common", "Elvish", "Undercommon"])
  })
  it("treats '—' and null as no languages", () => {
    expect(parseLanguages("—").speaks).toEqual([])
    expect(parseLanguages(null).speaks).toEqual([])
  })
  it("keeps the forge's old placeholder as unknown, not a language", () => {
    const p = parseLanguages("Common, one extra language")
    expect(p.speaks).toEqual(["Common"])
    expect(p.unknown).toEqual(["one extra language"])
  })
  it("splits monster 'understands X but can't speak'", () => {
    const p = parseLanguages("Undercommon, understands Common but can't speak")
    expect(p.speaks).toEqual(["Undercommon"])
    expect(p.understandsOnly).toEqual(["Common"])
  })
  it("notices telepathy", () => {
    expect(parseLanguages("Deep Speech, telepathy 120 ft.").telepathy).toBe(true)
  })
})

describe("understands", () => {
  const fifi = { languages: "Common, Goblin, Thieves' Cant, Undercommon" }
  it("Fifi follows Undercommon but not Elvish", () => {
    expect(understands(fifi, "Undercommon")).toBe(true)
    expect(understands(fifi, "Elvish")).toBe(false)
  })
  it("untagged lines and unknown tongues are never scrambled", () => {
    expect(understands(fifi, null)).toBe(true)
    expect(understands(fifi, "Blibberish")).toBe(true)
  })
  it("Comprehend Languages and telepathy understand everything", () => {
    expect(understands({ ...fifi, comprehendAll: true }, "Elvish")).toBe(true)
    expect(understands({ languages: "telepathy 60 ft." }, "Abyssal")).toBe(true)
  })
  it("an understands-only creature still understands", () => {
    expect(understands({ languages: "understands Common but can't speak" }, "Common")).toBe(true)
  })
})

describe("sharedLanguages", () => {
  it("finds what an NPC can use to be understood", () => {
    expect(sharedLanguages("Elvish, Undercommon", "Common, Undercommon")).toEqual(["Undercommon"])
    expect(sharedLanguages("Elvish", "Common")).toEqual([])
  })
})

describe("gibberish", () => {
  it("is deterministic and leaves punctuation, spacing and stage directions alone", () => {
    const line = "Step back from the gate, rivvil! [she raises her crossbow]"
    const a = gibberish(line, "Elvish")
    expect(a).toBe(gibberish(line, "Elvish"))
    expect(a).not.toContain("Step back")
    expect(a.endsWith("! [she raises her crossbow]")).toBe(true)
    expect(a.split(" ").length).toBe(line.split(" ").length)
  })
  it("keeps a repeated word repeated", () => {
    const g = gibberish("Lolth, Lolth, Lolth.", "Undercommon").split(", ")
    expect(g[0]).toBe(g[1])
  })
  it("different languages sound different", () => {
    expect(gibberish("Who are you?", "Elvish")).not.toBe(gibberish("Who are you?", "Dwarvish"))
  })
  it("keeps capitals so names still read as names", () => {
    expect(gibberish("Ilvara", "Elvish")[0]).toMatch(/[A-Z]/)
  })
})

describe("renderSpeechFor", () => {
  it("scrambles for one listener and not the other", () => {
    const line = "Bring the dwarf to me."
    expect(renderSpeechFor(line, "Elvish", { languages: "Common, Elvish" }).text).toBe(line)
    const r = renderSpeechFor(line, "Elvish", { languages: "Common" })
    expect(r.understood).toBe(false)
    expect(r.text).not.toBe(line)
  })
})

describe("languageGrant (Forge)", () => {
  it("Human Acolyte: Common + 1 species pick + 2 background picks", () => {
    expect(languageGrant({ species: "Human", background: "Acolyte", clazz: "Cleric" })).toMatchObject({
      fixed: ["Common"],
      choices: 3,
    })
  })
  it("Drow Rogue gets Elvish and Thieves' Cant fixed", () => {
    const g = languageGrant({ species: "Drow", background: "Criminal", clazz: "Rogue" })
    expect(g.fixed).toEqual(["Common", "Elvish", "Thieves' Cant"])
    expect(g.choices).toBe(0)
  })
  it("Deep Gnome knows Undercommon by birth", () => {
    expect(languageGrant({ species: "Deep Gnome" }).fixed).toContain("Undercommon")
  })
  it("choice list hides what you know and the secret tongues", () => {
    const names = choosableLanguages(["Common", "Elvish"]).map((l) => l.name)
    expect(names).not.toContain("Elvish")
    expect(names).not.toContain("Druidic")
    expect(names).toContain("Undercommon")
  })
})

describe("dialogue rows", () => {
  const row = {
    speaker: "Liana",
    text: "Hold still, or I let you bleed.",
    speech_segments: [{ speaker: "Liana", line: "Hold still, or I let you bleed.", npc_id: "x", voice_id: null, lang: "Elvish" }],
  }
  it("scrambles text and segment together for a listener without the tongue", () => {
    const heard = hearDialogueRow(row, listenerFromCharacter({ languages: "Common, Goblin" }))
    expect(heard.text).not.toBe(row.text)
    expect(heard.speech_segments![0].line).toBe(heard.text)
  })
  it("returns the same object when understood", () => {
    expect(hearDialogueRow(row, listenerFromCharacter({ languages: "Common, Elvish" }))).toBe(row)
  })
  it("Comprehend Languages on the sheet understands it", () => {
    const l = listenerFromCharacter({ languages: "Common", conditions: [{ name: "Comprehend Languages" }] })
    expect(hearDialogueRow(row, l)).toBe(row)
  })
  it("scrambles a quote inside a Malachar row and leaves his narration", () => {
    const m = {
      text: 'She leans in. "Hold still." Then she is gone.',
      speech_segments: [{ line: "Hold still.", lang: "Elvish" }],
    }
    const heard = hearDialogueRow(m, { languages: "Common" })
    expect(heard.text.startsWith('She leans in. "')).toBe(true)
    expect(heard.text.endsWith('" Then she is gone.')).toBe(true)
    expect(heard.text).not.toContain("Hold still")
  })
  it("party ears: only what every seat understands", () => {
    const p = partyListener([{ languages: "Common, Elvish" }, { languages: "Common, Undercommon" }])
    expect(understands(p, "Common")).toBe(true)
    expect(understands(p, "Elvish")).toBe(false)
  })
  it("rowLanguages reports the tongue and whether it is followed", () => {
    expect(rowLanguages(row, { languages: "Common" })).toEqual([{ lang: "Elvish", understood: false }])
  })
})
