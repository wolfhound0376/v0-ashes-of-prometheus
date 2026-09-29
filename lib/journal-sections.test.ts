import { describe, expect, it } from "vitest"
import {
  AUTOPSY_DC_BASE,
  AUTO_FILED,
  DEFAULT_SECTION,
  JOURNAL_SECTIONS,
  SECTION_LABEL,
  autopsy,
  autopsyDc,
  checkGate,
  expireOffers,
  hasInstrument,
  hasSkill,
  isJournalSection,
  limitApplies,
  needsConsent,
  npcReads,
  offerFor,
  sectionFor,
  shareWith,
  tellFromLore,
  unlockFor,
  windowFor,
  type GateSheet,
  type JournalOffer,
} from "./journal-sections"

const FIFI = "d00aa5b8-ced1-477d-9ec8-0861cca55498"

const rogue: GateSheet = { class: "Rogue", skills: { stealth: true }, tools: ["Thieves' Tools"] }
const bard: GateSheet = { class: "Bard", skills: { performance: true }, tools: ["Lute"] }
const cleric: GateSheet = { class: "Cleric", skills: { medicine: true }, arcaneCaster: false }
const wizard: GateSheet = { class: "Wizard", skills: { arcana: true }, arcaneCaster: true }

// ---------------------------------------------------------------------------
// §1 The sections
// ---------------------------------------------------------------------------

