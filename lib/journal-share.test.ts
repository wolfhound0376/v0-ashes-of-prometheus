import { describe, expect, it } from "vitest"
import {
  isShareable,
  shareEntry,
  shareTargets,
  shareWarning,
  type ShareSource,
  type ShareTarget,
} from "./journal-share"
import type { GateSheet } from "./journal-sections"

const FIFI = "d00aa5b8-ced1-477d-9ec8-0861cca55498"
const KENTA = "11111111-1111-1111-1111-111111111111"

const rogue: GateSheet = { class: "Rogue", skills: { stealth: true }, tools: ["Thieves' Tools"] }
const wizard: GateSheet = { class: "Wizard", skills: { arcana: true }, arcaneCaster: true }

const kenta: ShareTarget = { kind: "character", id: KENTA, name: "Kenta", sheet: wizard }
const scott: ShareTarget = { kind: "character", id: "scott", name: "Scott", sheet: rogue }
const ilvara: ShareTarget = { kind: "npc", id: "Ilvara Mizzrym", name: "Ilvara Mizzrym" }

function entry(over: Partial<ShareSource> = {}): ShareSource {
  return {
    id: "entry-1",
    characterId: FIFI,
    section: "recipes",
    title: "Bluecap draught",
    body: "Two bluecap, one zurkhwood, steeped cold.",
    visibility: "private",
    ...over,
  }
}

describe("what can be shared", () => {
  it("shares an ordinary page", () => {
    expect(isShareable("recipes")).toBe(true)
    expect(isShareable("witness")).toBe(true)
  })

  // Not an oversight: scope already decides whose book a quest lands in.
  it("does not hand quests around, because scope already decided that", () => {
    expect(isShareable("quests")).toBe(false)
    const r = shareEntry({ entry: entry({ section: "quests" }), to: kenta })
    expect(r.ok).toBe(false)
    expect(r.note).toContain("personal one is personal")
  })

  it("refuses to share a page with its own owner", () => {
    const r = shareEntry({ entry: entry(), to: { kind: "character", id: FIFI, name: "Fifi" } })
    expect(r.ok).toBe(false)
    expect(r.note).toContain("already their own page")
  })

  it("refuses an empty page", () => {
    expect(shareEntry({ entry: entry({ body: "   " }), to: kenta }).ok).toBe(false)
  })
})

describe("sharing with another player", () => {
  it("writes a copy into their book rather than granting a right over yours", () => {
    const r = shareEntry({ entry: entry(), to: kenta, fromName: "Fifi" })
    expect(r.ok).toBe(true)
    expect(r.copy?.character_id).toBe(KENTA)
    expect(r.copy?.author).toBe("import")
    expect(r.copy?.section).toBe("recipes")
    expect(r.copy?.body).toContain("bluecap")
  })

  it("records where the copy came from", () => {
    const r = shareEntry({ entry: entry(), to: kenta, fromName: "Fifi" })
    expect(r.copy?.tags).toMatchObject({ sharedFrom: FIFI, sharedFromName: "Fifi", sourceEntry: "entry-1" })
  })

  it("keeps the copy private to its new owner, so it can be stolen from them in turn", () => {
    expect(shareEntry({ entry: entry(), to: kenta }).copy?.visibility).toBe("private")
  })

  it("moves the original outward to party", () => {
    expect(shareEntry({ entry: entry(), to: kenta }).visibility).toBe("party")
  })

  it("grants the unlock when the reader can use it", () => {
    const r = shareEntry({ entry: entry({ section: "recipes" }), to: kenta })
    expect(r.learns).toBe(true)
    expect(r.unlock).toBe("recipe")
  })

  // The rule from journal-sections, held here: the words are legible to
  // anyone, the capability is not.
  it("gives a non-caster the rune page but not the rune", () => {
    const r = shareEntry({ entry: entry({ section: "arcane" }), to: scott })
    expect(r.ok).toBe(true)
    expect(r.copy).not.toBeNull()
    expect(r.learns).toBe(false)
    expect(r.flags.join(" ")).toContain("cannot use it")
  })

  it("carries no unlock for a section that has none", () => {
    const r = shareEntry({ entry: entry({ section: "witness" }), to: kenta })
    expect(r.ok).toBe(true)
    expect(r.learns).toBe(false)
    expect(r.unlock).toBeNull()
  })

  it("does not walk a found page back to party", () => {
    expect(shareEntry({ entry: entry({ visibility: "found" }), to: kenta }).visibility).toBe("found")
  })
})

describe("sharing with an NPC", () => {
  it("writes what they learned, keyed by name", () => {
    const r = shareEntry({ entry: entry(), to: ilvara, fromName: "Fifi" })
    expect(r.npc?.npc_name).toBe("Ilvara Mizzrym")
    expect(r.npc?.kind).toBe("recipe")
    expect(r.npc?.learned_from_character).toBe(FIFI)
    expect(r.copy).toBeNull()
  })

  // Terminal, and the owner is never told — both already merged rules.
  it("burns the page to found, and says it cannot be taken back", () => {
    const r = shareEntry({ entry: entry(), to: ilvara })
    expect(r.visibility).toBe("found")
    expect(r.note).toContain("cannot be taken back")
  })

  it("says plainly that nothing acts on it yet", () => {
    expect(shareEntry({ entry: entry(), to: ilvara }).flags.join(" ")).toContain("nothing reads it yet")
  })

  it("treats an unlockless page as a page", () => {
    expect(shareEntry({ entry: entry({ section: "witness" }), to: ilvara }).npc?.kind).toBe("journal_page")
  })
})

describe("the menu", () => {
  it("lists everyone but the owner", () => {
    const t = shareTargets({ entry: { section: "recipes", characterId: FIFI }, party: [kenta, { kind: "character", id: FIFI, name: "Fifi" }] })
    expect(t.map((x) => x.name)).toEqual(["Kenta"])
  })

  it("includes NPCs who are actually in the scene", () => {
    const t = shareTargets({ entry: { section: "recipes", characterId: FIFI }, party: [kenta], present: [ilvara] })
    expect(t.map((x) => x.name)).toEqual(["Kenta", "Ilvara Mizzrym"])
  })

  // A disabled row that never explains itself is worse than no row.
  it("offers nobody for a section that cannot be shared", () => {
    expect(shareTargets({ entry: { section: "quests", characterId: FIFI }, party: [kenta] })).toEqual([])
  })

  it("warns before handing a book to an NPC, and not before handing it to a friend", () => {
    expect(shareWarning("recipes", kenta)).toBeNull()
    expect(shareWarning("recipes", ilvara)).toContain("cannot be undone")
    expect(shareWarning("recipes", ilvara)).toContain("able to use this")
    expect(shareWarning("witness", ilvara)).toContain("will remember")
  })
})
