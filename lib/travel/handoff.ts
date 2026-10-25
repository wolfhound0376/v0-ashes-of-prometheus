// lib/travel/handoff.ts — a way out of Velkynvelve hands the party to the travel map.
//
// Sam's editor export (2026-10-24) names, for every exit that leaves the outpost, the cavern plate it
// comes out on: the tunnels, the wastes under the lift, the Darklake shore down the river, and so on
// (scripts/velkynvelve-walk/spec.py CAVERNS). None of those plates is painted or walkable in this repo
// yet, so the walk page does not try to walk them. It sends the party to /map with the way out in the
// query string, and this file reads that on the map side.
//
// `biome` is the camp plate that stands in for each cavern today (lib/camp-plates.ts). The wastes, the
// lair and the crystal passage have no plate of their own, so they fall to the tunnels — the same rule
// campBiomeFor applies to anything it does not recognise. Nothing here invents a plate.

import { CAMP_PLATES, type CampBiome } from "@/lib/camp-plates"

export type WalkHandoffKey = "tunnels" | "wastes" | "shore" | "lair" | "grove" | "crystal"

export interface WalkHandoff {
  /** The cavern as the walk names it. */
  name: string
  /** The camp plate that stands in for it today. */
  biome: CampBiome
  /** Whether the way out is still Claude's draw from the guide, unreviewed by Sam. */
  proposed: boolean
}

/** Mirrors spec.py CAVERNS: name and biome per key. Keep the two in step by hand. */
export const WALK_HANDOFFS: Readonly<Record<WalkHandoffKey, WalkHandoff>> = {
  tunnels: { name: "The tunnels", biome: "tunnels", proposed: true },
  wastes: { name: "The wastes", biome: "tunnels", proposed: true },
  shore: { name: "The Darklake shore", biome: "shore", proposed: true },
  lair: { name: "The lair", biome: "tunnels", proposed: true },
  grove: { name: "The grove", biome: "fungal", proposed: false },
  crystal: { name: "The crystal passage", biome: "tunnels", proposed: false },
}

export interface WalkArrival {
  /** The place the party walked out of. Only "velkynvelve" today. */
  from: string
  via: WalkHandoffKey
  name: string
  biome: CampBiome
  /** The plate URL the map can show behind the arrival note. */
  plate: string
}

const isKey = (v: string | null): v is WalkHandoffKey => !!v && v in WALK_HANDOFFS

/** The link the walk page follows when the party leaves. The page builds the same string by hand (template.html leaveVelkynvelve). */
export function walkHandoffHref(via: WalkHandoffKey, from = "velkynvelve"): string {
  const h = WALK_HANDOFFS[via]
  return `/map?from=${encodeURIComponent(from)}&via=${encodeURIComponent(via)}&plate=${encodeURIComponent(h.biome)}`
}

/**
 * Reads a hand-off out of the map page's query string, or null when the party did not just walk out of
 * anywhere. An unknown `via` is ignored rather than guessed; an explicit `plate` wins over the key's own
 * biome only when it names a real camp plate, the same way campBiome treats ?plate=.
 */
export function parseWalkHandoff(search: string | URLSearchParams): WalkArrival | null {
  const q = typeof search === "string" ? new URLSearchParams(search) : search
  const via = q.get("via")
  if (!isKey(via)) return null
  const h = WALK_HANDOFFS[via]
  const plate = q.get("plate")
  const biome: CampBiome = plate && plate in CAMP_PLATES ? (plate as CampBiome) : h.biome
  return { from: q.get("from") || "velkynvelve", via, name: h.name, biome, plate: CAMP_PLATES[biome] }
}