describe("the sections", () => {
  it("carries the thirteen Sam kept", () => {
    expect(JOURNAL_SECTIONS).toHaveLength(13)
    expect(DEFAULT_SECTION).toBe("pages")
  })

  it("labels every one of them", () => {
    for (const s of JOURNAL_SECTIONS) expect(SECTION_LABEL[s]).toBeTruthy()
  })

  it("recognises its own and refuses anything else", () => {
    expect(isJournalSection("autopsy")).toBe(true)
    expect(isJournalSection("diary")).toBe(false)
    expect(isJournalSection(null)).toBe(false)
  })

  it("keeps the diary limit off structured records", () => {
    expect(limitApplies("pages")).toBe(true)
    expect(limitApplies("witness")).toBe(true)
    expect(limitApplies("lore")).toBe(true)
    expect(limitApplies("recipes")).toBe(false)
    expect(limitApplies("maps")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// §2 Routing
// ---------------------------------------------------------------------------

describe("routing a discovery", () => {
  it("sends each herb effect to its own bench", () => {
    expect(sectionFor({ kind: "herb_effect", effectClass: "potion" })).toBe("alchemy")
    expect(sectionFor({ kind: "herb_effect", effectClass: "poison" })).toBe("poisoner")
    expect(sectionFor({ kind: "herb_effect", effectClass: "drink" })).toBe("spirits")
  })

  // Guessing a bench would teach the player the wrong thing about their own
  // ingredient, which is worse than filing nothing.
  it("refuses to guess a bench for an unclassified effect", () => {
    expect(sectionFor({ kind: "herb_effect" })).toBeNull()
    expect(sectionFor({ kind: "herb_effect", effectClass: null })).toBeNull()
  })

  it("routes everything else Sam listed", () => {
    expect(sectionFor({ kind: "recipe" })).toBe("recipes")
    expect(sectionFor({ kind: "sigil" })).toBe("arcane")
    expect(sectionFor({ kind: "map" })).toBe("maps")
    expect(sectionFor({ kind: "clue" })).toBe("clues")
    expect(sectionFor({ kind: "quest" })).toBe("quests")
    expect(sectionFor({ kind: "song" })).toBe("songs")
    expect(sectionFor({ kind: "lore" })).toBe("lore")
    expect(sectionFor({ kind: "witness" })).toBe("witness")
    expect(sectionFor({ kind: "autopsy" })).toBe("autopsy")
  })
})

// ---------------------------------------------------------------------------
// §3 The consent window
// ---------------------------------------------------------------------------

describe("the consent window", () => {
  it("holds maps until before sleep and everything else to the moment", () => {
    expect(windowFor("maps")).toBe("before_sleep")
    expect(windowFor("recipes")).toBe("immediate")
    expect(windowFor("alchemy")).toBe("immediate")
  })

  it("asks before writing", () => {
    const r = offerFor({ characterId: FIFI, discovery: { kind: "recipe" }, body: "Two bluecap, one zurkhwood." })
    expect(r.autoFiled).toBe(false)
    expect(r.offer?.state).toBe("pending")
    expect(r.offer?.section).toBe("recipes")
  })

  // Accepting the quest was the consent; asking again is a second door on the
  // same room.
  it("files a quest with no prompt at all", () => {
    const r = offerFor({ characterId: FIFI, discovery: { kind: "quest" }, body: "Find Sarith's brother." })
    expect(r.autoFiled).toBe(true)
    expect(r.offer?.state).toBe("accepted")
    expect(AUTO_FILED.has("quests")).toBe(true)
    expect(needsConsent("quests")).toBe(false)
  })

  it("writes nothing for an unclassified herb effect, and says why", () => {
    const r = offerFor({ characterId: FIFI, discovery: { kind: "herb_effect" }, body: "It tasted of iron." })
    expect(r.offer).toBeNull()
    expect(r.note).toContain("guessed bench")
  })

  it("writes nothing for an empty body", () => {
    expect(offerFor({ characterId: FIFI, discovery: { kind: "clue" }, body: "   " }).offer).toBeNull()
  })

  it("lets a map offer die at the fire, not before it", () => {
    const pending: JournalOffer[] = [
      { characterId: FIFI, section: "maps", window: "before_sleep", body: "m", title: null, tags: null, state: "pending" },
      { characterId: FIFI, section: "clues", window: "immediate", body: "c", title: null, tags: null, state: "pending" },
    ]
    const afterScene = expireOffers(pending, "scene_end")
    expect(afterScene[0].state).toBe("pending")
    expect(afterScene[1].state).toBe("expired")

    const afterRest = expireOffers(pending, "long_rest")
    expect(afterRest[0].state).toBe("expired")
    expect(afterRest[1].state).toBe("pending")
  })

  it("never re-opens an offer already settled", () => {
    const settled: JournalOffer[] = [
      { characterId: FIFI, section: "maps", window: "before_sleep", body: "m", title: null, tags: null, state: "declined" },
    ]
    expect(expireOffers(settled, "long_rest")[0].state).toBe("declined")
  })
})

// ---------------------------------------------------------------------------
// §4 Gates
// ---------------------------------------------------------------------------

describe("gates", () => {
  it("keeps Lore to bards", () => {
    expect(checkGate("lore", bard).allowed).toBe(true)
    expect(checkGate("lore", rogue).allowed).toBe(false)
  })

  // Sam: transcribed if you have musical proficiency, "or added into your
  // journal (if you do not)". So it downgrades; it never refuses.
  it("still writes a song without an instrument, as a plainer note", () => {
    const withLute = checkGate("songs", bard)
    expect(withLute.allowed).toBe(true)
    expect(withLute.degraded).toBe(false)

    const without = checkGate("songs", rogue)
    expect(without.allowed).toBe(true)
    expect(without.degraded).toBe(true)
    expect(without.note).toContain("unlocks no performance")
  })

  it("requires Medicine to cut", () => {
    expect(checkGate("autopsy", cleric).allowed).toBe(true)
    expect(checkGate("autopsy", rogue).allowed).toBe(false)
  })

  // The alchemy spec's ruling, kept: divine is not arcane.
  it("keeps clerics out of the Arcane section", () => {
    expect(checkGate("arcane", wizard).allowed).toBe(true)
    expect(checkGate("arcane", cleric).allowed).toBe(false)
    expect(checkGate("arcane", cleric).note).toContain("Divine is not arcane")
  })

  it("lets an Arcana-proficient non-caster read the marks", () => {
    expect(checkGate("arcane", { class: "Rogue", skills: { arcana: true } }).allowed).toBe(true)
  })

  it("gates nothing that Sam did not gate", () => {
    for (const s of ["pages", "recipes", "maps", "clues", "quests", "witness"] as const) {
      expect(checkGate(s, rogue).allowed).toBe(true)
    }
  })

  it("reads proficiency however the sheet spells it", () => {
    expect(hasSkill({ skills: { Medicine: true } }, "medicine")).toBe(true)
    expect(hasSkill({ skills: { medicine: "proficient" } }, "medicine")).toBe(true)
    expect(hasSkill({ skills: { medicine: "none" } }, "medicine")).toBe(false)
    expect(hasSkill({ skills: {} }, "medicine")).toBe(false)
    expect(hasSkill({}, "medicine")).toBe(false)
  })

  it("spots an instrument inside a longer tool name", () => {
    expect(hasInstrument({ tools: ["Lute"] })).toBe(true)
    expect(hasInstrument({ tools: ["Pan Flute"] })).toBe(true)
    expect(hasInstrument({ tools: ["Thieves' Tools"] })).toBe(false)
    expect(hasInstrument({})).toBe(false)
  })

  it("refuses the offer outright when the gate refuses", () => {
    const r = offerFor({ characterId: FIFI, discovery: { kind: "lore" }, body: "A story.", sheet: rogue })
    expect(r.offer).toBeNull()
    expect(r.note).toContain("bard")
  })
})

// ---------------------------------------------------------------------------
// §5 Autopsy
// ---------------------------------------------------------------------------

describe("autopsy", () => {
  it("scales the DC with CR and floors it", () => {
    expect(autopsyDc(0)).toBe(AUTOPSY_DC_BASE)
    expect(autopsyDc(null)).toBe(AUTOPSY_DC_BASE)
    expect(autopsyDc(2)).toBe(12)
    expect(autopsyDc(0.5)).toBe(11)
  })

  it("refuses without Medicine", () => {
    const r = autopsy({ sheet: rogue, creature: "Drow Elite", cr: 2, available: ["vulnerable to radiant"], total: 25 })
    expect(r.ok).toBe(false)
    expect(r.note).toContain("Medicine")
  })

  it("reveals one on a success", () => {
    const r = autopsy({ sheet: cleric, creature: "Quaggoth", cr: 2, available: ["resistant to poison", "immune to charm"], total: 12 })
    expect(r.ok).toBe(true)
    expect(r.revealed).toEqual(["resistant to poison"])
  })

  it("reveals two when they beat it by five", () => {
    const r = autopsy({ sheet: cleric, creature: "Quaggoth", cr: 2, available: ["resistant to poison", "immune to charm"], total: 17 })
    expect(r.revealed).toHaveLength(2)
  })

  it("spends the corpse on a failure", () => {
    const r = autopsy({ sheet: cleric, creature: "Quaggoth", cr: 2, available: ["resistant to poison"], total: 8 })
    expect(r.ok).toBe(false)
    expect(r.note).toContain("corpse is spent")
  })

  // The rule that is not homebrew: reveal, never invent.
  it("cannot sell knowledge they already wrote down", () => {
    const r = autopsy({
      sheet: cleric,
      creature: "Quaggoth",
      cr: 2,
      available: ["resistant to poison"],
      known: ["Resistant to Poison"],
      total: 25,
    })
    expect(r.ok).toBe(false)
    expect(r.note).toContain("nothing left")
  })

  it("invents nothing when the row is empty", () => {
    const r = autopsy({ sheet: cleric, creature: "Stirge", cr: 0, available: [], total: 30 })
    expect(r.revealed).toEqual([])
    expect(r.ok).toBe(false)
  })

  // Sam approved DC 10 + CR on 2026-09-29, so it stops being a caveat.
  it("no longer flags its own DC, because it is now a ruling", () => {
    const r = autopsy({ sheet: cleric, creature: "Quaggoth", cr: 1, available: ["x"], total: 20 })
    expect(r.flags).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// §6 Unlocks and sharing
// ---------------------------------------------------------------------------

describe("what an entry unlocks", () => {
  it("maps each knowledge section to its unlock", () => {
    expect(unlockFor("recipes")).toBe("recipe")
    expect(unlockFor("alchemy")).toBe("effect")
    expect(unlockFor("poisoner")).toBe("effect")
    expect(unlockFor("arcane")).toBe("rune")
    expect(unlockFor("autopsy")).toBe("weakness")
    expect(unlockFor("pages")).toBeNull()
    expect(unlockFor("witness")).toBeNull()
  })

  it("grants nothing from a page nobody has read", () => {
    const r = shareWith({ section: "recipes", visibility: "private", reader: rogue })
    expect(r.learns).toBe(false)
    expect(r.note).toContain("nobody has read")
  })

  it("teaches a recipe to whoever is shown it", () => {
    const r = shareWith({ section: "recipes", visibility: "party", reader: rogue })
    expect(r.learns).toBe(true)
    expect(r.unlock).toBe("recipe")
  })

  // The gate is checked at READING, not at writing.
  it("lets a non-caster read a rune page without learning it", () => {
    const r = shareWith({ section: "arcane", visibility: "party", reader: rogue })
    expect(r.learns).toBe(false)
    expect(r.note).toContain("read it, but not use it")
  })

  it("gives a thief what they can use", () => {
    const r = shareWith({ section: "recipes", visibility: "found", reader: wizard })
    expect(r.learns).toBe(true)
    expect(r.note).toContain("taken and used")
  })

  it("carries no unlock from a section that has none", () => {
    const r = shareWith({ section: "witness", visibility: "found", reader: wizard })
    expect(r.learns).toBe(false)
    expect(r.note).toContain("worth reading, not learning")
  })
})

describe("an NPC who read the book", () => {
  it("keys what it learned by name, per the Jimjar rule", () => {
    const r = npcReads({ npcName: "Ilvara Mizzrym", pages: [{ section: "recipes", body: "Two bluecap." }] })
    expect(r.learned[0].npc_name).toBe("Ilvara Mizzrym")
    expect(r.learned[0].kind).toBe("recipe")
  })

  it("treats an unlockless page as a page, not as nothing", () => {
    const r = npcReads({ npcName: "Jimjar", pages: [{ section: "witness", body: "The nightmare again." }] })
    expect(r.learned[0].kind).toBe("journal_page")
  })

  it("says plainly that nothing persists yet", () => {
    const r = npcReads({ npcName: "Ilvara Mizzrym", pages: [{ section: "clues", body: "x" }] })
    expect(r.flags.join(" ")).toContain("npc_knowledge table does not exist")
  })

  it("flags nothing when there was nothing to read", () => {
    expect(npcReads({ npcName: "Ilvara Mizzrym", pages: [] }).flags).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// §7 Bard lore
// ---------------------------------------------------------------------------

describe("telling a story from the book", () => {
  it("lifts the band by one when the story is written down", () => {
    expect(tellFromLore("flat", true).band).toBe("warm")
    expect(tellFromLore("warm", true).band).toBe("moving")
  })

  it("cannot lift past the top", () => {
    expect(tellFromLore("moving", true).band).toBe("moving")
  })

  it("leaves a story told from memory to the dice", () => {
    const r = tellFromLore("flat", false)
    expect(r.band).toBe("flat")
    expect(r.flags).toEqual([])
  })

  it("flags the lift as homebrew", () => {
    expect(tellFromLore("flat", true).flags.join(" ")).toContain("needs Sam's yes")
  })
})
