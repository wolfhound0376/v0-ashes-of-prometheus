import { describe, expect, it } from "vitest"
import {
  ALL_MARTIAL_IMPACTS, MARTIAL_IMPACT, MARTIAL_SCALE,
  martialArtFor, martialImpactFor,
} from "./martial-arts"

describe("martialArtFor", () => {
  it("reads the four strikes off the names a table actually writes", () => {
    expect(martialArtFor("Punch")).toBe("punch")
    expect(martialArtFor("Roundhouse Kick")).toBe("kick")
    expect(martialArtFor("Sneak Attack")).toBe("sneak")
    expect(martialArtFor("Divine Smite")).toBe("special")
  })

  it("takes the synonyms, cased however they were typed", () => {
    for (const s of ["jab", "HOOK", "uppercut", "knuckle strike", "fist"]) expect(martialArtFor(s)).toBe("punch")
    for (const s of ["knee", "stomp", "leg sweep", "shin kick"]) expect(martialArtFor(s)).toBe("kick")
    for (const s of ["backstab", "sneak-attack", "Assassinate"]) expect(martialArtFor(s)).toBe("sneak")
    for (const s of ["Stunning Strike", "flurry of blows", "Action Surge", "brutal critical"]) expect(martialArtFor(s)).toBe("special")
  })

  it("calls a bare Unarmed Strike a punch — SRD leaves the limb open, a punch is what everyone pictures", () => {
    expect(martialArtFor("Unarmed Strike")).toBe("punch")
  })

  it("puts the rogue feature ahead of the limb: a sneak attack with a kick is a sneak attack", () => {
    expect(martialArtFor("Sneak Attack (kick)")).toBe("sneak")
    expect(martialArtFor("backstab punch")).toBe("sneak")
  })

  it("leaves an ordinary weapon swing alone, so it looks as it always has", () => {
    for (const s of ["Longsword", "Rapier", "Shortbow", "Dagger", "Greataxe", "Attack"]) {
      expect(martialArtFor(s), s).toBeNull()
    }
  })

  it("does not fire on a word that merely contains a move", () => {
    // Word-bounded on both sides, so a noun that starts with a move is not one.
    // A punching bag is scenery; Kickshaw is a trinket; fisticuffs is a mood.
    expect(martialArtFor("Punching Bag Merchant")).toBeNull()
    expect(martialArtFor("Kickshaw")).toBeNull()
    expect(martialArtFor("Fisticuffs")).toBeNull()
    // But the move itself still reads when it is the word.
    expect(martialArtFor("a punch to the jaw")).toBe("punch")
  })

  it("handles nothing at all", () => {
    expect(martialArtFor(null)).toBeNull()
    expect(martialArtFor(undefined)).toBeNull()
    expect(martialArtFor("")).toBeNull()
    expect(martialArtFor("   ")).toBeNull()
  })
})

describe("martialImpactFor", () => {
  it("gives the strike's sheet", () => {
    expect(martialImpactFor("Sneak Attack")).toBe("strikeSneak")
    expect(martialImpactFor("kick")).toBe("strikeKick")
  })

  it("returns null for a weapon, so the kit keeps physicalImpact", () => {
    expect(martialImpactFor("Longsword")).toBeNull()
  })
})

describe("the table", () => {
  it("names four distinct sheets", () => {
    expect(ALL_MARTIAL_IMPACTS).toHaveLength(4)
    expect(new Set(ALL_MARTIAL_IMPACTS).size).toBe(4)
  })

  it("scales every strike, and a sneak attack hits hardest of the unarmed set", () => {
    for (const art of Object.keys(MARTIAL_IMPACT) as Array<keyof typeof MARTIAL_IMPACT>) {
      expect(MARTIAL_SCALE[art]).toBeGreaterThan(0)
    }
    expect(MARTIAL_SCALE.sneak).toBeGreaterThan(MARTIAL_SCALE.punch)
    expect(MARTIAL_SCALE.sneak).toBeGreaterThan(MARTIAL_SCALE.kick)
  })
})
