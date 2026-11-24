import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  CONDITION_ART_FILES, attackedWithAdvantage, autoFailsSave, charmForbids, conditionArtFile, conditionKeyOf,
  conditionsForMap, critFromAdjacent, exhaustionPenalty, exhaustionSpeedCut, resistsAllDamage, speedZero, turnLostTo,
} from "./condition-rules.mjs"

// The rules asserted here are SRD 5.2.1's condition entries, quoted at the top of lib/condition-rules.mjs.

describe("names Malachar writes → the map's keys", () => {
  it("reads the presets and the 5e names, any case", () => {
    expect(conditionKeyOf("Poisoned")).toEqual({ key: "poisoned", level: 0 })
    expect(conditionKeyOf("  STUNNED ")).toEqual({ key: "stunned", level: 0 })
    expect(conditionKeyOf("Hunter's Mark")).toEqual({ key: "marked", level: 0 })
  })
  it("reads an exhaustion level, and a bare Exhaustion as level 1", () => {
    expect(conditionKeyOf("Exhaustion 2")).toEqual({ key: "exhaustion", level: 2 })
    expect(conditionKeyOf("Exhaustion (3)")).toEqual({ key: "exhaustion", level: 3 })
    expect(conditionKeyOf("Exhaustion")).toEqual({ key: "exhaustion", level: 1 })
    expect(conditionKeyOf("Exhaustion 9")).toEqual({ key: "exhaustion", level: 6 })
  })
  it("leaves narrative-only names alone", () => {
    expect(conditionKeyOf("Magical Barrier")).toBeNull()
    expect(conditionKeyOf("Acid Burn")).toBeNull()
    expect(conditionKeyOf("")).toBeNull()
  })
})

describe("the painted art", () => {
  it("every art file in the pack is on disk", () => {
    for (const f of CONDITION_ART_FILES) expect(existsSync(`public/velkynvelve-walk/icons/conditions/${f}.png`), f).toBe(true)
  })
  it("finds art by name or key, with the pack's stand-ins", () => {
    expect(conditionArtFile("Poisoned")).toBe("poisoned")
    expect(conditionArtFile("Exhaustion 2")).toBe("exhaustion")
    expect(conditionArtFile("asleep")).toBe("unconscious")
    expect(conditionArtFile("Manacled")).toBe("restrained")
    expect(conditionArtFile("Magical Barrier")).toBeNull()
  })
})

describe("saved conditions seed a fighter", () => {
  it("keeps the keys with rules and the highest exhaustion", () => {
    expect(conditionsForMap(["Poisoned", "Exhaustion 1", "Exhaustion 3", "Magical Barrier"])).toEqual({ keys: ["poisoned"], exhaustion: 3 })
  })
  it("an Unconscious creature is also Prone", () => {
    expect(conditionsForMap(["Unconscious"]).keys.sort()).toEqual(["prone", "unconscious"])
  })
  it("ignores junk", () => {
    expect(conditionsForMap(null)).toEqual({ keys: [], exhaustion: 0 })
  })
})

describe("what each condition does", () => {
  it("paralyzed, petrified, stunned and unconscious fail STR and DEX saves, never the others", () => {
    for (const k of ["paralyzed", "petrified", "stunned", "unconscious"]) {
      expect(autoFailsSave(new Set([k]), "str")).toBe(true)
      expect(autoFailsSave(new Set([k]), "dex")).toBe(true)
      expect(autoFailsSave(new Set([k]), "wis")).toBe(false)
    }
    expect(autoFailsSave(new Set(["poisoned"]), "dex")).toBe(false)
  })
  it("attacks on the stunned, unconscious and petrified have advantage", () => {
    expect(attackedWithAdvantage(new Set(["stunned"]))).toBe(true)
    expect(attackedWithAdvantage(new Set(["frightened"]))).toBe(false)
  })
  it("a hit from within 5 ft on the paralyzed or unconscious is a critical, not on the stunned", () => {
    expect(critFromAdjacent(new Set(["unconscious"]))).toBe(true)
    expect(critFromAdjacent(new Set(["stunned"]))).toBe(false)
  })
  it("speed 0 and resistance", () => {
    expect(speedZero(new Set(["petrified"]))).toBe(true)
    expect(speedZero(new Set(["stunned"]))).toBe(false)
    expect(resistsAllDamage(new Set(["petrified"]))).toBe(true)
  })
  it("who loses the turn", () => {
    expect(turnLostTo(new Set(["stunned"]))).toMatch(/stunned/)
    expect(turnLostTo(new Set(["poisoned"]))).toBeNull()
  })
  it("exhaustion: −2 per level on d20 tests, −5 ft per level", () => {
    expect([0, 1, 3, 6, 8].map(exhaustionPenalty)).toEqual([0, -2, -6, -12, -12])
    expect([0, 2, 6].map(exhaustionSpeedCut)).toEqual([0, 10, 30])
  })
  it("the charmed can't attack their charmer, and anyone else is fair game", () => {
    const ilvara = {}, jorlan = {}
    expect(charmForbids(new Set(["charmed"]), ilvara, ilvara)).toBe(true)
    expect(charmForbids(new Set(["charmed"]), ilvara, jorlan)).toBe(false)
    expect(charmForbids(new Set(["charmed"]), null, ilvara)).toBe(false)
  })
})

describe("the walk reads this file, not a copy", () => {
  it("build_walk.py pastes it in", () => {
    expect(readFileSync("scripts/velkynvelve-walk/build_walk.py", "utf8")).toContain("condition-rules.mjs")
    expect(readFileSync("scripts/velkynvelve-walk/template.html", "utf8")).toContain("/*__CONDITION_RULES__*/")
  })
})
