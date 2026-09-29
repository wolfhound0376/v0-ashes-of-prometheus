// ============================================================================
// DEATH BURST — the gas spore, read off its own stat block.
//
// The live bestiary row (slug gas-spore) carries the trait word for word:
//
//   "The gas spore explodes when it drops to 0 hit points. Each creature
//    within 20 feet of it must succeed on a DC 15 Constitution saving throw
//    or take 10 (3d6) poison damage and become infected with a disease on a
//    failed save. Creatures immune to the poisoned condition are immune to
//    this disease. Spores invade an infected creature's system, killing the
//    creature in a number of hours equal to 1d12 + the creature's
//    Constitution score, unless the disease is removed. In half that time,
//    the creature becomes poisoned for the rest of the duration. After the
//    creature dies, it sprouts 2d4 Tiny gas spores that grow to full size in
//    7 days."
//
// So the numbers come from that text, never from here: the radius, the DC,
// the ability, the dice, the damage word and the disease clock are all
// parsed. A trait that does not read that way is null, and the burst is not
// run on a guess. Same rule as breath-weapon.ts: text in, facts out. No
// Three.js, no React, no Supabase.
//
// Only the gas spore, deliberately. Other stat blocks have a "Death Burst"
// too (the magmin, the mephits) and they are different rules with a different
// look; this is one creature's trait, not a framework.
// ============================================================================

import { areaCells, type Cell } from "./aoe"

/** The bestiary slug this file is about. */
export const GAS_SPORE_SLUG = "gas-spore"

/**
 * The condition word written on an infected creature. Stored in the same
 * jsonb string[] every other condition lives in, so the sheet, the board and
 * Malachar's world context all show it with no new plumbing.
 */
export const GAS_SPORE_INFECTION = "Gas Spore Infection"

/** The rule, as one line, for anywhere the word needs its meaning beside it. */
export const GAS_SPORE_INFECTION_RULE =
  "Dies in 1d12 + CON score hours unless the disease is removed; poisoned from halfway until then."

/** How long the burst plays on the board, matching every death in death-vfx. */
export const DEATH_BURST_SECONDS = 3

const ABILITIES: Record<string, "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA"> = {
  strength: "STR", dexterity: "DEX", constitution: "CON",
  intelligence: "INT", wisdom: "WIS", charisma: "CHA",
}

export interface DeathBurst {
  /** "within 20 feet of it". */
  radiusFt: number
  dc: number
  ability: "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA"
  /** "3d6" — the dice in the brackets, which is what gets rolled. */
  dice: string
  /** "poison". */
  damageType: string
  /** The disease, when the text lays one on a failed save. */
  disease: {
    /** "1d12" — the die added to the creature's CON score for the hours. */
    hoursDice: string
    /** "In half that time, the creature becomes poisoned". */
    poisonedAtHalf: boolean
    /** "Creatures immune to the poisoned condition are immune to this disease." */
    poisonImmuneAreImmune: boolean
  } | null
}

interface TraitRow { name?: string | null; desc?: string | null }

/**
 * Read a Death Burst trait's text. Null when any number the rule needs is
 * missing: a burst with no DC or no radius is one the board will not run.
 */
