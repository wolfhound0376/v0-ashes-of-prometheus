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

import { GAS_SPORE_INFECTION, addMinutes, formatClock, type ClockTime, type InfectionRecord } from "./death-burst"
import { normalizeConditions } from "./conditions"
import { DEAD, conditionsFor } from "./death-saves"

export const POISONED = "Poisoned"

/** The record as stored, plus what this clock has already done to it. */
export interface InfectionState extends InfectionRecord {
  poisoned_applied?: boolean
  died?: boolean
  cured?: boolean
  /** What grew from the body, once it died ("sprouts 2d4 Tiny gas spores"). */
  sprouted?: SproutState
}

/** The Tiny gas spores growing from a body the infection was in. */
export interface SproutState {
  count: number
  dice: string
  /** When they are full-size gas spores; null when the death could not be dated. */
  matures_at: ClockTime | null
  matured?: boolean
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

/** Roll "NdM" with `rng`. 0 for anything that is not dice. */
export function rollSpec(spec: string, rng: () => number = Math.random): number {
  const m = spec.trim().match(/^(\d+)d(\d+)$/i)
  if (!m) return 0
  let total = 0
  for (let i = 0; i < Number(m[1]); i++) total += 1 + Math.floor(rng() * Number(m[2]))
  return total
}

/**
 * THE BODY SPROUTS. "After the creature dies, it sprouts 2d4 Tiny gas spores
 * that grow to full size in 7 days." Any death: the disease's own, or a blade
 * that got there first. `at` is when it died; null when that cannot be dated,
 * and then only the days are known. Null when the record carries no sprouts.
 */
export function sproutFrom(rec: InfectionState, at: ClockTime | null, rng: () => number = Math.random): SproutState | null {
  const sp = rec.sprouts
  if (!sp) return null
  return { count: rollSpec(sp.dice, rng), dice: sp.dice, matures_at: at ? addMinutes(at, sp.days * 1440) : null }
}

/** Are the sprouts full-grown at `now`? Never for undated ones: no start, no finish. */
export function sproutsMature(s: SproutState | undefined, now: ClockTime): boolean {
  return Boolean(s && !s.matured && s.count > 0 && s.matures_at && absMinutes(now) >= absMinutes(s.matures_at))
}

/** The log lines for the sprouting, and for the day they are grown. */
export function sproutLine(label: string, s: SproutState, days: number): string {
  if (s.count <= 0) return `Nothing grows from ${label}'s body.`
  const when = s.matures_at ? `by ${formatClock(s.matures_at)}` : `in ${days} days (the death could not be dated, so the system will not mark it)`
  return `${s.count} Tiny gas spores (${s.dice} ${s.count}) sprout from ${label}'s body; they will be full-grown gas spores ${when}.`
}
export function maturedLine(label: string, s: SproutState): string {
  return `The ${s.count} gas spores that sprouted from ${label}'s body are full-grown.`
}

/**
 * Apply every infection that is owed something at `now`.
 *
 * Best-effort, like the rest of the clock: an exception here is logged and
 * swallowed, because the time already moved and the turn must not fail over
 * a side effect of it. Never silent, though: the console names the creature.
 */
export async function advanceGasSporeInfections(db: any, now: ClockTime, rng: () => number = Math.random): Promise<void> {
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
    if (!rec || rec.cured) continue
    // A body that has died is only still owed its sprouts growing up.
    if (rec.died && !(rec.sprouted && !rec.sprouted.matured)) continue
    try {
      await advanceOne(db, flag.key, rec, now, rng)
    } catch (e) {
      console.error(`[gas-spore] clock for ${rec.creature} threw:`, e)
    }
  }
}

/** Save the record and say what happened, in that order. */
async function record(db: any, key: string, next: InfectionState, lines: string[]) {
  const { error } = await db.from("world_flags")
    .update({ value: next, note: lines.join(" ") })
    .eq("campaign_id", "ashes-of-prometheus")
    .eq("key", key)
  if (error) console.error(`[gas-spore] clock for ${next.creature} failed to save:`, error.message)
  for (const text of lines) {
    await db.from("dialogue").insert({ speaker: "System", text, channel: "dm" })
  }
}

/** Sprout from a death at `at`, and grow them up at once if `now` is already past it. */
function sprout(next: InfectionState, at: ClockTime | null, now: ClockTime, rng: () => number, lines: string[]) {
  const s = sproutFrom(next, at, rng)
  if (!s) return
  next.sprouted = s
  lines.push(sproutLine(next.creature, s, next.sprouts?.days ?? 0))
  if (sproutsMature(s, now)) {
    next.sprouted = { ...s, matured: true }
    lines.push(maturedLine(next.creature, s))
  }
}

