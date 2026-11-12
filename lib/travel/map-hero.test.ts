import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { MAP_FOLLOWERS_MAX, MAP_HERO_FALLBACK, MAP_SPRITE_HERO_IDS, mapFollowerIds, mapHeroFromManifest, mapHeroSlug } from "./map-hero"
import { PREMADE_SPRITE_IDS } from "@/lib/table"

const manifest = (slug: string) => JSON.parse(readFileSync(`public/sprites/${slug}/sprite.json`, "utf8"))

describe("the leader's figure on the world map", () => {
  it("every premade hero has a sprite of their own, and its sheets exist", () => {
    for (const id of PREMADE_SPRITE_IDS) {
      const slug = mapHeroSlug(id)
      const hero = mapHeroFromManifest(slug, manifest(slug))
      expect(hero, slug).not.toBeNull()
      expect(() => readFileSync(`public${hero!.walk.src}`)).not.toThrow()
      expect(() => readFileSync(`public${hero!.idle.src}`)).not.toThrow()
    }
    expect(new Set(PREMADE_SPRITE_IDS.map(mapHeroSlug)).size).toBe(PREMADE_SPRITE_IDS.length)
  })
  it("a forged hero with a baked sprite walks as themselves", () => {
    expect(mapHeroSlug("a4b4c7cd-4bd6-45bb-9a32-a19a37bcb774")).toBe("lynkes")
    const lynkes = mapHeroFromManifest("lynkes", manifest("lynkes"))!
    expect(lynkes.cell).toBe(176)
    // his feet are 29 px above the bottom of his cell: drawn from the cell's edge he floats (Sam, 2026-11-10)
    expect(lynkes.foot).toBeCloseTo(29 / 176, 5)
    expect(mapHeroFromManifest("freia", manifest("freia"))!.foot).toBeCloseTo(2 / 128, 5)
  })
  it("nobody leading, or a hero with no sprite yet, walks as Fifi", () => {
    expect(mapHeroSlug(null)).toBe(MAP_HERO_FALLBACK)
    expect(mapHeroSlug("not-a-hero")).toBe(MAP_HERO_FALLBACK)
  })
  it("a manifest without a walk is refused rather than half-drawn", () => {
    expect(mapHeroFromManifest("x", { animations: { idle: { sheet: "idle.png", frames: 4, fps: 5 } } })).toBeNull()
  })
})

describe("the marching line behind the leader (Sam, 2026-11-12)", () => {
  it("is everyone seated except the leader, in the order they sat down", () => {
    expect(mapFollowerIds("b", ["a", "b", "c"])).toEqual(["a", "c"])
    expect(mapFollowerIds(null, ["a", "a", "", "c"])).toEqual(["a", "c"])
  })
  it("is empty when nobody is seated, and never longer than the line has places", () => {
    expect(mapFollowerIds("a", undefined)).toEqual([])
    expect(mapFollowerIds("a", [])).toEqual([])
    expect(mapFollowerIds("x", ["1", "2", "3", "4", "5", "6", "7"]).length).toBe(MAP_FOLLOWERS_MAX)
  })
  it("draws each hero at their real height: the halflings stand the same, well below the humans", () => {
    const k = (slug: string) => { const h = mapHeroFromManifest(slug, manifest(slug))!; return h.scale }
    expect(k("kenta")).toBeCloseTo(1, 5)
    // Lynkes's sheet is larger than Fifi's (176 px cells against 128), yet he is a halfling like her (Sam, 2026-11-10)
    expect(Math.abs(k("lynkes") - k("freia"))).toBeLessThan(0.03)
    expect(k("freia")).toBeLessThan(0.75 * k("kenta"))
    // a manifest with no ppu keeps the old rule: the cell alone
    expect(mapHeroFromManifest("x", { cell: [160, 160], animations: { walk: { sheet: "w.png", frames: 6 }, idle: { sheet: "i.png", frames: 4 } } })!.scale).toBeCloseTo(1.25, 5)
  })
  it("the DM's test line marches only heroes who really have sheets", () => {
    expect(MAP_SPRITE_HERO_IDS.length).toBeGreaterThanOrEqual(5)
    for (const id of MAP_SPRITE_HERO_IDS) {
      const slug = mapHeroSlug(id)
      const hero = mapHeroFromManifest(slug, manifest(slug))
      expect(hero, slug).not.toBeNull()
      expect(() => readFileSync(`public${hero!.walk.src}`)).not.toThrow()
    }
  })
})
