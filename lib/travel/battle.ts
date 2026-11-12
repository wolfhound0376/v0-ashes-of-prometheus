// lib/travel/battle.ts — where a road encounter is fought, and against what.
//
// Sam, 2026-10 (the Pixel Heroes pass): "If a fight ensues then we fade into a battle map that resembles the area
// we are in. Like the combat module." Then, on plates: "Biome plate for most but dedicated one for others to create
// more space. For each plate ask me." And 2026-11-12, after the three pilot plates were merged: "go".
//
// This file answers two questions from the dice already rolled at the marker, and invents nothing:
//
//   WHICH PLATE. Only plates Sam has approved (claude/Battle_Plates_For_Road_Encounters_2026-11-12.md):
//     - the terrain rolled with the creatures, when its plate is painted (Rope bridge, Boneyard, Webs);
//     - else giant spiders fight on the Webs (his plate list: "Giant spiders: Webs").
//     Anything else has no painted plate yet, so there is no battle to offer and the card says so.
//
//   WHICH FOES. Only a creature row that carries both a `bestiary` name and a `count` in encounter_table_rows
//     (today: the Ambushers table), and only a creature the walk page has a stat block and sprite for
//     (WALK_FOES — today the giant spider). A dice count ("1d6") is rolled here with the caller's roller and
//     the roll is kept, so the number on the plate can be audited like every other die.
//
// Surprise is the meeting's verdict (lib/travel/meeting.ts), carried through untouched.
//
// Pure: rolled steps and a roller in, a battle or null out.

import type { RolledStep, Roll } from "./arrival"
import type { Meeting } from "./meeting"

export const BATTLE_SOURCE =
  "Plates: Sam's approved list, 2026-11-12 (terrain plate when painted; giant spiders on the Webs). Foes and counts: encounter_table_rows (OotA ch.2, Ambushers). Surprise: lib/travel/meeting.ts."

/** Terrain results (underdark_terrain.result) whose battle plate is painted: the walk's plate key. */
export const TERRAIN_PLATES: Readonly<Record<string, string>> = {
  "rope bridge": "road-rope-bridge",
  boneyard: "road-boneyard",
  webs: "road-webs",
}

/** Creatures with a plate of their own in Sam's list, when no painted terrain was rolled. */
export const CREATURE_PLATES: Readonly<Record<string, string>> = { "giant spider": "road-webs" }

/** Bestiary name -> the walk page's foe id (a sprite AND a stat block there: template.html FOE_BLOCKS). */
export const WALK_FOES: Readonly<Record<string, string>> = { "giant spider": "giant-spider" }

export interface RoadBattle {
  /** The walk plate the fight opens on. */
  plate: string
  /** One walk foe id per creature. */
  foes: string[]
  /** The creature as the book names it, and how many. */
  creature: string
  count: number
  /** The count's dice and the faces rolled, when the row gave dice ("1d6" -> [4]). Empty for a fixed count. */
  countDice: string | null
  countRolls: number[]
  /** Who starts surprised (lib/travel/meeting.ts). */
  surprised: "party" | null
  /** The row's own words, for the fight's opening line. */
  label: string
  source: string
}

/** Why there is no battle to offer, in words for the card. Null when there is one. */
export type NoBattle = { reason: string }

const DICE = /^(\d+)d(\d+)(?:\s*\+\s*(\d+))?$/

function rollCount(count: unknown, roll: Roll): { n: number; dice: string | null; rolls: number[] } | null {
  if (typeof count === "number" && Number.isInteger(count) && count > 0) return { n: count, dice: null, rolls: [] }
  if (typeof count !== "string") return null
  const m = DICE.exec(count.trim())
  if (!m) return null
  const rolls = Array.from({ length: Number(m[1]) }, () => roll(Number(m[2])))
  return { n: rolls.reduce((a, b) => a + b, 0) + Number(m[3] ?? 0), dice: count.trim(), rolls }
}

/**
 * The battle for the dice rolled at this marker, or the reason there is none. Null when the dice named no
 * creatures at all (nothing to fight).
 */
export function battleFor(
  rolls: readonly Pick<RolledStep, "table_key" | "result" | "detail">[] | null | undefined,
  meeting: Pick<Meeting, "surprised"> | null | undefined,
  roll: Roll,
): RoadBattle | NoBattle | null {
  const steps = rolls ?? []
  // the creature row that names a stat block: the last such step (the Ambushers sub-table follows "Ambushers")
  const row = [...steps].reverse().find((r) => typeof r.detail?.bestiary === "string" && /creature|ambush/.test(r.table_key))
  if (!row) return steps.some((r) => /creature|ambush/.test(r.table_key)) ? { reason: "This result has no stat block linked in the encounter table yet." } : null
  const creature = String(row.detail.bestiary)
  const key = creature.toLowerCase()
  const foe = WALK_FOES[key]
  if (!foe) return { reason: `The walk has no stat block for ${creature} yet.` }
  const counted = rollCount(row.detail.count, roll)
  if (!counted) return { reason: `The encounter table gives no count for ${creature} yet.` }
  const terrain = steps.find((r) => r.table_key.endsWith("_terrain"))
  const plate = (terrain && TERRAIN_PLATES[terrain.result.toLowerCase()]) || CREATURE_PLATES[key]
  if (!plate) return { reason: `No battle plate is painted for ${creature} here yet.` }
  return {
    plate,
    foes: Array.from({ length: counted.n }, () => foe),
    creature,
    count: counted.n,
    countDice: counted.dice,
    countRolls: counted.rolls,
    surprised: meeting?.surprised ?? null,
    label: row.result,
    source: BATTLE_SOURCE,
  }
}

export const isBattle = (b: RoadBattle | NoBattle | null | undefined): b is RoadBattle => !!b && "plate" in b

/**
 * The walk page's address for this fight (app/velkynvelve reads it; template.html roadFight). `surprised` is who
 * starts surprised NOW: the encounter box's verdict once a choice is made (lib/travel/stance.ts: an ambush
 * surprises "them"), else the meeting's.
 */
export function battleHref(b: RoadBattle, surprised: "party" | "them" | null = b.surprised, sandbox = false): string {
  const q = new URLSearchParams({ road: b.plate, foes: b.foes.join(","), why: b.label })
  if (surprised) q.set("surprised", surprised)
  if (sandbox) q.set("sandbox", "1")
  return `/velkynvelve?${q.toString()}`
}
