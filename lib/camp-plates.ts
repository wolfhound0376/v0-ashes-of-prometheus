/**
 * The three painted camp backdrops (Sam, 2026-09-27): a ring of stones
 * around a banked fire, bedrolls and crates to either side, and one of three
 * Underdark settings behind. The camp scene and the "sit with" talk window
 * both draw from here, so wherever the party pitches camp, the conversation
 * by the fire happens in front of the same painting.
 *
 * Plates are 2560×1280 (2:1), fire ring at roughly 51% across, 64% down.
 */

export type CampBiome = "tunnels" | "fungal" | "shore"

export const CAMP_PLATES: Record<CampBiome, string> = {
  tunnels: "/camp/plates/tunnels.webp",
  fungal: "/camp/plates/fungal.webp",
  shore: "/camp/plates/shore.webp",
}

// Matched against the location name. Water first: "Neverlight Grove" is
// fungal, but "the shore of the Darklake" should not read as a tunnel.
const SHORE = /\b(shore|lake|darklake|water|river|dock|pier|beach|sea|pool|lagoon)\b/i
const FUNGAL = /\b(fung\w*|mushroom\w*|myconid\w*|neverlight|grove|garden|spore\w*|mold|forest)\b/i

/** How the camp reads on a caption — "Ront · Camp in the tunnels". */
export const CAMP_BIOME_LABEL: Record<CampBiome, string> = {
  tunnels: "Camp in the tunnels",
  fungal: "Camp in the fungal grove",
  shore: "Camp on the shore",
}

/** The camp biome for a location. Anything unrecognised camps in the tunnels. */
export function campBiomeFor(locationName: string | null | undefined): CampBiome {
  const name = locationName ?? ""
  if (SHORE.test(name)) return "shore"
  if (FUNGAL.test(name)) return "fungal"
  return "tunnels"
}

/** Accepts an explicit biome from a URL (?plate=) and falls back to the location. */
export function campBiome(locationName: string | null | undefined, explicit?: string | null): CampBiome {
  return explicit && explicit in CAMP_PLATES ? (explicit as CampBiome) : campBiomeFor(locationName)
}

export function campPlateFor(locationName: string | null | undefined, explicit?: string | null): string {
  return CAMP_PLATES[campBiome(locationName, explicit)]
}
