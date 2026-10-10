// The shape of a day on the road.
//
// Before this file the march had no clock, no pace and no navigator: the party
// token walked 56 miles in zero in-game hours and could not get lost. The
// encounter check (lib/travel/arrival.ts) already fires by miles walked; this
// file adds the rest of what the book says a travelling day is made of, and
// nothing the book does not say. Every rule below names its page.
//
//   PACE          OotA-Enc ch.2 p.24 "Travel Pace": Fast 8 miles/day, −5 to
//                 passive Perception, no foraging. Normal 6. Slow 4, improved
//                 foraging OR stealth. "For a fast pace, reduce the travel times
//                 by one third; for a slow pace, increase them by one third."
//   NAVIGATION    p.25 "Becoming Lost": each day of travel, and whenever the
//                 party sets out again after a short or long rest, the
//                 navigator makes a DC 10 WIS (Survival) check; slow +5, fast −5.
//                 Fail: lost, wandering 1d6 hours before a new check. Creatures
//                 unfamiliar with the region are AUTOMATICALLY lost, wandering
//                 4 hours at a time. A map of an explored route removes the
//                 chance entirely.
//   GUIDES        p.22: who among the Velkynvelve prisoners can navigate.
//   THE DAY       PHB ch.8 "Travel Pace": the pace table assumes 8 hours of
//                 travel in a day. Beyond that is a forced march (CON saves),
//                 which this file does not grant — the day ends at 8 hours and
//                 the party makes camp. That hand-off is the whole point.
//
// Pure: state and rolls in, state and words out. The route owns the database.

import { skillBonus, type SheetSlice } from "../game-context"

export type Rng = () => number
export type Pace = "fast" | "normal" | "slow"

export const PACE_SOURCE = "Out of the Abyss - D&D Encounters, ch.2 p.24 (Travel Pace)"
export const LOST_SOURCE = "Out of the Abyss - D&D Encounters, ch.2 p.25 (Becoming Lost)"
export const GUIDES_SOURCE = "Out of the Abyss - D&D Encounters, ch.2 p.22 (Where to Go?)"
export const DAY_SOURCE = "SRD 5.1 / PHB ch.8 Travel Pace: a day of travel is 8 hours"

export interface PaceRule {
  pace: Pace
  /** The book's own miles per day for the Underdark (p.24). Informational: routes carry their own day_miles. */
  bookMilesPerDay: number
  /** Travel time relative to normal pace: fast −⅓, slow +⅓ (p.24). */
  timeFactor: number
  /** Applied to passive Wisdom (Perception) to notice threats (p.24). */
  perceptionPenalty: number
  /** p.25: "Characters can gather food and water if the party travels at a normal or slow pace." */
  canForage: boolean
  /** Slow pace: "Improved foraging, or able to use Stealth" — one or the other, the party chooses (p.24). */
  improvedForageOrStealth: boolean
  /** Modifier to the navigation check (p.25). */
  navigationMod: number
  label: string
}

export const PACES: Readonly<Record<Pace, PaceRule>> = {
  fast: { pace: "fast", bookMilesPerDay: 8, timeFactor: 2 / 3, perceptionPenalty: -5, canForage: false, improvedForageOrStealth: false, navigationMod: -5, label: "Fast — −5 passive Perception, no foraging" },
  normal: { pace: "normal", bookMilesPerDay: 6, timeFactor: 1, perceptionPenalty: 0, canForage: true, improvedForageOrStealth: false, navigationMod: 0, label: "Normal" },
  slow: { pace: "slow", bookMilesPerDay: 4, timeFactor: 4 / 3, perceptionPenalty: 0, canForage: true, improvedForageOrStealth: true, navigationMod: 5, label: "Slow — improved foraging or Stealth" },
}

export function isPace(x: unknown): x is Pace {
  return x === "fast" || x === "normal" || x === "slow"
}

/** Hours of walking the book's pace table assumes per day (PHB ch.8). */
export const MARCH_HOURS_PER_DAY = 8

/**
 * Miles the party covers in a day at this pace on THIS route.
 *
 * Routes carry their own normal-pace figure (`travel_march.day_miles`, 7 on
 * Velkynvelve→Sloobludop because the book's table makes that road 8 days for
 * 56 miles). Fast and slow scale it by the book's thirds rather than
 * substituting the generic 8/4, so the Travel Times table (p.24) still holds:
 * 8 days normal, 5⅓ fast, 10⅔ slow.
 */
