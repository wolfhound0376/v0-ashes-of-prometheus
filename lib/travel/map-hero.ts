// lib/travel/map-hero.ts
//
// Whose pixel figure walks the world map (Sam, 2026-11-10): "Whomever is the host of the game should be
// the leader and the pixel icon use for the world map." The map shows the LEADER's own sprite — the same
// sheets the Underwalk gives that hero (public/sprites/<slug>), so the figure that walks out of
// Velkynvelve is the figure that walks the road.
//
// Pure: ids in, a slug out. The page reads the slug's sprite.json for frames, speed and cell size.
import forged from "@/scripts/velkynvelve-walk/heroes.json"

/** The four premade heroes and the sprite the Underwalk already gives each (template.html, FULL_PARTY). */
const PREMADE: Record<string, string> = {
  "51e4202d-b4d5-4658-a9c1-6102713e77f1": "kenta",
  "d00aa5b8-ced1-477d-9ec8-0861cca55498": "freia", // Fifi: `freia` is her walking sprite (the Map Module's own sheet, byte for byte)
  "88cc9dd1-b0fe-4e62-9829-f84aafe3c066": "scott",
  "be060806-9938-4afd-9cf6-ad298d9eaa97": "samson",
}
const FORGED: Record<string, string> = Object.fromEntries(
  Object.entries(forged as Record<string, string>).filter(([k, v]) => k !== "_" && typeof v === "string"),
)

/** A hero with no sprite of their own yet walks as Fifi, the Map Module's original figure. */
export const MAP_HERO_FALLBACK = "freia"

export function mapHeroSlug(characterId: string | null | undefined): string {
  if (!characterId) return MAP_HERO_FALLBACK
  return PREMADE[characterId] ?? FORGED[characterId] ?? MAP_HERO_FALLBACK
}

export type MapHero = {
  walk: { src: string; frames: number; fps: number }
  idle: { src: string; frames: number; fps: number }
  cell: number
  /** How far up the cell the feet stand, 0..1 (the manifest's pivot). Not every sheet draws its figure down to the bottom edge. */
  foot: number
}

/** Turn a sprite manifest (public/sprites/<slug>/sprite.json) into what the map page needs; null if it has no walk or idle. */
export function mapHeroFromManifest(slug: string, manifest: unknown): MapHero | null {
  const m = manifest as { cell?: unknown; animations?: Record<string, { sheet?: unknown; frames?: unknown; fps?: unknown }> } | null
  const a = m?.animations
  const one = (k: "walk" | "idle") => {
    const s = a?.[k]
    if (!s || typeof s.sheet !== "string" || !(Number(s.frames) >= 1)) return null
    return { src: `/sprites/${slug}/${s.sheet}`, frames: Number(s.frames), fps: Number(s.fps) > 0 ? Number(s.fps) : 8 }
  }
  const walk = one("walk")
  const idle = one("idle")
  if (!walk || !idle) return null
  const cell = Array.isArray(m?.cell) && Number(m.cell[0]) > 0 ? Number(m.cell[0]) : 128
  const p = (m as { pivot?: unknown } | null)?.pivot
  const pivotY = Array.isArray(p) && Number(p[1]) > 0 && Number(p[1]) <= cell ? Number(p[1]) : cell
  return { walk, idle, cell, foot: Math.max(0, 1 - pivotY / cell) }
}
