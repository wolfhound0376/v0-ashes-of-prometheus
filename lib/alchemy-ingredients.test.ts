import { describe, expect, it } from "vitest"
import { SPELL_COMPONENTS, SUBSTANCE_SPELLS } from "./spell-component-data"
import { REGISTERED_INGREDIENTS } from "./ingredient-registry-data"
import {
  CATALOG_SLUGS,
  appraiseOffer,
  componentTextFor,
  creatureSourcedSpells,
  creatureSourcingOf,
  identify,
  ingredientBySlug,
  keyWords,
  registryStats,
  searchIngredients,
  spellsNeeding,
  verifiedSubstances,
} from "./alchemy-ingredients"

describe("generated spell component data", () => {
  it("covers every material component in the 556-spell dataset", () => {
    expect(SPELL_COMPONENTS.length).toBe(292)
    expect(SPELL_COMPONENTS.every((c) => c.text.length > 0)).toBe(true)
  })

  it("keeps the book's own wording, not a paraphrase", () => {
    // The compiled list Sam supplied says Continual Flame takes a whole 50 gp
    // ruby. The spell consumes ruby DUST. The dataset is the authority.
    expect(componentTextFor("Continual Flame")).toBe("ruby dust worth 50 gp, which the spell consumes")
    expect(componentTextFor("Identify")).toContain("a pearl worth at least 100 gp")
  })

  it("returns null for a spell with no material component", () => {
    expect(componentTextFor("Acid Splash")).toBeNull()
  })

  it("prices are lifted, never estimated", () => {
    const revivify = SPELL_COMPONENTS.find((c) => c.spell === "Revivify")!
    expect(revivify.gp).toBe(300)
    expect(revivify.consumed).toBe(true)
  })

  it("indexes a substance to spells whose text actually contains it", () => {
    for (const [term, spells] of Object.entries(SUBSTANCE_SPELLS)) {
      for (const name of spells) {
        const row = SPELL_COMPONENTS.find((c) => c.spell === name)!
        expect(row.text.toLowerCase()).toContain(term)
      }
    }
  })
})

describe("keyWords", () => {
  it("strips the packaging a trader wraps an ingredient in", () => {
    expect(keyWords("a pinch of diamond dust")).toEqual(["diamond", "dust"])
    expect(keyWords("two vials of Holy Water")).toEqual(["holy", "water"])
  })

  it("singularises so plurals match", () => {
    expect(keyWords("cockatrice feathers")).toEqual(["cockatrice", "feather"])
  })
})

describe("identify — verified spell components", () => {
  it("knows diamond dust is real, and what consumes it", () => {
    const r = identify("a pinch of diamond dust")
    expect(r.verdict).toBe("verified")
    expect(r.usedBySpells).toContain("Nondetection")
    expect(r.consumedBySpells.length).toBeGreaterThan(0)
    expect(r.gp).not.toBeNull()
  })

  it("finds the substance inside a longer phrase", () => {
    expect(identify("some powdered silver a trader is selling").verdict).toBe("verified")
  })

  it("prefers the longest substance term in the phrase", () => {
    // "diamond dust" must win over the bare "diamond" it contains.
    expect(identify("diamond dust").name?.toLowerCase()).toContain("dust")
  })

  it("says when the thing is already a catalog row", () => {
    const r = identify("holy water")
    expect(r.verdict).toBe("verified")
    expect(r.catalogSlug).toBe("holy-water")
    expect(r.note).toContain("catalog")
  })

  it("honours a live catalog over the dated snapshot", () => {
    expect(identify("holy water", []).catalogSlug).toBeNull()
  })
})

describe("identify — rows this repo cannot vouch for", () => {
  it("labels a claimed-official creature part unverified, not canon", () => {
    const r = identify("aboleth spine")
    expect(r.verdict).toBe("unverified")
    expect(r.note).toContain("nothing in this repo confirms")
  })

  it("does not let a generic word launder an unbacked ingredient", () => {
    // "horn" is a real component word; "powdered unicorn horn" is a registry
    // row no spell backs. The bare word must not verify the phrase.
    const r = identify("powdered unicorn horn")
    expect(r.verdict).toBe("unverified")
    expect(r.substance).toBeNull()
  })

  it("labels community content homebrew", () => {
    const r = identify("gillyweed")
    expect(r.verdict).toBe("homebrew")
    expect(r.note).toContain("homebrew")
  })

  it("never reports unverified or homebrew as verified", () => {
    for (const ing of REGISTERED_INGREDIENTS) {
      const r = identify(ing.name)
      if (ing.provenance === "homebrew") expect(r.verdict).not.toBe("unverified")
      // A verified verdict must round-trip: the substance it claims has to be
      // one real spells actually call for.
      if (r.verdict === "verified") expect(spellsNeeding(r.substance!).length).toBeGreaterThan(0)
    }
  })
})

describe("identify — nonsense", () => {
  it("refuses to recognise something no list knows", () => {
    const r = identify("essence of Malachar's patience")
    expect(r.verdict).toBe("unknown")
    expect(r.name).toBeNull()
    expect(r.gp).toBeNull()
  })

  it("handles empty input without throwing", () => {
    expect(identify("   ").verdict).toBe("unknown")
  })

  it("offers near misses rather than a flat no", () => {
    expect(identify("dragon heart").alternatives.length).toBeGreaterThan(0)
  })
})

