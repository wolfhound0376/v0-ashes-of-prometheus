import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { loreChecks, loreReveal, loreView, loreMod, loreRoll, loreAvg, loreIsMagic, loreRarity, LORE_HOUSE_DC } from "./item-lore.mjs"

// Lolth's Tooth as the live `items` row carries it (read 2026-10-27): Sam's homebrew, rare, cursed, arcana_dc 15,
// a three-dose venom reservoir. Trimmed to the fields the rules read.
const TOOTH = {
  slug: "lolths-tooth", name: "Lolth's Tooth", item_type: "misc", rarity: "rare", attunement: false, cursed: true, description: null,
  properties: {
    bonus: 1, damage: "1d4", damage_type: "piercing", range: "20/60", arcana_dc: 15,
    curse: "beacon to Ilvara Mizzrym while wielded; Remove Curse ends the beacon only",
    reservoir: { dc: 13, save: "CON", doses: 3, damage: "none — the venom does no damage of its own", poison: "lolths-tooth-venom",
      on_fail: "unconscious (asleep) 1 hour; wakes if it takes damage or is shaken awake" },
    spider_sense: { glow: "eerie orange, brighter the nearer the spiders", range_ft: 60 },
    weapon_properties: ["finesse", "light", "thrown"],
  },
}
const DAGGER = { slug: "dagger", name: "Dagger", item_type: "weapon", rarity: "common", description: "A simple steel dagger.",
  properties: { damage: "1d4", damage_type: "piercing", weapon_properties: ["finesse", "light", "thrown"] } }
const HERB = { slug: "x", name: "Some root", item_type: "consumable", rarity: "common", alchemy_effects: ["sicken", "long-march"], properties: {} }

// Fifi and Kenta as lib/walk-sheet.ts builds them from their rows (2026-10-27): Fifi INT +1, Investigation proficient,
// Alchemist's Supplies; Kenta INT -1, nothing.
const FIFI = { lore: { investigation: { mod: 3, level: "proficient" }, arcana: { mod: 1, level: "" }, religion: { mod: 1, level: "" }, nature: { mod: 1, level: "" } },
  tools: { alchemist: 3, poisoner: null, herbalism: null } }
const KENTA = { lore: { investigation: { mod: -1, level: "" }, arcana: { mod: -1, level: "" }, religion: { mod: -1, level: "" }, nature: { mod: -1, level: "" } },
  tools: { alchemist: null, poisoner: null, herbalism: null } }

const keys = (cs: any[]) => cs.map((c) => c.key)

describe("which checks a piece of loot offers", () => {
  it("a plain dagger offers nothing: there is nothing to find", () => {
    expect(loreChecks(DAGGER, {})).toEqual([])
    expect(loreIsMagic(DAGGER)).toBe(false)
  })
  it("Lolth's Tooth: examine and arcana at first; the residue only once the reservoir is found", () => {
    expect(keys(loreChecks(TOOTH, {}))).toEqual(["examine", "arcana"])
    expect(keys(loreChecks(TOOTH, { f: { examine: true } }))).toEqual(["examine", "arcana", "residue"])
  })
  it("the item's own Arcana DC wins over the house number, and says so", () => {
    const a = loreChecks(TOOTH, {}).find((c) => c.key === "arcana")!
    expect(a.dc).toBe(15); expect(a.house).toBe(false)
    const plain = loreChecks({ ...TOOTH, properties: { bonus: 1 } }, {}).find((c) => c.key === "arcana")!
    expect(plain.dc).toBe(LORE_HOUSE_DC.arcana.rare); expect(plain.house).toBe(true)
  })
  it("an ingredient offers working out its use", () => {
    expect(keys(loreChecks(HERB, {}))).toEqual(["ingredient"])
  })
  it("rarity is read however the row spells it", () => {
    expect(loreRarity({ rarity: "Very Rare" })).toBe("very_rare")
    expect(loreRarity({ rarity: "nonsense" })).toBe("common")
  })
})

describe("what a check reveals", () => {
  it("every line comes from the row", () => {
    expect(loreReveal(TOOTH, "examine")).toEqual(["A hidden reservoir in it holds 3 doses."])
    expect(loreReveal(TOOTH, "arcana")).toEqual(["It is magic.", "+1 to attack and damage rolls."])
    expect(loreReveal(TOOTH, "residue")[0]).toContain("DC 13 Constitution save")
    expect(loreReveal(HERB, "ingredient")).toEqual(["Used for: sicken, long march."])
  })
  it("the curse and the spider sense are never revealed, by any check or by study", () => {
    const all = [...["examine", "arcana", "residue", "deity", "ingredient"].flatMap((k) => loreReveal(TOOTH, k)), ...loreView(TOOTH, { s: true }).facts].join(" ")
    expect(all).not.toMatch(/beacon|Ilvara|curse|spider|orange/i)
  })
})

describe("identified or not", () => {
  it("a magic item is unidentified until studied; its bonus hides until Arcana finds it", () => {
    expect(loreView(TOOTH, {}).identified).toBe(false)
    expect(loreView(TOOTH, {}).bonusKnown).toBe(false)
    expect(loreView(TOOTH, { f: { arcana: true } }).bonusKnown).toBe(true)
    expect(loreView(TOOTH, { s: true }).identified).toBe(true)
  })
  it("studying reveals everything the checks would", () => {
    expect(loreView(TOOTH, { s: true }).facts).toContain("A hidden reservoir in it holds 3 doses.")
  })
  it("a mundane item is identified from the start and keeps its description", () => {
    const v = loreView(DAGGER, {})
    expect(v.identified).toBe(true); expect(v.description).toBe("A simple steel dagger.")
  })
})

describe("whose bonus", () => {
  it("a skill check reads the sheet's lore entry, with its proficiency", () => {
    expect(loreMod(FIFI, { skill: "investigation" })).toEqual({ mod: 3, level: "Proficient" })
    expect(loreMod(KENTA, { skill: "arcana" })).toEqual({ mod: -1, level: "" })
  })
  it("a tool check needs the tool: Fifi has it, Kenta does not", () => {
    const residue = loreChecks(TOOTH, { f: { examine: true } }).find((c) => c.key === "residue")
    expect(loreMod(FIFI, residue)).toEqual({ mod: 3, level: "Tool" })
    expect(loreMod(KENTA, residue)).toBeNull()
  })
  it("a tool check with a skill to fall back on uses the skill", () => {
    const use = loreChecks(HERB, {})[0]
    expect(loreMod(KENTA, use)).toEqual({ mod: -1, level: "" })
  })
})

describe("rolls and numbers", () => {
  it("meets-it-beats-it", () => {
    expect(loreRoll(12, 3, 15).ok).toBe(true)
    expect(loreRoll(11, 3, 15)).toEqual({ d: 11, mod: 3, total: 14, ok: false })
  })
  it("averages damage dice", () => {
    expect(loreAvg("1d4+1")).toBe(3.5); expect(loreAvg("2d6")).toBe(7); expect(loreAvg("1")).toBe(1); expect(loreAvg("1d6-1")).toBe(2.5)
  })
})

describe("one copy", () => {
  it("the walk pastes this file at its placeholder", () => {
    const t = readFileSync("scripts/velkynvelve-walk/template.html", "utf8")
    const b = readFileSync("scripts/velkynvelve-walk/build_walk.py", "utf8")
    expect(t).toContain("/*__ITEM_LORE__*/")
    expect(b).toContain("item-lore.mjs")
  })
})