export function parseDeathBurst(text: string | null | undefined): DeathBurst | null {
  const s = String(text ?? "")
  const radius = s.match(/within\s+(\d+)\s*(?:feet|foot|ft\.?)/i)
  const save = s.match(/DC\s*(\d+)\s+(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+saving throw/i)
  const dmg = s.match(/\d+\s*\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s+([a-z]+)\s+damage/i)
  if (!radius || !save || !dmg) return null
  const hours = s.match(/hours equal to\s+(\d+d\d+)\s*\+\s*the creature's Constitution score/i)
  const infects = /infected with a disease/i.test(s)
  return {
    radiusFt: Number(radius[1]),
    dc: Number(save[1]),
    ability: ABILITIES[save[2].toLowerCase()],
    dice: dmg[1].replace(/\s+/g, ""),
    damageType: dmg[2].toLowerCase(),
    disease: infects && hours
      ? {
          hoursDice: hours[1],
          poisonedAtHalf: /in half that time, the creature becomes poisoned/i.test(s),
          poisonImmuneAreImmune: /immune to the poisoned condition are immune to this disease/i.test(s),
        }
      : null,
  }
}

/**
 * The burst for this stat block, or null. Gated on the slug (see the header)
 * and then read from the trait named "Death Burst".
 */
export function deathBurstFor(slug: string | null | undefined, traits: unknown): DeathBurst | null {
  if (String(slug ?? "").trim().toLowerCase() !== GAS_SPORE_SLUG) return null
  if (!Array.isArray(traits)) return null
  const row = (traits as TraitRow[]).find((t) => String(t?.name ?? "").trim().toLowerCase() === "death burst")
  return row ? parseDeathBurst(row.desc) : null
}

/**
 * The squares the burst reaches: a sphere on the spore's square, drawn by
 * the SAME areaCells a Fireball uses, so the ring on the board and the list
 * of creatures the server rolls for cannot disagree.
 *
 * "Within 20 feet of it" is measured from the creature's body, so a body
 * bigger than one square adds its reach the way breath-weapon's mouthCell
 * does (ceil(n/2) - 1 squares). For the gas spore (Large, 2 squares) that is
 * zero: on this board a Large token stands on its one square.
 */
export function burstCells(centre: Cell, radiusFt: number, sizeSquares = 1): Cell[] {
  const reachFt = Math.max(0, Math.ceil(Math.max(1, sizeSquares) / 2) - 1) * 5
  return areaCells({ shape: "sphere", sizeFt: radiusFt + reachFt, origin: "self" }, centre, centre)
}

/**
 * Immune to the poisoned condition, read from the free-text list the
 * bestiary and the sheet both keep ("blinded, deafened, poisoned, prone").
 */
export function immuneToPoisoned(conditionImmunities: unknown): boolean {
  const list = Array.isArray(conditionImmunities)
    ? conditionImmunities.map(String).join(",")
    : String(conditionImmunities ?? "")
  return /\bpoisoned\b/i.test(list)
}

/** A moment on the campaign clock. */
export interface ClockTime { day: number; minutesOfDay: number }

/** `minutes` after `t`, carried across midnight. */
export function addMinutes(t: ClockTime, minutes: number): ClockTime {
  const total = t.minutesOfDay + Math.round(minutes)
  return { day: t.day + Math.floor(total / 1440), minutesOfDay: ((total % 1440) + 1440) % 1440 }
}

/** "Day 3, 14:30". */
export function formatClock(t: ClockTime): string {
  const h = Math.floor(t.minutesOfDay / 60)
  const m = t.minutesOfDay % 60
  return `Day ${t.day}, ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** What is stored for one infection, so Malachar and the DM can keep time. */
export interface InfectionRecord {
  condition: typeof GAS_SPORE_INFECTION
  rule: string
  creature: string
  character_id: string | null
  /** The 1d12, rolled at infection. */
  d12: number
  con_score: number
  /** d12 + CON score. */
  hours: number
  /** Half of `hours`, when the trait says so; null otherwise. */
  poisoned_after_hours: number | null
  /** On the campaign clock, when there was one to read. */
  infected_at: ClockTime | null
  poisoned_at: ClockTime | null
  dies_at: ClockTime | null
}

/**
 * The infection's clock. `d12` is the die already rolled (the caller rolls,
 * so this can be tested on every face); `now` is the campaign clock, or null
 * when none could be read — then only the hours are known and the log says so.
 */
export function infectionFor(a: {
  burst: DeathBurst
  creature: string
  characterId: string | null
  conScore: number
  d12: number
  now: ClockTime | null
}): InfectionRecord | null {
  const d = a.burst.disease
  if (!d) return null
  const hours = a.d12 + a.conScore
  const half = d.poisonedAtHalf ? hours / 2 : null
  return {
    condition: GAS_SPORE_INFECTION,
    rule: GAS_SPORE_INFECTION_RULE,
    creature: a.creature,
    character_id: a.characterId,
    d12: a.d12,
    con_score: a.conScore,
    hours,
    poisoned_after_hours: half,
    infected_at: a.now,
    poisoned_at: a.now && half !== null ? addMinutes(a.now, half * 60) : null,
    dies_at: a.now ? addMinutes(a.now, hours * 60) : null,
  }
}

/**
 * The sentence for the log. Written on the DM channel, which is the
 * transcript Malachar reads every turn — this is how he is told.
 */
export function infectionLine(r: InfectionRecord): string {
  const clock = r.dies_at
    ? ` Poisoned from ${r.poisoned_at ? formatClock(r.poisoned_at) : "halfway"}; dies at ${formatClock(r.dies_at)} unless the disease is removed.`
    : ` Poisoned after ${r.poisoned_after_hours ?? "?"} hours; dies after ${r.hours} hours unless the disease is removed (no campaign clock to date it by).`
  return `${r.creature} is infected: ${GAS_SPORE_INFECTION} (1d12 ${r.d12} + CON ${r.con_score} = ${r.hours} hours).${clock}`
}

/** The world_flags key an infection's deadline is kept under. */
export function infectionFlagKey(a: { characterId: string | null; label: string }): string {
  return a.characterId
    ? `gas-spore-infection:${a.characterId}`
    : `gas-spore-infection:npc:${a.label.trim().toLowerCase()}`
}
