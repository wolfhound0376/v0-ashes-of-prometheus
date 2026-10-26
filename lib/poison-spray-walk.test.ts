import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Kingasaur's Poison Spray on the painted map (Sam, 2026-10-25). The map only finds out at runtime that a spell is
// missing (applyForgedSheet silently drops any cantrip not in SPELLS) or that a sheet is missing (vfxLoad returns
// null), so this guards the pieces that would otherwise fail without a sound.
const manifest = JSON.parse(readFileSync("public/vfx/manifest.json", "utf8"))
const page = readFileSync("public/velkynvelve-walk/index.html", "utf8")

describe("Poison Spray on the walk", () => {
  it("is the SRD 5.2.1 cantrip: 30 ft, a ranged spell attack, 1d12 poison", () => {
    const m = /"Poison Spray":\s*\{lvl: 0, kind: "attack", range: 30, dmg: "1d12", type: "poison"/.exec(page)
    expect(m).toBeTruthy()
  })

  it("is drawn as a spray: the beam route with its own pixel sheet", () => {
    const m = /"Poison Spray": \{\s*"/.exec(page) // the kit table (JSON keys), not the rules table
    expect(m).toBeTruthy()
    const entry = page.slice(m!.index, page.indexOf("}", m!.index))
    expect(entry).toContain(`"route": "beam"`)
    expect(entry).toContain(`"travel": "pxPoisonSpray"`)
    const sheet = manifest.pxPoisonSpray
    expect(sheet).toBeTruthy()
    expect(sheet.loop).toBe(true)
    expect(existsSync(`public/vfx/${sheet.file}`)).toBe(true)
  })

  it("gives Kingasaur a cast sheet to throw it with", () => {
    const sprite = JSON.parse(readFileSync("public/sprites/kingasaur/sprite.json", "utf8"))
    expect(sprite.animations.cast).toMatchObject({ sheet: "cast.png", loop: false })
    expect(existsSync("public/sprites/kingasaur/cast.png")).toBe(true)
  })

  it("releases a spell even for a caster with no cast or attack sheet", () => {
    // before castRelease, a Forge hero baked with only idle + walk never set `once`, so the hit never fired
    expect(page).toContain("function castRelease(a, fn)")
    expect(page).not.toContain("caster.once && (caster.once.hit = () => {")
  })
})