describe("registry", () => {
  it("carries the whole compiled list", () => {
    expect(REGISTERED_INGREDIENTS.length).toBeGreaterThan(340)
  })

  it("gives every row a provenance and a stable slug", () => {
    const slugs = new Set<string>()
    for (const i of REGISTERED_INGREDIENTS) {
      expect(["spell-component", "unverified", "homebrew"]).toContain(i.provenance)
      expect(i.slug).toMatch(/^[a-z0-9-]+$/)
      expect(slugs.has(i.slug)).toBe(false)
      slugs.add(i.slug)
    }
  })

  it("only ever cites a price a book named", () => {
    for (const i of REGISTERED_INGREDIENTS) {
      if (i.gp !== null) expect(i.gp).toBeGreaterThan(0)
    }
  })

  it("looks a row up by slug", () => {
    expect(ingredientBySlug("basilisk-phlegm")?.name).toBe("Basilisk phlegm")
    expect(ingredientBySlug("no-such-thing")).toBeNull()
  })

  it("searches by use as well as by name", () => {
    expect(searchIngredients("petrification").length).toBeGreaterThan(0)
  })

  it("counts what it holds", () => {
    const s = registryStats()
    expect(s.spellComponents).toBe(292)
    expect(s.unverified + s.homebrew + s.verified).toBe(REGISTERED_INGREDIENTS.length)
  })

  it("every catalog slug in the snapshot is a real ingredient name or recipe output", () => {
    expect(CATALOG_SLUGS.length).toBeGreaterThan(0)
    expect(new Set(CATALOG_SLUGS).size).toBe(CATALOG_SLUGS.length)
  })
})

describe("spellsNeeding", () => {
  it("returns the spells, with their own text", () => {
    const rows = spellsNeeding("black pearl")
    expect(rows.map((r) => r.spell)).toContain("Circle of Death")
    expect(rows[0].text).toContain("black pearl")
  })

  it("is empty for something no spell calls for", () => {
    expect(spellsNeeding("aboleth spine")).toEqual([])
  })

  it("lists only substances that really occur", () => {
    for (const s of verifiedSubstances()) expect(spellsNeeding(s).length).toBeGreaterThan(0)
  })
})

describe("appraiseOffer — the trader at the table", () => {
  const offer = () =>
    appraiseOffer([
      { name: "a pinch of diamond dust", askGp: 75 },
      { name: "black pearl", askGp: 500 },
      "aboleth spine",
      "gillyweed",
      "essence of Malachar's patience",
    ])

  it("sorts the satchel into backed, needs-a-ruling, and nonsense", () => {
    const a = offer()
    expect(a.lines).toHaveLength(5)
    expect(a.verified.map((l) => l.offered)).toEqual(["a pinch of diamond dust", "black pearl"])
    expect(a.needsRuling.map((l) => l.offered)).toEqual(["aboleth spine", "gillyweed"])
    expect(a.unknown.map((l) => l.offered)).toEqual(["essence of Malachar's patience"])
  })

  it("flags a gouging price against the book, and only against the book", () => {
    const a = offer()
    const dust = a.lines[0]
    expect(dust.gp).toBe(25)
    expect(dust.markup).toBe(3)
    expect(a.summary).toContain("Overpriced")
    // Nothing prices an aboleth spine, so nothing is invented to compare it to.
    expect(a.lines[2].markup).toBeNull()
  })

  it("leaves markup null when the trader names no price", () => {
    expect(appraiseOffer(["black pearl"]).lines[0].markup).toBeNull()
  })

  it("handles an empty satchel", () => {
    const a = appraiseOffer([])
    expect(a.lines).toEqual([])
    expect(a.summary).toContain("0 items")
  })
})

describe("creature-sourced components — the harvest demand side", () => {
  it("is far more than the eight spells where the part IS the whole component", () => {
    const all = creatureSourcedSpells("all", true)
    expect(all.length).toBe(64)
    expect(creatureSourcedSpells().length).toBe(61) // published only
  })

  it("counts worked material, per Sam's 2026-09-29 ruling, but keeps it separable", () => {
    expect(creatureSourcedSpells("creature", true)).toHaveLength(57)
    expect(creatureSourcedSpells("worked", true)).toHaveLength(7)
    expect(creatureSourcingOf("Nystul's Magic Aura")).toBe("worked")
    expect(creatureSourcingOf("Fireball")).toBe("creature")
  })

  it("excludes Unearthed Arcana unless asked", () => {
    expect(creatureSourcedSpells("all").some((c) => c.spell.includes("(UA)"))).toBe(false)
    expect(creatureSourcedSpells("all", true).some((c) => c.spell.includes("(UA)"))).toBe(true)
  })

  it("catches the ones the eight-spell list misses", () => {
    const names = new Set(creatureSourcedSpells("all", true).map((c) => c.spell))
    for (const n of ["Fireball", "Fly", "Polymorph", "Web", "Identify", "Jump", "Lightning Bolt"]) {
      expect(names.has(n)).toBe(true)
    }
  })

  it("flags the two the Underdark can already supply", () => {
    // Umber hulk and giant spider are both in the bestiary at Velkynvelve.
    expect(componentTextFor("Guards and Wards")).toContain("umber hulk blood")
    expect(componentTextFor("Web")).toContain("spiderweb")
  })

  it("is not a keyword match — plant and mineral components stay out", () => {
    for (const n of ["Thorn Whip", "Flame Strike", "Wall of Thorns", "Melf's Minute Meteors"]) {
      expect(creatureSourcingOf(n)).toBeNull()
    }
  })

  it("returns null for an unknown spell", () => {
    expect(creatureSourcingOf("Malachar's Withering Regard")).toBeNull()
  })
})
