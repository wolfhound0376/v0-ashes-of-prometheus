import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { routeFor } from "@/components/tactical/spell-vfx-kit"

// ============================================================================
// THE ART THE KIT ASKS FOR HAS TO EXIST.
//
// A sheet name is a string in a table. Mistype one and nothing throws: the
// loader just fails, the catch swallows it, and that spell silently draws
// less than it should. Nobody finds out until someone is watching a fight.
//
// So this reads the names straight out of the source and checks each one
// against the manifest the baker writes.
// ============================================================================

const SRC = readFileSync("components/tactical/spell-vfx-kit.ts", "utf8")
const MANIFEST = JSON.parse(readFileSync("public/vfx/manifest.json", "utf8")) as
  Record<string, { frames: number; cols: number; rows: number; loop?: boolean }>

/** Every sheet name the kit names, from every field that holds one. */
function referencedSheets(): string[] {
  const names = new Set<string>()
  for (const m of SRC.matchAll(/\b(?:rune|gather|travel|impact|decal|sheet|extra):\s*"([A-Za-z][\w-]*)"/g)) {
    names.add(m[1])
  }
  return [...names].sort()
}

describe("every sheet the kit names is actually baked", () => {
  it("finds a manifest entry for each one", () => {
    const missing = referencedSheets().filter(n => !(n in MANIFEST))
    expect(missing, `named in spell-vfx-kit.ts but absent from the manifest: ${missing.join(", ")}`)
      .toEqual([])
  })

  it("names enough sheets that the scan is really working", () => {
    // Guards the regex itself: if it ever stops matching, the test above
    // would pass vacuously on an empty list.
    expect(referencedSheets().length).toBeGreaterThan(20)
  })
})

describe("Ray of Frost gets the painted art", () => {
  it("uses all three phases of the cut-up contact sheet", () => {
    const spec = routeFor("cold", "Ray of Frost")
    expect(spec?.gather).toBe("frostRayCharge")
    expect(spec?.travel).toBe("frostRayTravel")
    expect(spec?.impact).toBe("frostRayImpact")
  })

  it("is still a beam -- the art is a beam and so is the spell", () => {
    expect(routeFor("cold", "Ray of Frost")?.route).toBe("beam")
  })

  it("no longer uses the 3 KB speckle strip", () => {
    expect(routeFor("cold", "Ray of Frost")?.travel).not.toBe("frostBeam")
  })
})

describe("Guiding Bolt stops flying a radiant column", () => {
  it("has its own travel art", () => {
    const spec = routeFor("radiant", "Guiding Bolt")
    expect(spec?.travel).toBe("guidingBoltTravel")
    // The bug: radiant has no travel sheet, so the attack-roll promotion fell
    // back to spec.impact and flew the COLUMN sideways across the room.
    expect(spec?.travel).not.toBe("radiantColumn")
  })

  it("streaks rather than descending", () => {
    expect(routeFor("radiant", "Guiding Bolt")?.route).toBe("ball")
    expect(routeFor("radiant", "Guiding Bolt")?.motion).toBe("dart")
  })

  it("leaves the two radiant spells that really do descend alone", () => {
    for (const n of ["Sacred Flame", "Moonbeam"]) {
      expect(routeFor("radiant", n)?.route).toBe("sky")
      expect(routeFor("radiant", n)?.impact).toBe("radiantColumn")
    }
  })
})

describe("no one-shot sheet ends on a frame that draws nothing", () => {
  it("keeps the new impact sheets fully used", () => {
    // The inherited fade used t = i/(n-1), which puts the last frame at
    // exactly zero -- a whole frame of file drawing nothing. Measured on the
    // first bake: frostRayImpact frame 9 of 9 came out alpha max 0.
    for (const n of ["frostRayImpact", "guidingBoltImpact"]) {
      const e = MANIFEST[n]
      expect(e, `${n} missing`).toBeDefined()
      expect(e.loop).toBeUndefined()      // one-shots do not wrap
      expect(e.frames).toBe(8)
    }
  })

  it("loops the travel sheets, which repeat while the spell is in the air", () => {
    for (const n of ["frostRayTravel", "guidingBoltTravel"]) {
      expect(MANIFEST[n]?.loop).toBe(true)
    }
  })
})
