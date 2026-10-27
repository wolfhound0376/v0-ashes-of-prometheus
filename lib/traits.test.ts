import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { TRAITS, isHalfling, luckFiring, luckOnFaces, luckRerollCount, spliceLuck, traitsFor } from "./traits.mjs"

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
  it("lists Halfling Luck only for halflings", () => {
    expect(traitsFor(lynkes)).toEqual([TRAITS.halflingLuck.id])
    expect(traitsFor(kenta)).toEqual([])
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