export function dayMilesAt(pace: Pace, normalDayMiles: number): number {
  const base = Number(normalDayMiles) > 0 ? Number(normalDayMiles) : 7
  return base / PACES[pace].timeFactor
}

/** Minutes of in-game time a leg of `miles` costs at this pace. */
export function legMinutes(miles: number, pace: Pace, normalDayMiles: number): number {
  const m = Math.max(0, Number(miles) || 0)
  return Math.round((m / dayMilesAt(pace, normalDayMiles)) * MARCH_HOURS_PER_DAY * 60)
}

/** Days a route of `miles` takes at this pace, as the book would quote it. */
export function routeDays(miles: number, pace: Pace, normalDayMiles: number): number {
  return Math.max(0, Number(miles) || 0) / dayMilesAt(pace, normalDayMiles)
}

// ============================================================================
// NAVIGATION
// ============================================================================

export const NAVIGATION_DC = 10
export const LOST_HOURS_DIE = 6
/** p.25: creatures unfamiliar with the region wander "in a random direction for every 4 hours of travel". */
export const UNFAMILIAR_WANDER_HOURS = 4

export interface Navigator {
  name: string
  /** Full Wisdom (Survival) bonus: ability modifier plus proficiency. */
  survivalBonus: number
  /** Knows this region's routes. Without this the party is automatically lost (p.25). */
  familiar: boolean
  /** A map of a previously explored route: "no chance of becoming lost" (p.25). */
  hasMap?: boolean
}

/** A navigator built from a player character's sheet. Players are not Underdark natives: unfamiliar unless the DM says otherwise. */
export function navigatorFromSheet(sheet: SheetSlice, opts: { familiar?: boolean; hasMap?: boolean } = {}): Navigator {
  const { mod, prof } = skillBonus(sheet, "survival")
  return { name: sheet.name, survivalBonus: mod + prof, familiar: !!opts.familiar, hasMap: !!opts.hasMap }
}

/** Of several candidates, the one with the best Survival. Ties go to the first named. */
export function bestNavigator(cands: readonly Navigator[]): Navigator | null {
  let best: Navigator | null = null
  for (const c of cands) if (!best || c.survivalBonus > best.survivalBonus) best = c
  return best
}

export interface Guide {
  key: string
  name: string
  /** Where they know the way. `any` = the whole map (Sarith). */
  familiarWith: "any" | "none" | string
  /** A flat bonus when they help the navigator rather than lead (Eldeth's +5). */
  survivalBonus: number | null
  note: string
}

/** The escaped prisoners of Velkynvelve, as p.22 rates them. */
export const GUIDES: readonly Guide[] = [
  { key: "sarith", name: "Sarith Kzekarit", familiarWith: "any", survivalBonus: null, note: "Can navigate to any region shown on the map. The best guide, and the most deceptive." },
  { key: "jimjar", name: "Jimjar", familiarWith: "north route to Blingdenstone", survivalBonus: null, note: "Can guide the party to Blingdenstone from the north route out of Velkynvelve." },
  { key: "shuushar", name: "Shuushar", familiarWith: "the Darklake (within 3 miles of it)", survivalBonus: null, note: "Can navigate the Darklake once the party is within three miles of any part of it." },
  { key: "eldeth", name: "Eldeth Feldrun", familiarWith: "none", survivalBonus: 5, note: "Unfamiliar with this region and can't navigate, but has a +5 on Wisdom (Survival) checks and can help." },
  { key: "buppido", name: "Buppido", familiarWith: "Gracklstugh", survivalBonus: null, note: "Urges the party toward Gracklstugh. Intends to murder them one by one on the way." },
  { key: "derendil", name: "Prince Derendil", familiarWith: "none", survivalBonus: null, note: "Can't offer any useful directions." },
  { key: "ront", name: "Ront", familiarWith: "none", survivalBonus: null, note: "Unfamiliar with the Underdark and can't navigate." },
  { key: "stool", name: "Stool", familiarWith: "none", survivalBonus: null, note: "Can't navigate and has no knowledge of the local area." },
  { key: "topsy-turvy", name: "Topsy and Turvy", familiarWith: "none", survivalBonus: null, note: "Not rated as navigators by the book." },
]

