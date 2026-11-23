// lib/travel/road-traps.ts — the hidden traps on a stretch of the pixel road.
//
// Sam, 2026-11-23: "There should be occasional skeletons, skulls, traps hidden that we might step on, pits, etc. Make
// sure we are following DND rules regarding this."
//
// THE BOOK (SRD 5.1, Gamemastering: Traps; Supabase campaign_books slug srd-5-1):
//   - Detecting: "compare the DC to detect the trap with each character's passive Wisdom (Perception) score to
//     determine whether anyone in the party notices the trap in passing."
//   - Simple Pit: "The DC to spot the pit is 10." Anyone stepping on the cover falls in; damage by the pit's depth
//     ("usually 10 feet").
//   - Hidden Pit: "A successful DC 15 Wisdom (Perception) check" notices it. The cover swings open under whoever steps
//     on it; "usually 10 or 20 feet deep".
//   - Spiked Pit: a pit with spikes: "takes 11 (2d10) piercing damage from the spikes, in addition to any falling damage".
//   - Falling Net: "The DC to spot the trip wire and net is 10." Those in the 10-foot square are restrained, and "those
//     that fail a DC 10 Strength saving throw are also knocked prone". "A creature can use its action to make a DC 10
//     Strength check, freeing itself or another creature within its reach on a success."
//   - Falling (The Environment): "1d6 bludgeoning damage for every 10 feet it fell", landing prone.
//   - Travel pace (PHB/SRD): a fast pace is -5 to passive Wisdom (Perception) (lib/travel/march.ts PACES).
//   Collapsing Roof (4d10, "deadly" at levels 1-4 by the SRD's own severity table) and poison-smeared spikes are left
//   out: a random road trap at these levels stays a setback or dangerous, never deadly.
//
// [HOUSE] — Claude's calls inside those rules, open to Sam's overrule:
//   - HOW MANY: 1d4 - 1 traps on each stretch (0 to 3), spread along the party's way between 15% and 90% of it.
//   - WHICH: d6 — 1-2 simple pit, 3-4 hidden pit, 5 falling net, 6 hidden spiked pit. Every pit is 10 feet deep.
//   - A trap someone notices is passed safely (the party edges round it, wedges the cover or steps over the wire):
//     nobody is hurt and it costs no time on the road.
//   - The hero who steps on an unnoticed pit is whoever reaches it first (on the road, the leader).
//   - Climbing out of a 10-foot pit takes no check.
//
// The game rolls every die here, before the stretch is walked; the road page only places the traps and shows the
// result. Pure: a roller in, data out.

export type RoadTrapKind = "simple-pit" | "hidden-pit" | "spiked-pit" | "net"

export interface RoadTrapRule {
  kind: RoadTrapKind
  title: string
  /** The DC to notice it (passive Perception at least this). */
  spotDC: number
  /** Falling damage dice for a 10-foot pit, and any spikes. */
  fall: string | null
  spikes: string | null
  /** Falling net: the Strength save against prone, and the Strength check to cut free. */
  netSaveDC: number | null
  netFreeDC: number | null
  source: string
}

const SRD = "SRD 5.1, Traps"
export const ROAD_TRAP_RULES: Readonly<Record<RoadTrapKind, RoadTrapRule>> = {
  "simple-pit": { kind: "simple-pit", title: "Simple pit", spotDC: 10, fall: "1d6", spikes: null, netSaveDC: null, netFreeDC: null, source: `${SRD}: Simple Pit; Falling` },
  "hidden-pit": { kind: "hidden-pit", title: "Hidden pit", spotDC: 15, fall: "1d6", spikes: null, netSaveDC: null, netFreeDC: null, source: `${SRD}: Hidden Pit; Falling` },
  "spiked-pit": { kind: "spiked-pit", title: "Spiked pit", spotDC: 15, fall: "1d6", spikes: "2d10", netSaveDC: null, netFreeDC: null, source: `${SRD}: Hidden Pit, Spiked Pit; Falling` },
  net: { kind: "net", title: "Falling net", spotDC: 10, fall: null, spikes: null, netSaveDC: 10, netFreeDC: 10, source: `${SRD}: Falling Net` },
}

