import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { benchProficient, maskGrid } from "./alchemy-pack"
import { EFFECT_LOOK, NEUTRAL_LOOK, bandsOf, flaskFor, glowRadiusPx, lookOf } from "./alchemy-art"

describe("maskGrid — an unknown column never leaves the server", () => {
  const grid = ["restore-health", "rot", "darksight", "sicken"] as const

  it("hides every column when nothing is known", () => {
    expect(maskGrid(grid, [])).toEqual([null, null, null, null])
  })

  it("reveals only the learned columns, 1-based", () => {
    expect(maskGrid(grid, [1, 3])).toEqual(["restore-health", null, "darksight", null])
  })

  it("does not leak an effect slug anywhere in the masked output", () => {
    const out = JSON.stringify(maskGrid(grid, [2]))
    expect(out).toContain("rot")
    for (const hidden of ["restore-health", "darksight", "sicken"]) expect(out).not.toContain(hidden)
  })
})

describe("benchProficient", () => {
  it("accepts alchemist's supplies however the apostrophe is typed", () => {
    expect(benchProficient({ tools: ["Alchemist's Supplies"] })).toBe(true)
    expect(benchProficient({ tools: ["alchemist’s supplies"] })).toBe(true)
    expect(benchProficient({ tools: ["Herbalism Kit"] })).toBe(true)
  })
  it("does not accept the poisoner's kit (Sam's ruling 4)", () => {
    expect(benchProficient({ tools: ["Poisoner's Kit"] })).toBe(false)
  })
  it("is false for a sheet with no tools", () => {
    expect(benchProficient(null)).toBe(false)
    expect(benchProficient({})).toBe(false)
  })
})

describe("effect colours", () => {
  // The vocabulary as seeded, read from the migration rather than retyped,
  // so a new effect without a colour fails here instead of rendering grey.
  const seed = readFileSync(join(__dirname, "../supabase/migrations/20260929120100_alchemy_seed.sql"), "utf8")
  const slugs = [...seed.matchAll(/\(\s*'([a-z-]+)',\s*'[^']+',\s*'(?:harmful|restorative|sensory|strange)'/g)].map((m) => m[1])

  it("finds all 22 seeded effects", () => {
    expect(slugs.length).toBe(22)
  })

  it("gives every seeded effect its own entry", () => {
    for (const s of slugs) expect(EFFECT_LOOK[s], s).toBeDefined()
  })

  it("never gives two effects the same liquid colour AND the same motion", () => {
    const seen = new Set<string>()
    for (const look of Object.values(EFFECT_LOOK)) {
      const key = `${look.liquid}|${look.motion}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it("gives every effect a distinct motion, so close hues stay readable", () => {
    const motions = Object.values(EFFECT_LOOK).map((l) => l.motion)
    expect(new Set(motions).size).toBe(motions.length)
  })

  it("falls back to neutral for an effect it has never heard of", () => {
    expect(lookOf("not-an-effect")).toBe(NEUTRAL_LOOK)
  })

  it("stacks multiple effects as bands, bottom first, never mixed", () => {
    const b = bandsOf(["restore-health", "rot"])
    expect(b.map((x) => x.effect)).toEqual(["restore-health", "rot"])
    expect(b[0]).toMatchObject({ from: 0, to: 0.5 })
    expect(b[1]).toMatchObject({ from: 0.5, to: 1 })
  })

  it("glows brighter with potency", () => {
    expect(glowRadiusPx(1)).toBeLessThan(glowRadiusPx(2))
    expect(glowRadiusPx(2)).toBeLessThan(glowRadiusPx(3))
  })

  it("picks the flask by impurity and clamps out-of-range values", () => {
    expect(flaskFor(0)).toMatch(/brewed-potion-0\.png$/)
    expect(flaskFor(3)).toMatch(/brewed-potion-3\.png$/)
    expect(flaskFor(9)).toMatch(/brewed-potion-3\.png$/)
    expect(flaskFor(-1)).toMatch(/brewed-potion-0\.png$/)
  })
})
