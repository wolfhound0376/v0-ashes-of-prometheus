import { describe, expect, it } from "vitest"
import { abilityShort, formatHealLine, HealPairing, healAmount, healDetail, PAIR_WINDOW_MS, parseHealLine, spellcastingMod } from "./heal-line"

describe("spellcastingMod", () => {
  it("is the spell attack bonus minus proficiency", () => {
    // Samson: WIS 16 (+3), proficiency 2, attack +5.
    expect(spellcastingMod(5, 2)).toBe(3)
    // Scott: CHA 15 (+2), proficiency 2, attack +4.
    expect(spellcastingMod(4, 2)).toBe(2)
  })

  it("is unknown rather than guessed when the sheet lacks a number", () => {
    expect(spellcastingMod(undefined, 2)).toBeNull()
    expect(spellcastingMod(5, null)).toBeNull()
  })
})

describe("healAmount", () => {
  it("adds the modifier to the dice — the rule the route was missing", () => {
    // The two live heals of 26 Sep 2026, as they should have landed.
    expect(healAmount("1d4", 1, 2, "Charisma").total).toBe(3)
    expect(healAmount("1d4", 3, 3, "Wisdom").total).toBe(6)
  })

  it("never heals below zero on a negative modifier", () => {
    expect(healAmount("1d4", 1, -2, "Wisdom").total).toBe(0)
  })

  it("adds nothing when the modifier is unknown", () => {
    const r = healAmount("1d8", 5, null, "Wisdom")
    expect(r.total).toBe(5)
    expect(r.ability).toBe("")
  })
})

describe("healDetail", () => {
  it("shows the roll and the modifier with its ability", () => {
    expect(healDetail({ rolled: 2, mod: 3, ability: "WIS" })).toBe("2 + 3 WIS")
    expect(healDetail({ rolled: 2, mod: -1, ability: "CHA" })).toBe("2 − 1 CHA")
    expect(healDetail({ rolled: 6, mod: 0, ability: "" })).toBe("6")
  })
})

describe("the heal line round-trips", () => {
  it("writes a readable line and reads the same breakdown back", () => {
    const r = healAmount("1d4", 2, 3, "Wisdom")
    const line = formatHealLine("Samson", "Healing Word", "Eldeth Feldrun", r)
    expect(line).toBe("Samson casts Healing Word on Eldeth Feldrun — 1d4 (2) + 3 WIS = 5 hit points.")
    expect(parseHealLine(line)).toEqual({ target: "Eldeth Feldrun", total: 5, detail: "2 + 3 WIS" })
  })

  it("handles a negative modifier and no modifier", () => {
    const neg = formatHealLine("A", "Cure Wounds", "B", healAmount("1d8", 4, -1, "Charisma"))
    expect(parseHealLine(neg)).toEqual({ target: "B", total: 3, detail: "4 − 1 CHA" })
    const none = formatHealLine("A", "Cure Wounds", "B", healAmount("1d8", 4, null, null))
    expect(parseHealLine(none)).toEqual({ target: "B", total: 4, detail: "4" })
  })

  it("ignores every other kind of line", () => {
    expect(parseHealLine("Scott casts Healing Word on Prince Derendil for 1.")).toBeNull()
    expect(parseHealLine("Samson casts Toll the Dead — Scott rolls 19+1 = 20 vs DC 13: saves.")).toBeNull()
    expect(parseHealLine(null)).toBeNull()
  })

  it("keeps names with spaces and punctuation", () => {
    const line = formatHealLine("Freía la Fey", "Healing Word", "Prince Derendil", healAmount("1d4", 4, 2, "Charisma"))
    expect(parseHealLine(line)?.target).toBe("Prince Derendil")
  })
})

describe("abilityShort", () => {
  it("shortens the six abilities", () => {
    expect(abilityShort("Wisdom")).toBe("WIS")
    expect(abilityShort("charisma")).toBe("CHA")
  })
})

describe("HealPairing", () => {
  const line = (target: string, rolled: number, mod: number) =>
    formatHealLine("Samson", "Healing Word", target, healAmount("1d4", rolled, mod, "Wisdom"))

  it("writes the breakdown in when the line arrives after the number (the usual order)", () => {
    const p = new HealPairing()
    let written = ""
    expect(p.onNumber("Eldeth Feldrun", 5, 1000, (d) => (written = d))).toBeUndefined()
    p.onLine(line("Eldeth Feldrun", 2, 3), 1300)
    expect(written).toBe("2 + 3 WIS")
  })

  it("draws the breakdown at once when the line arrived first", () => {
    const p = new HealPairing()
    p.onLine(line("Eldeth Feldrun", 2, 3), 1000)
    expect(p.onNumber("eldeth feldrun", 5, 1200, () => {})).toBe("2 + 3 WIS")
  })

  it("says 'at max' when the heal topped them off", () => {
    const p = new HealPairing()
    let written = ""
    p.onNumber("Eldeth Feldrun", 2, 1000, (d) => (written = d))
    p.onLine(line("Eldeth Feldrun", 2, 3), 1100)
    expect(written).toBe("2 + 3 WIS, at max")
  })

  it("does not pair across creatures or across too long a gap", () => {
    const p = new HealPairing()
    let written = ""
    p.onNumber("Scott", 5, 1000, (d) => (written = d))
    p.onLine(line("Eldeth Feldrun", 2, 3), 1100)
    expect(written).toBe("")
    p.onLine(line("Scott", 2, 3), 1000 + PAIR_WINDOW_MS + 1)
    expect(written).toBe("")
  })

  it("ignores lines that are not heals", () => {
    const p = new HealPairing()
    let written = ""
    p.onNumber("Scott", 5, 1000, (d) => (written = d))
    p.onLine("Scott casts Healing Word on Scott for 5.", 1100)
    expect(written).toBe("")
  })
})
