import { describe, expect, it } from "vitest"
import {
  ALL_MARTIAL_IMPACTS, MARTIAL_DIRECTIONAL, MARTIAL_IMPACT, MARTIAL_SCALE,
  martialArtFor, martialImpactFor, strikeFacesLeft,
} from "./martial-arts"

describe("martialArtFor", () => {
  it("reads the four strikes off the names a table actually writes", () => {
    expect(martialArtFor("Punch")).toBe("punch")
    expect(martialArtFor("Roundhouse Kick")).toBe("kick")
    expect(martialArtFor("Sneak Attack")).toBe("sneak")
    expect(martialArtFor("Divine Smite")).toBe("special")
  })

  it("takes the synonyms, cased however they were typed", () => {
    for (const s of ["jab", "HOOK", "knuckle strike", "fist"]) expect(martialArtFor(s)).toBe("punch")
    for (const s of ["knee", "stomp", "shin kick"]) expect(martialArtFor(s)).toBe("kick")
    for (const s of ["backstab", "sneak-attack", "Assassinate"]) expect(martialArtFor(s)).toBe("sneak")
    for (const s of ["flurry of blows", "Action Surge", "brutal critical"]) expect(martialArtFor(s)).toBe("special")
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
  it("names six distinct sheets", () => {
    expect(ALL_MARTIAL_IMPACTS).toHaveLength(6)
    expect(new Set(ALL_MARTIAL_IMPACTS).size).toBe(6)
  })

  it("scales every strike, and a sneak attack hits hardest of the unarmed set", () => {
    for (const art of Object.keys(MARTIAL_IMPACT) as Array<keyof typeof MARTIAL_IMPACT>) {
      expect(MARTIAL_SCALE[art]).toBeGreaterThan(0)
    }
    expect(MARTIAL_SCALE.sneak).toBeGreaterThan(MARTIAL_SCALE.punch)
    expect(MARTIAL_SCALE.sneak).toBeGreaterThan(MARTIAL_SCALE.kick)
  })
})

describe("the uppercut and the sweep (Sam's art, 2026-10-22)", () => {
  it("gives the launchers the uppercut arc", () => {
    for (const s of ["Uppercut", "rising uppercut", "Stunning Strike", "stunning-strike", "Launcher"]) {
      expect(martialArtFor(s), s).toBe("uppercut")
    }
    expect(martialImpactFor("Stunning Strike")).toBe("strikeUppercut")
  })

  it("gives the moves that floor someone the sweep arc", () => {
    for (const s of ["Sweep", "leg sweep", "Trip", "Tripping Attack", "Shove (prone)", "shove to knock prone", "knock prone with a shove"]) {
      expect(martialArtFor(s), s).toBe("sweep")
    }
    expect(martialImpactFor("leg sweep")).toBe("strikeSweep")
  })

  it("leaves a bare shove alone: SRD 5.1 lets it push instead, and a push is no strike", () => {
    expect(martialArtFor("Shove")).toBeNull()
    expect(martialArtFor("shove away")).toBeNull()
  })

  it("keeps the order: sneak, then the two named shapes, then specials, then limbs", () => {
    // Sneak still wins over everything.
    expect(martialArtFor("Sneak Attack uppercut")).toBe("sneak")
    expect(martialArtFor("backstab then trip")).toBe("sneak")
    // A named shape beats a special or a limb in the same name.
    expect(martialArtFor("Flurry of Blows: uppercut")).toBe("uppercut")
    expect(martialArtFor("sweep kick")).toBe("sweep")
    expect(martialArtFor("Stunning Strike punch")).toBe("uppercut")
    // Uppercut is tested before sweep.
    expect(martialArtFor("uppercut into a sweep")).toBe("uppercut")
    // And a weapon swing is still nothing.
    expect(martialArtFor("Longsword")).toBeNull()
  })

  it("scales both", () => {
    expect(MARTIAL_SCALE.uppercut).toBeGreaterThan(0)
    expect(MARTIAL_SCALE.sweep).toBeGreaterThan(0)
  })
})

describe("facing", () => {
  it("mirrors the arcs and only the arcs", () => {
    expect([...MARTIAL_DIRECTIONAL].sort()).toEqual(["special", "sweep", "uppercut"])
    for (const art of ["punch", "kick", "sneak"] as const) expect(MARTIAL_DIRECTIONAL.has(art)).toBe(false)
  })

  it("reads left and right off the camera, not the world", () => {
    // Camera right along +X: a blow toward -X goes left.
    expect(strikeFacesLeft(0, 0, -1, 0, 1, 0)).toBe(true)
    expect(strikeFacesLeft(0, 0, 1, 0, 1, 0)).toBe(false)
    // Turn the camera round and the same blow goes right.
    expect(strikeFacesLeft(0, 0, -1, 0, -1, 0)).toBe(false)
    // Camera right along +Z: only the Z offset matters.
    expect(strikeFacesLeft(5, 5, 9, 4, 0, 1)).toBe(true)
  })

  it("draws a blow straight into the screen as drawn, facing right", () => {
    expect(strikeFacesLeft(0, 0, 0, -3, 1, 0)).toBe(false)
    expect(strikeFacesLeft(2, 2, 2, 2, 1, 0)).toBe(false)
  })
})
