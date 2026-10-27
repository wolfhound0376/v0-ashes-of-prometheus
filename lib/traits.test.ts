import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  TRAITS, hasFeyAncestry, isHalfling, luckFiring, luckOnFaces, luckRerollCount, normalizeAgainst, saveEdge, sleepProof,
  spliceLuck, traitsFor, withEdge,
} from "./traits.mjs"

// SRD 5.1 Halfling, campaign_chunks 2322: "When you roll a 1 on the d20 for an attack roll, ability
// check, or saving throw, you can reroll the die and must use the new roll."

const lynkes = { name: "Lynkes", species: "Halfling" }
const kenta = { name: "Kenta of Neverwinter", species: "Half-Elf" }
const seq = (...xs: number[]) => () => { const n = xs.shift(); if (n === undefined) throw new Error("rerolled too often"); return n }

describe("who is a halfling", () => {
  it("knows every halfling subrace, from the sheet or the walk's race field", () => {
    expect(isHalfling(lynkes)).toBe(true)
    expect(isHalfling({ species: "Lightfoot Halfling" })).toBe(true)
    expect(isHalfling({ race: "stout halfling" })).toBe(true)
    expect(isHalfling(kenta)).toBe(false)
    expect(isHalfling({ species: "Half-Orc" })).toBe(false)
    expect(isHalfling(null)).toBe(false)
  })
  it("lists Luck and Brave for halflings, Fey Ancestry for elves, half-elves and drow", () => {
    expect(traitsFor(lynkes)).toEqual([TRAITS.halflingLuck.id, TRAITS.brave.id])
    expect(traitsFor(kenta)).toEqual([TRAITS.feyAncestry.id])
    expect(traitsFor({ species: "Human" })).toEqual([])
  })
})

describe("Halfling Luck on the faces", () => {
  it("rerolls a natural 1 and uses the new roll", () => {
    const r = luckOnFaces([1], seq(14), lynkes)
    expect(r.faces).toEqual([14])
    expect(r.firing?.id).toBe("halflingLuck")
    expect(r.firing?.line).toBe("Halfling Luck: Lynkes rerolls the 1 (1 → 14).")
  })
  it("does nothing on any other face", () => {
    const r = luckOnFaces([2], seq(), lynkes)
    expect(r.faces).toEqual([2])
    expect(r.firing).toBeNull()
  })
  it("never fires for someone who isn't a halfling", () => {
    const r = luckOnFaces([1], seq(), kenta)
    expect(r.faces).toEqual([1])
    expect(r.firing).toBeNull()
  })
  it("rerolls once only: a second 1 stands, and says so", () => {
    const r = luckOnFaces([1], seq(1), lynkes)
    expect(r.faces).toEqual([1])
    expect(r.firing?.line).toMatch(/The second 1 stands\./)
  })
  it("with advantage or disadvantage rerolls each die that shows a 1", () => {
    expect(luckOnFaces([1, 9], seq(17), lynkes).faces).toEqual([17, 9])
    expect(luckOnFaces([1, 1], seq(4, 12), lynkes).faces).toEqual([4, 12])
  })
})

describe("the 3D dice path", () => {
  it("counts the dice to throw and splices them back in order", () => {
    expect(luckRerollCount([1, 1], lynkes)).toBe(2)
    expect(luckRerollCount([1], kenta)).toBe(0)
    expect(spliceLuck([1, 9, 1], [5, 6])).toEqual([5, 9, 6])
    expect(luckFiring({ name: "Lynkes Underbough" }, [5, 6]).line).toBe("Halfling Luck: Lynkes rerolls the 1 (1 → 5, 1 → 6).")
  })
})

describe("one copy of the rule", () => {
  it("the Underwalk pastes this file rather than keeping its own", () => {
    const tpl = readFileSync("scripts/velkynvelve-walk/template.html", "utf8")
    expect(tpl).toContain("/*__TRAITS__*/")
    expect(tpl).not.toMatch(/function luckOnFaces\s*\(/)
  })
})

// SRD 5.1 Halfling (2322): "Brave. You have advantage on saving throws against being frightened."
// SRD 5.1 Elf (2315) / Half-Elf (2320) / drow (1608): "advantage on saving throws against being charmed,
// and magic can't put you to sleep."
describe("Brave and Fey Ancestry", () => {
  it("knows who has Fey Ancestry, and who does not", () => {
    for (const s of ["Half-Elf", "High Elf", "Wood Elf", "Dark Elf (Drow)", "drow", "elven"]) expect(hasFeyAncestry({ species: s })).toBe(true)
    for (const s of ["Human", "Halfling", "Half-Orc", "Shadar-kai", "Dwarf", "Dragonborn", ""]) expect(hasFeyAncestry({ species: s })).toBe(false)
  })
  it("reads what a save is against, in Malachar's words or the map's", () => {
    expect(normalizeAgainst("vs charmed")).toBe("charmed")
    expect(normalizeAgainst("Charm")).toBe("charmed")
    expect(normalizeAgainst("against being frightened")).toBe("frightened")
    expect(normalizeAgainst("frightened")).toBe("frightened")
    expect(normalizeAgainst("fear")).toBe("frightened")
    expect(normalizeAgainst("poisoned")).toBe(null)
    expect(normalizeAgainst(null)).toBe(null)
  })
  it("Brave gives a halfling advantage against fear, and nothing else", () => {
    const e = saveEdge(lynkes, "frightened")
    expect(e.advantage).toBe(true)
    expect(e.firing?.id).toBe("brave")
    expect(e.firing?.line).toBe("Brave: Lynkes — advantage on the save against being frightened.")
    expect(saveEdge(lynkes, "charmed").advantage).toBe(false)
    expect(saveEdge(kenta, "frightened").advantage).toBe(false)
  })
  it("Fey Ancestry gives a half-elf or a drow advantage against charm", () => {
    expect(saveEdge(kenta, "charmed").firing?.id).toBe("feyAncestry")
    expect(saveEdge({ name: "Drow guard", race: "drow" }, "vs charmed").advantage).toBe(true)
    expect(saveEdge(lynkes, "charmed").advantage).toBe(false)
  })
  it("magic can't put a fey creature to sleep", () => {
    expect(sleepProof(kenta)?.line).toBe("Fey Ancestry: Kenta — magic can't put them to sleep.")
    expect(sleepProof({ race: "drow" })?.id).toBe("feyAncestry")
    expect(sleepProof(lynkes)).toBeNull()
  })
  it("combines with the roll's own advantage and disadvantage: one of each cancels", () => {
    expect(withEdge(0, true)).toBe(1)
    expect(withEdge(-1, true)).toBe(0)
    expect(withEdge(1, true)).toBe(1)
    expect(withEdge(-1, false)).toBe(-1)
    expect(withEdge(0, false)).toBe(0)
  })
})
