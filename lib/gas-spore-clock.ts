// ============================================================================
// THE GAS SPORE INFECTION'S CLOCK — poisoned at halfway, dead at the deadline.
//
// lib/death-burst rolls the 1d12 when a creature is infected and keeps the
// deadline in world_flags (key gas-spore-infection:<id>), dated on the
// campaign game_clock:
//
//   "killing the creature in a number of hours equal to 1d12 + the creature's
//    Constitution score, unless the disease is removed. In half that time,
//    the creature becomes poisoned for the rest of the duration."
//
// This is the half that keeps the time. It runs every time the campaign
// clock moves (lib/time-tracking logTimeEvent calls it after each time_log
// row), so a long rest, a cinematic cut, a fight, or one more exchange of
// dialogue all reach it the same way, and a jump past both moments applies
// both, in order.
//
// "Unless the disease is removed" is read off the sheet: the condition word
// IS the disease. A creature whose Gas Spore Infection has been taken off
// (Lesser Restoration, a DM's hand) is cured, and its clock stops for good.
//
// The decision is pure (stepsDue) so every boundary can be tested; the
// writer below only applies what it decides.
// ============================================================================

import { GAS_SPORE_INFECTION, type ClockTime, type InfectionRecord } from "./death-burst"
import { normalizeConditions } from "./conditions"
import { conditionsFor } from "./death-saves"

export const POISONED = "Poisoned"

/** The record as stored, plus what this clock has already done to it. */
export interface InfectionState extends InfectionRecord {
  poisoned_applied?: boolean
  died?: boolean
  cured?: boolean
}

/** A campaign moment as absolute minutes, for comparing. */
export function absMinutes(t: ClockTime): number {
  return t.day * 1440 + t.minutesOfDay
}

export interface StepsDue {
  /** The disease was taken off the creature: stop the clock. */
  cure: boolean
  /** Halfway has passed and Poisoned is not yet laid. */
  poison: boolean
  /** The deadline has passed. */
  die: boolean
}

/**
 * What is owed at `now`, given the record and whether the condition word is
 * still on the creature.
 *
 * Nothing is owed by a finished record (died or cured), nor by one with no
 * date: an infection caught while no campaign clock was running knows its
 * hours but not when they started, and is left to Malachar rather than
 * dated from whenever this happens to run.
 */
export function stepsDue(rec: InfectionState, now: ClockTime, stillInfected: boolean): StepsDue {
  const none = { cure: false, poison: false, die: false }
  if (rec.died || rec.cured || !rec.dies_at) return none
  if (!stillInfected) return { cure: true, poison: false, die: false }
  const t = absMinutes(now)
  const die = t >= absMinutes(rec.dies_at)
  const poison = !rec.poisoned_applied && rec.poisoned_at !== null && t >= absMinutes(rec.poisoned_at)
  return { cure: false, poison, die }
}

/** The sentences for the log, in the order they happen. */
export function stepLines(label: string, due: StepsDue): string[] {
  if (due.cure) return [`${label}'s ${GAS_SPORE_INFECTION} is gone; the spores' clock stops.`]
  const out: string[] = []
  if (due.poison) out.push(`Halfway: the spores in ${label} take hold, and ${label} is poisoned until the disease is removed.`)
  if (due.die) out.push(`${label} dies of the ${GAS_SPORE_INFECTION}.`)
  return out
}

const has = (list: string[], word: string) => list.some((c) => c.toLowerCase() === word.toLowerCase())

/**
 * Apply every infection that is owed something at `now`.
 *
 * Best-effort, like the rest of the clock: an exception here is logged and
 * swallowed, because the time already moved and the turn must not fail over
 * a side effect of it. Never silent, though: the console names the creature.
 */
export async function advanceGasSporeInfections(db: any, now: ClockTime): Promise<void> {
  const { data: flags, error } = await db
    .from("world_flags")
    .select("key,value")
    .eq("campaign_id", "ashes-of-prometheus")
    .like("key", "gas-spore-infection:%")
  if (error) {
    console.error("[gas-spore] infection clocks unreadable:", error.message)
    return
  }
  for (const flag of (flags ?? []) as { key: string; value: InfectionState }[]) {
    const rec = flag.value
    if (!rec || rec.died || rec.cured || !rec.dies_at) continue
    try {
      await advanceOne(db, flag.key, rec, now)
    } catch (e) {
      console.error(`[gas-spore] clock for ${rec.creature} threw:`, e)
    }
  }
}

async function advanceOne(db: any, key: string, rec: InfectionState, now: ClockTime) {
  const label = rec.creature
  // The creature's conditions where they live: the sheet for a player, the
  // encounter row (by name, as all NPC canon is) for anything else.
  const conditions = rec.character_id
    ? normalizeConditions((await db.from("characters").select("conditions").eq("id", rec.character_id).maybeSingle()).data?.conditions)
    : normalizeConditions((await db.from("npc_encounters").select("conditions").eq("name", label).limit(1).maybeSingle()).data?.conditions)

  const due = stepsDue(rec, now, has(conditions, GAS_SPORE_INFECTION))
  if (!due.cure && !due.poison && !due.die) return

  const stamp = new Date().toISOString()
  const next: InfectionState = { ...rec }
  let conds = conditions

  if (due.cure) next.cured = true
  if (due.poison && !has(conds, POISONED)) conds = [...conds, POISONED]
  if (due.poison) next.poisoned_applied = true
  if (due.die) {
    conds = conditionsFor(conds, "dead")
    next.died = true
  }

  // THE CREATURE. Dead is the Dead condition at 0 hit points, the same pair
  // a massive-damage death writes, so the sheet, the card and the board's
  // grave all read it the way they already do. Token and sheet together.
  if (due.poison || due.die) {
    if (rec.character_id) {
      await db.from("characters")
        .update({ conditions: conds, ...(due.die ? { hp_current: 0 } : {}), updated_at: stamp })
        .eq("id", rec.character_id)
      if (due.die) {
        await db.from("vtt_tokens")
          .update({ hp_current: 0, updated_by: "gas-spore-infection", updated_at: stamp })
          .eq("character_id", rec.character_id)
      }
    } else {
      await db.from("npc_encounters")
        .update({ conditions: conds, ...(due.die ? { hp_current: 0 } : {}), updated_at: stamp })
        .eq("name", label)
      if (due.die) {
        await db.from("vtt_tokens")
          .update({ hp_current: 0, updated_by: "gas-spore-infection", updated_at: stamp })
          .eq("label", label)
          .is("character_id", null)
      }
    }
  }

  // THE CLOCK, marked first-time-only, so the next tick does not repeat it.
  const { error } = await db.from("world_flags")
    .update({ value: next, note: stepLines(label, due).join(" ") })
    .eq("campaign_id", "ashes-of-prometheus")
    .eq("key", key)
  if (error) console.error(`[gas-spore] clock for ${label} failed to save:`, error.message)

  // THE LOG, on the DM channel Malachar reads.
  for (const text of stepLines(label, due)) {
    await db.from("dialogue").insert({ speaker: "System", text, channel: "dm" })
  }
}