async function advanceOne(db: any, key: string, rec: InfectionState, now: ClockTime, rng: () => number) {
  const label = rec.creature

  // ALREADY DEAD: only the sprouts are left to grow.
  if (rec.died) {
    if (sproutsMature(rec.sprouted, now)) {
      const grown = { ...rec.sprouted!, matured: true }
      await record(db, key, { ...rec, sprouted: grown }, [maturedLine(label, grown)])
    }
    return
  }

  // The creature's conditions where they live: the sheet for a player, the
  // encounter row (by name, as all NPC canon is) for anything else.
  const conditions = rec.character_id
    ? normalizeConditions((await db.from("characters").select("conditions").eq("id", rec.character_id).maybeSingle()).data?.conditions)
    : normalizeConditions((await db.from("npc_encounters").select("conditions").eq("name", label).limit(1).maybeSingle()).data?.conditions)

  // DEAD OF SOMETHING ELSE, with the spores still in them. The trait says
  // "after the creature dies", not "after the disease kills it", so the body
  // sprouts all the same — from now, the first moment the clock saw it.
  if (has(conditions, DEAD) && has(conditions, GAS_SPORE_INFECTION)) {
    const next: InfectionState = { ...rec, died: true }
    const lines = [`${label} died with the spores still in them.`]
    sprout(next, now, now, rng, lines)
    await record(db, key, next, lines)
    return
  }

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

  // THE CLOCK, marked first-time-only so the next tick does not repeat it,
  // and THE LOG, on the DM channel Malachar reads. A death sprouts the body,
  // dated from the deadline it died at.
  const lines = stepLines(label, due)
  if (due.die) sprout(next, rec.dies_at, now, rng, lines)
  await record(db, key, next, lines)
}

// ============================================================================
// THE COUNTDOWN, FOR MALACHAR'S EYES
//
// The log tells him each step as it happens; this tells him what is coming,
// every turn, beside the world clock in his prompt. It is the same record the
// clock above keeps — nothing here decides anything, it only reads it out.
//
// DM-only, like the clock it sits beside: the players see symptoms, never the
// hours. And it says plainly that the system lays Poisoned and death itself,
// so Malachar never emits a tag that would double them.
// ============================================================================

/** "6h 30m", "45m", "2h". */
export function formatSpan(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const r = m % 60
  if (d) return h ? `${d}d ${h}h` : `${d}d`
  if (!h) return `${r}m`
  return r ? `${h}h ${r}m` : `${h}h`
}

/** One line per infection still running. Finished ones are left out. */
export function countdownLines(records: InfectionState[], now: ClockTime | null): string[] {
  const out: string[] = []
  for (const r of records) {
    if (!r || r.cured) continue
    if (r.died) {
      // What grows from the body, until it is grown.
      const s = r.sprouted
      if (!s || s.matured || s.count <= 0) continue
      out.push(s.matures_at && now
        ? `- ${s.count} Tiny gas spores growing from ${r.creature}'s body — full-grown gas spores in ${formatSpan(absMinutes(s.matures_at) - absMinutes(now))}.`
        : `- ${s.count} Tiny gas spores growing from ${r.creature}'s body — full-grown in ${r.sprouts?.days ?? "?"} days from the death (undated).`)
      continue
    }
    const who = `- ${r.creature}: ${GAS_SPORE_INFECTION}`
    if (!r.dies_at || !now) {
      // Undated: caught while no campaign clock ran. The hours are known; the
      // start is not, and it is not invented here.
      out.push(`${who} — ${r.hours} hours from infection (1d12 ${r.d12} + CON ${r.con_score}); start time unknown, so the system will not apply it. Pace it yourself.`)
      continue
    }
    const t = absMinutes(now)
    const left = absMinutes(r.dies_at) - t
    const poison = r.poisoned_applied || !r.poisoned_at
      ? (r.poisoned_applied ? "already poisoned" : null)
      : absMinutes(r.poisoned_at) - t > 0
        ? `poisoned in ${formatSpan(absMinutes(r.poisoned_at) - t)}`
        : "poisoned now"
    out.push(`${who} — dies in ${formatSpan(left)} unless the disease is removed${poison ? `; ${poison}` : ""}.`)
  }
  return out
}

/** The block for Malachar's system prompt, or "" when nobody is infected. */
export function formatInfectionBlock(records: InfectionState[], now: ClockTime | null): string {
  const lines = countdownLines(records, now)
  if (!lines.length) return ""
  return `════════════════════════════════════════════════════════════════════
DISEASES IN PROGRESS (DM's eyes only — never state hours, deadlines or the clock to players)
════════════════════════════════════════════════════════════════════
${lines.join("\n")}
Let the infected feel it as the time runs down — show symptoms, never numbers.
The system applies Poisoned at halfway and death at the deadline on its own:
do NOT emit [CONDITION_ADD] for either. If the disease is truly removed in the
fiction, emit [CONDITION_REMOVE: <name> | ${GAS_SPORE_INFECTION}] and the clock stops.
Tiny gas spores growing from a body have no stat block of their own; they are
where the body lies, and the log says when they are full-grown gas spores.`
}

/** Read every infection record and build the block. Best-effort: "" on failure. */
export async function loadInfectionBlock(db: any, now: ClockTime | null): Promise<string> {
  try {
    const { data, error } = await db
      .from("world_flags")
      .select("key,value")
      .eq("campaign_id", "ashes-of-prometheus")
      .like("key", "gas-spore-infection:%")
    if (error) {
      console.error("[gas-spore] countdown unreadable:", error.message)
      return ""
    }
    return formatInfectionBlock(((data ?? []) as { value: InfectionState }[]).map((f) => f.value), now)
  } catch (e) {
    console.error("[gas-spore] countdown threw:", e)
    return ""
  }
}
