// lib/harvest.ts — what a carcass yields, and how rare it is.
//
// Sam, 2026-10-27: "I want all of this in databases and wired in the game." The parts a creature gives on the kill
// live in the `creature_harvest` table (one row per creature and part, each with its provenance); the parts
// themselves are `items` rows like anything else. This file holds the one rule that sets a part's rarity.
//
// THE RULE — Xanathar's Guide to Everything, Crafting a Magic Item (pp. 128-129; campaign_chunks id 2639,
// "Xanathar's ch. 2 ... 8. Downtime activities"): crafting a magic item needs a formula and an exotic material, "often
// a part harvested from a monster", and the monster's challenge rating scales with the item's rarity:
//   common 1-3 · uncommon 4-8 · rare 9-12 · very rare 13-18 · legendary 19+
// A part therefore carries the rarity of the item it can make, which is the band its creature's CR falls in. The book's
// table starts at CR 1; creatures below CR 1 (a CR 0 fire beetle, a CR 1/4 rothé) are read as common.

import { BODY_KIT, CREATURE_PARTS, type LootEntry } from "./walk-loot"

export type Rarity = "common" | "uncommon" | "rare" | "very_rare" | "legendary"

/** A challenge rating as the bestiary stores it ("0", "1/8", "1/4", "1/2", "3", "13") as a number, or null. */
export function crNumber(cr: string | number | null | undefined): number | null {
  if (cr === null || cr === undefined || cr === "") return null
  if (typeof cr === "number") return Number.isFinite(cr) ? cr : null
  const s = String(cr).trim()
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(s)
  if (frac) return Number(frac[1]) / Number(frac[2])
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Xanathar's harvest band for a creature's CR. Below CR 1 is common; an unknown CR gives null (no guess). */
export function rarityForCr(cr: string | number | null | undefined): Rarity | null {
  const n = crNumber(cr)
  if (n === null) return null
  if (n >= 19) return "legendary"
  if (n >= 13) return "very_rare"
  if (n >= 9) return "rare"
  if (n >= 4) return "uncommon"
  return "common"
}

/** Where a harvest row comes from, strongest first. */
export type HarvestProvenance =
  | "srd"                    // the SRD's own text names the part (fire beetle glands, crawler mucus, purple worm poison)
  | "book"                   // an ingested Out of the Abyss passage names it
  | "spell-component"        // a spell's component text names it (umber hulk blood)
  | "registry-unverified"    // Sam's ingredient list claims a WotC book; not checkable here
  | "registry-homebrew"      // Sam's ingredient list marks it community content
  | "catalogue"              // an existing catalogue harvest row (`properties.harvest_from`), homebrew unless it says otherwise

export type HarvestRow = { bestiary_slug: string; item_slug: string; qty: number; note: string | null; provenance: HarvestProvenance; source: string }

/** What a body yields on the map: harvest rows from the DB replace the stop-gap parts in lib/walk-loot.ts; a body with a
 *  kit as well keeps the kit and adds the parts. No rows (or no table yet) → the TS kit, so a kill never drops nothing new. */
export function bodyKit(slug: string, parts: LootEntry[] | null): LootEntry[] | undefined {
  if (!parts?.length) return BODY_KIT[slug]
  return CREATURE_PARTS[slug] ? parts : [...(BODY_KIT[slug] ?? []), ...parts]
}
