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

/** How many heroes walk behind the leader on the map. The table seats five; the page has a place in the line for each. */
export const MAP_FOLLOWERS_MAX = 5

/**
 * THE MARCHING LINE (Sam, 2026-11-12: "the marching line with real walk cycles"). Who walks behind the leader:
 * everyone seated this run except the leader, in the order they sat down. Nobody seated (the DM looking at the
 * map alone) means nobody follows; the leader still walks.
 */
export function mapFollowerIds(leaderId: string | null | undefined, seated: readonly string[] | null | undefined): string[] {
  const out: string[] = []
  for (const id of seated ?? []) {
    if (typeof id !== "string" || !id || id === leaderId || out.includes(id)) continue
    out.push(id)
    if (out.length >= MAP_FOLLOWERS_MAX) break
  }
  return out
}

/**
 * Every hero who has a walking sprite of their own. The DM's "all heroes" line (a test switch on the map, this
 * browser only) marches these, so the line can be looked at without seating a table first.
 */
export const MAP_SPRITE_HERO_IDS: readonly string[] = [...Object.keys(PREMADE), ...Object.keys(FORGED)]

/**
 * WHAT LOOMS AT A LAIR (Sam, 2026-11-12: "oversized boss silhouettes"). travel_nodes.node_key -> the sprite of the
 * creature whose lair lies off that stop. The map draws it as a large dark shape behind the stop once the party
 * can see the stop. Every entry needs a source: nothing here is invented.
 *   road-21  the hook horror: Sam's Exit Picker pick of 2026-10-24 ("Hook Horror Layer" -> road-21, see
 *            lib/travel/handoff.ts), the Hook Horror Hunt of Out of the Abyss ch.2.
 */
export const MAP_LAIRS: Readonly<Record<string, string>> = {
  "road-21": "hook-horror",
}

/**
 * LYNKES STANDS AS TALL AS FIFI (Sam, 2026-11-10 and again 2026-11-12: "Lynkes should be about the same size of Fifi").
 * A manifest's `ppu` is meant to be figure pixels x 5 / feet (AGENTS.md, sprite height rule). Lynkes's says 208, but
 * his figure is about 118 px tall, which at a halfling's 3.8 ft is 155. At 208 the map drew him at about 73% of
 * Fifi's height. The map reads the corrected number from here. His sprite.json is left alone in this change: the
 * Underwalk page bakes that number in, so changing it there is a rebuild of the walk and a ruling of its own.
 */
const MAP_PPU: Readonly<Record<string, number>> = {
  lynkes: 155,
}

export type MapHero = {
  walk: { src: string; frames: number; fps: number }
  idle: { src: string; frames: number; fps: number }
  cell: number
  /** How far up the cell the feet stand, 0..1 (the manifest's pivot). Not every sheet draws its figure down to the bottom edge. */
  foot: number
  /**
   * How large the page draws the figure, 1 = a 128px cell at 96 pixels per 5 ft (Kenta). From the manifest's `ppu`
   * (AGENTS.md, sprite height rule), so heroes in the marching line stand at their real heights beside each
   * other: a halfling is not as tall as a human because her sheet was drawn larger.
   */
  scale: number
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
  const ppu = MAP_PPU[slug] ?? Number((m as { ppu?: unknown } | null)?.ppu)
  const scale = (cell / 128) * (ppu > 0 ? 96 / ppu : 1)
  return { walk, idle, cell, foot: Math.max(0, 1 - pivotY / cell), scale }
}
