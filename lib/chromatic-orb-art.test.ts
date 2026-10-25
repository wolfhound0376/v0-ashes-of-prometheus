import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Sam's Chromatic Orb pack on the painted map (2026-10-25): an element picker with the orb forming in the caster's
// hand, a sound per element, and each element thrown and burst with its own art. This guards the pieces the map only
// discovers at runtime -- a missing sheet or sound fails silently there (vfxLoad/loadSfx return null).
const ELEMENTS = ["acid", "cold", "fire", "lightning", "poison", "thunder"]
const cap = (e: string) => e[0].toUpperCase() + e.slice(1)
const manifest = JSON.parse(readFileSync("public/vfx/manifest.json", "utf8"))
const page = readFileSync("public/velkynvelve-walk/index.html", "utf8")

describe("Chromatic Orb art and sound", () => {
  it("has a forming, a flight and a burst sheet for every element", () => {
    for (const e of ELEMENTS) for (const part of ["Form", "Fly", "Hit"]) {
      const m = manifest[`orb${cap(e)}${part}`]
      expect(m, `orb${cap(e)}${part}`).toBeTruthy()
      expect(existsSync(`public/vfx/${m.file}`)).toBe(true)
      expect(m.frames).toBe(({ Form: 3, Fly: 4, Hit: 9 } as Record<string, number>)[part])
    }
  })

  it("flies looping and bursts once", () => {
    for (const e of ELEMENTS) {
      expect(manifest[`orb${cap(e)}Fly`].loop).toBe(true)
      expect(manifest[`orb${cap(e)}Hit`].loop).toBeFalsy()
    }
  })

  it("ships the click and one sound per element with the app", () => {
    for (const n of ["select", ...ELEMENTS]) expect(existsSync(`public/sfx/walk/orb-${n}.mp3`), n).toBe(true)
  })

  it("throws every element as its own orb in the built map", () => {
    for (const e of ELEMENTS) {
      // the kit table is JSON (quoted keys inside), the spell-rules table is not -- match the JSON one
      const m = new RegExp(`"Chromatic Orb \\(${e}\\)": \\{\\s*"`).exec(page)
      expect(m, e).toBeTruthy()
      const entry = page.slice(m!.index, page.indexOf("}", m!.index))
      expect(entry).toContain(`"travel": "orb${cap(e)}Fly"`)
      expect(entry).toContain(`"impact": "orb${cap(e)}Hit"`)
      expect(entry).toContain(`"route": "ball"`)
    }
  })

  it("offers the picker in the built map", () => {
    expect(page).toContain(`sub === "orb"`)
    expect(page).toContain("walk:orb-select")
  })
})