/** [HOUSE] d6 -> which trap. */
export function trapForD6(n: number): RoadTrapKind {
  return n <= 2 ? "simple-pit" : n <= 4 ? "hidden-pit" : n === 5 ? "net" : "spiked-pit"
}

export type Roll = (sides: number) => number
export const d = (sides: number, rand: () => number = Math.random): number => 1 + Math.floor(rand() * sides)

function rollDice(expr: string, roll: Roll): { faces: number[]; total: number } {
  const m = /^(\d+)d(\d+)$/.exec(expr)
  if (!m) return { faces: [], total: 0 }
  const faces = Array.from({ length: Number(m[1]) }, () => roll(Number(m[2])))
  return { faces, total: faces.reduce((a, b) => a + b, 0) }
}

export interface RoadTrap extends RoadTrapRule {
  /** How far along the party's way it lies, 0..1. */
  at: number
  /** The dice the game rolled for it (shown with their faces when it springs). */
  fallRoll: { faces: number[]; total: number } | null
  spikesRoll: { faces: number[]; total: number } | null
  /** Falling net: d20s for the Strength saves (one per hero caught, in order) and for the freeing checks. */
  d20s: number[]
  /** Who in the party notices it in passing (best passive Perception at or over the DC), or null. */
  seenBy: { slug: string; name: string; passive: number } | null
  /** The rolls that placed it, for the record. */
  placed: { kindD6: number }
}

export interface Senser {
  slug: string
  name: string
  /** Passive Perception from the sheet, before the pace. */
  pp: number | null
}

/** The party's best passive Perception against a DC (SRD: anyone in the party may notice a trap in passing). */
export function noticedBy(spotDC: number, party: readonly Senser[], penalty = 0): RoadTrap["seenBy"] {
  let best: RoadTrap["seenBy"] = null
  for (const m of party) {
    if (m.pp == null) continue
    const passive = m.pp + penalty
    if (passive >= spotDC && (!best || passive > best.passive)) best = { slug: m.slug, name: m.name, passive }
  }
  return best
}

/** Every trap on this stretch, rolled. `penalty` is the pace's passive Perception modifier (fast: -5). */
export function rollRoadTraps(party: readonly Senser[], penalty: number, roll: Roll): RoadTrap[] {
  const count = roll(4) - 1
  const out: RoadTrap[] = []
  for (let i = 0; i < count; i++) {
    const kindD6 = roll(6)
    const rule = ROAD_TRAP_RULES[trapForD6(kindD6)]
    // spread along the way, each in its own slice so two traps never sit on top of each other
    const lo = 0.15 + (0.75 * i) / count, hi = 0.15 + (0.75 * (i + 1)) / count
    out.push({
      ...rule,
      at: Math.round((lo + (hi - lo) * (0.2 + 0.6 * (roll(100) / 100))) * 1000) / 1000,
      fallRoll: rule.fall ? rollDice(rule.fall, roll) : null,
      spikesRoll: rule.spikes ? rollDice(rule.spikes, roll) : null,
      d20s: rule.kind === "net" ? Array.from({ length: 12 }, () => roll(20)) : [],
      seenBy: noticedBy(rule.spotDC, party, penalty),
      placed: { kindD6 },
    })
  }
  return out
}

/** The damage a pit deals, by type, as the SRD adds it: falling (bludgeoning) plus spikes (piercing). */
export function pitDamage(t: Pick<RoadTrap, "fallRoll" | "spikesRoll">): { type: string; amount: number }[] {
  const out: { type: string; amount: number }[] = []
  if (t.fallRoll?.total) out.push({ type: "bludgeoning", amount: t.fallRoll.total })
  if (t.spikesRoll?.total) out.push({ type: "piercing", amount: t.spikesRoll.total })
  return out
}
