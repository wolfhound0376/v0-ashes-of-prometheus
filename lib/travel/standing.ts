// lib/travel/standing.ts — the choices every road marker offers.
//
// Sam (2026-11-10): "Why aren't options popping up at each of the map nodes?" Because a node only ever
// offered what had been authored for it, and nothing had been. His ruling the same night: every stop
// gets a card; what is on it is "sourced from the book"; and "Options should include Long Rest which
// should trigger the Camp Module."
//
// So these are the book's own travel rules (Out of the Abyss - D&D Encounters, ch.2 pp.24-25), offered
// at every road marker, and nothing else:
//
//   * MAKE CAMP: LONG REST. p.25: in the Underdark time is tracked by periods of rest, and the navigator
//     checks the way again "any time the characters set out again after finishing a short or long rest".
//     Choosing it stops the march AT THIS MARKER, opens the camp halt the nightfall rule already uses,
//     and takes the table to the Camp Module (/camp), where the fire, the food and the foraging live.
//     Breaking camp starts a new day.
//   * CHANGE PACE — REMOVED (Sam, 2026-11-12, on the pace and navigator sheet: "We don't need this. You can let
//     us know how long we actually marched and why."). The march keeps the book's Normal pace; the day's ledger
//     and the fatigue gauge say how long the party walked and why. paceOfKey stays so an old card's key is
//     still understood, but no marker offers a pace any more.
//
// "Walk on" is the card's own button, not an option here. Foraging is deliberately NOT a road choice:
// p.25 ties it to the day's pace and the camp already resolves it once a day; a second forage on the
// road would let the party gather twice. Nothing here is invented: no scouting, no searching, because
// the chapter gives no rule for either.
//
// Pure. The route (app/api/travel/route.ts) offers these on "arrive" and applies them on "choose".

import { PACES, type DayState, type Pace } from "./march"
import type { NodeOption } from "./options"

export const STANDING_SOURCE = "Out of the Abyss - D&D Encounters, ch.2 pp.24-25 (Travel Pace; Becoming Lost; Foraging)"
export const STANDING_PREFIX = "standing:"
export const LONG_REST_KEY = `${STANDING_PREFIX}long-rest`

/** Kept for the record (the book's prices); no marker offers a pace any more. */
export const PACE_DETAIL: Record<Pace, string> = {
  fast: "A third less time on the road. −5 to passive Perception, −5 to the navigator's check, and no foraging today (p.24-25).",
  normal: "The ordinary pace: no penalty, and the party may forage (p.24-25).",
  slow: "A third more time on the road. +5 to the navigator's check, and improved foraging or moving stealthily (p.24-25).",
}

/** Is this stop a road marker — a waypoint drawn on the travel map — rather than a great place or a place's inside? */
export function isRoadMarker(node: { node_type?: string | null; metadata?: Record<string, unknown> | null }): boolean {
  if (node.node_type !== "waypoint") return false
  const m = node.metadata ?? {}
  return Number.isFinite(Number(m.map_x)) && Number.isFinite(Number(m.map_y)) && m.map_x != null && m.map_y != null
}

export function isStandingKey(key: string): boolean {
  return key.startsWith(STANDING_PREFIX)
}

/** The pace a "change pace" key names, or null. */
export function paceOfKey(key: string): Pace | null {
  const p = key.startsWith(`${STANDING_PREFIX}pace-`) ? key.slice(`${STANDING_PREFIX}pace-`.length) : ""
  return p === "fast" || p === "normal" || p === "slow" ? p : null
}

/**
 * What every road marker offers. Nothing at a great place (it has its entrance) and nothing when the march
 * has already been stopped there (an encounter, nightfall): that card speaks first.
 */
export function standingOptions(node: { node_type?: string | null; metadata?: Record<string, unknown> | null }, day: Pick<DayState, "pace">, halted: boolean): NodeOption[] {
  if (halted || !isRoadMarker(node)) return []
  const out: NodeOption[] = [
    {
      key: LONG_REST_KEY,
      label: "Make camp: long rest",
      detail: PACES[day.pace].canForage
        ? "Stop here for the day. A fire, food, foraging and sleep at the camp. Breaking camp starts a new day and the navigator checks the way again (p.25)."
        : "Stop here for the day. A fire, food and sleep at the camp; no foraging after a fast pace (p.24). Breaking camp starts a new day and the navigator checks the way again (p.25).",
      cost: {},
      requires: [],
      outcome: {},
    },
  ]
  return out
}

/** The line the card shows once a pace is chosen. */
export function paceChosenText(p: Pace): string {
  return p === "fast"
    ? "The party picks up the pace. Fewer eyes on the dark, and nobody stops to gather food."
    : p === "slow"
      ? "The party slows. Careful feet, time to gather what grows, or to move without being heard."
      : "The party settles back into an ordinary march."
}