export function guideByKey(key: string | null | undefined): Guide | null {
  return GUIDES.find((g) => g.key === key) ?? null
}

/**
 * A guide leading the march is a navigator who knows the way (familiar) and
 * rolls at +0 unless the book gives a bonus; the book gives none for the
 * natives, only Eldeth's +5 for helping. Her +5 is read here as the navigator's
 * bonus when she leads — she is "unfamiliar", so without a native alongside
 * the party is still automatically lost. That reading is PROPOSED.
 */
export function navigatorFromGuide(g: Guide): Navigator {
  return { name: g.name, survivalBonus: g.survivalBonus ?? 0, familiar: g.familiarWith !== "none" }
}

export interface NavigationResult {
  navigator: string
  /** "check" rolled the die; "map" needed none; "unfamiliar" never got to roll. */
  mode: "check" | "map" | "unfamiliar"
  roll: number | null
  total: number | null
  dc: number
  paceMod: number
  lost: boolean
  /** Hours wandering before the navigator may try again. 0 when on course. */
  lostHours: number
  lostDie: number | null
  note: string
  source: string
}

/**
 * One navigation check (p.25). Call it when the party sets out — after any
 * rest — and once per day of travel while they walk.
 */
export function navigate(nav: Navigator | null, pace: Pace, rng: Rng): NavigationResult {
  const paceMod = PACES[pace].navigationMod
  if (nav?.hasMap) {
    return { navigator: nav.name, mode: "map", roll: null, total: null, dc: NAVIGATION_DC, paceMod, lost: false, lostHours: 0, lostDie: null, note: `${nav.name} follows the party's own map of this route: no chance of becoming lost.`, source: LOST_SOURCE }
  }
  if (!nav || !nav.familiar) {
    const who = nav?.name ?? "No one"
    return {
      navigator: who,
      mode: "unfamiliar",
      roll: null,
      total: null,
      dc: NAVIGATION_DC,
      paceMod,
      lost: true,
      lostHours: UNFAMILIAR_WANDER_HOURS,
      lostDie: null,
      note: `${nav ? `${who} does not know` : "No one in the party knows"} these tunnels. Strangers to a region of the Underdark are automatically lost, wandering ${UNFAMILIAR_WANDER_HOURS} hours at a time until they reach ground they know - or someone who does.`,
      source: LOST_SOURCE,
    }
  }
  const roll = 1 + Math.floor(rng() * 20)
  const total = roll + nav.survivalBonus + paceMod
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
  const arithmetic = `d20(${roll}) + Survival(${sign(nav.survivalBonus)})${paceMod ? ` + ${pace} pace(${sign(paceMod)})` : ""} = ${total} vs DC ${NAVIGATION_DC}`
  if (total >= NAVIGATION_DC) {
    return { navigator: nav.name, mode: "check", roll, total, dc: NAVIGATION_DC, paceMod, lost: false, lostHours: 0, lostDie: null, note: `${nav.name} keeps the party on the route (${arithmetic}).`, source: LOST_SOURCE }
  }
  const die = 1 + Math.floor(rng() * LOST_HOURS_DIE)
  return {
    navigator: nav.name,
    mode: "check",
    roll,
    total,
    dc: NAVIGATION_DC,
    paceMod,
    lost: true,
    lostHours: die,
    lostDie: die,
    note: `${nav.name} loses the way (${arithmetic}). The party wanders ${die} hour${die === 1 ? "" : "s"} before the route can be found again (1d6 = ${die}).`,
    source: LOST_SOURCE,
  }
}

// ============================================================================
// THE DAY
// ============================================================================

/** The travelling-day columns on `travel_march`. The encounter accumulator lives beside them (lib/travel/arrival.ts). */
export interface DayState {
  pace: Pace
  /** Hours walked (and wandered) since the party last set out from a rest. */
  hours_today: number
  /** A navigation check is owed before the next leg (set by `depart` and by each new day). */
  navigation_due: boolean
  /** Hours lost to wandering, all told. */
  lost_hours_total: number
  /** Days of walking completed on this journey. */
  days_marched: number
}

