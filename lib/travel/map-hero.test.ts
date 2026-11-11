import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { MAP_HERO_FALLBACK, mapHeroFromManifest, mapHeroSlug } from "./map-hero"
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
    expect(mapHeroFromManifest("lynkes", manifest("lynkes"))!.cell).toBe(176)
  })
  it("nobody leading, or a hero with no sprite yet, walks as Fifi", () => {
    expect(mapHeroSlug(null)).toBe(MAP_HERO_FALLBACK)
    expect(mapHeroSlug("not-a-hero")).toBe(MAP_HERO_FALLBACK)
  })
  it("a manifest without a walk is refused rather than half-drawn", () => {
    expect(mapHeroFromManifest("x", { animations: { idle: { sheet: "idle.png", frames: 4, fps: 5 } } })).toBeNull()
  })
})