export const FRESH_DAY: DayState = { pace: "normal", hours_today: 0, navigation_due: true, lost_hours_total: 0, days_marched: 0 }

export function normaliseDay(raw: Partial<Record<keyof DayState, unknown>> | null | undefined): DayState {
  const r = raw ?? {}
  return {
    pace: isPace(r.pace) ? r.pace : "normal",
    hours_today: Math.max(0, Number(r.hours_today) || 0),
    navigation_due: r.navigation_due == null ? true : !!r.navigation_due,
    lost_hours_total: Math.max(0, Number(r.lost_hours_total) || 0),
    days_marched: Math.max(0, Math.trunc(Number(r.days_marched) || 0)),
  }
}

/** Setting out (after a rest, or a new destination): the pace is chosen and a navigation check is owed. */
export function depart(day: DayState, pace: Pace): DayState {
  return { ...day, pace, hours_today: 0, navigation_due: true }
}

export interface LegOutcome {
  day: DayState
  /** In-game minutes this leg cost: walking, plus any hours lost. */
  minutes: number
  walkMinutes: number
  lostMinutes: number
  navigation: NavigationResult | null
  /** The 8 hours are up: the party must make camp here. The DM's "continue" starts a new day. */
  nightfall: boolean
  note: string
}

/**
 * One leg of road, walked. Rolls navigation when one is owed, charges the
 * hours, and calls nightfall when the day's eight are spent. A day that ends
 * mid-leg still ends - the party camps where it stands, and the rest of that
 * leg belongs to tomorrow (the map already stops at every marker, so "here"
 * is always a node).
 */
export function walkLeg(day: DayState, miles: number, normalDayMiles: number, nav: Navigator | null, rng: Rng): LegOutcome {
  const d: DayState = { ...day }
  let navigation: NavigationResult | null = null
  let lostMinutes = 0
  if (d.navigation_due) {
    navigation = navigate(nav, d.pace, rng)
    d.navigation_due = false
    if (navigation.lost) {
      lostMinutes = navigation.lostHours * 60
      d.lost_hours_total += navigation.lostHours
    }
  }
  const walkMinutes = legMinutes(miles, d.pace, normalDayMiles)
  d.hours_today += (walkMinutes + lostMinutes) / 60
  const nightfall = d.hours_today + 1e-6 >= MARCH_HOURS_PER_DAY
  if (nightfall) {
    d.days_marched += 1
    d.navigation_due = true // "for each day of travel" (p.25)
  }
  const bits: string[] = []
  if (navigation) bits.push(navigation.note)
  bits.push(`${miles.toFixed(1)} miles at ${d.pace} pace: ${Math.round(walkMinutes / 60 * 10) / 10} h.`)
  if (nightfall) bits.push(`Day ${d.days_marched} of the march is done - ${Math.round(d.hours_today * 10) / 10} hours on the road. Make camp.`)
  return { day: d, minutes: walkMinutes + lostMinutes, walkMinutes, lostMinutes, navigation, nightfall, note: bits.join(" ") }
}

/** The DM's "continue" after nightfall: a new day begins where the party stands. */
export function newDay(day: DayState): DayState {
  return { ...day, hours_today: 0, navigation_due: true }
}

/** Hours of daylight (by the book's reckoning: of the eight) left before camp. */
export function hoursLeft(day: DayState): number {
  return Math.max(0, MARCH_HOURS_PER_DAY - day.hours_today)
}

// ============================================================================
// WHAT THE DASHBOARD SAYS
// ============================================================================

/** Passive Perception on the march, pace applied (p.24). */
export function marchPassivePerception(sheet: SheetSlice, pace: Pace): number {
  if (sheet.passive_perception != null) return sheet.passive_perception + PACES[pace].perceptionPenalty
  const { mod, prof } = skillBonus(sheet, "perception")
  return 10 + mod + prof + PACES[pace].perceptionPenalty
}

/** A line for the departure sheet: how long the road ahead takes at each pace. */
export function paceSummary(miles: number, normalDayMiles: number): { pace: Pace; days: number; label: string }[] {
  return (["fast", "normal", "slow"] as Pace[]).map((p) => {
    const days = routeDays(miles, p, normalDayMiles)
    return { pace: p, days, label: `${PACES[p].label} - ${Math.round(days * 10) / 10} days` }
  })
}
