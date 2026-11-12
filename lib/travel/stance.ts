// lib/travel/stance.ts — the encounter box: what the party may DO when the dice put creatures on the road.
//
// Sam, 2026-11-12: "We need the encounter boxes at each node which should take from DND 5E and Solasta 2."
// Then "go" to the proposed box: what you see, the passive-roll chip, and choices with their checks shown.
//
// WHETHER creatures are here is the book's (lib/travel/arrival.ts). WHO SAW WHOM FIRST is the passive roll's
// (lib/travel/meeting.ts). This file is the third step: the choices that verdict leaves open, and what each
// one comes to. Every choice is a 5E rule or the book's own text, and each says which:
//
//   TALK       Only for creatures the book describes as people you can speak with. What is said, and what
//              comes of it, is the table's and Malachar's: no check is rolled here.
//   SLIP PAST  Only when the party saw them first. A GROUP Dexterity (Stealth) check (SRD: the group succeeds
//              when at least half its members do) against the watchers' highest passive Perception, read
//              from their stat block. Only at a SLOW pace: the book lets a party move stealthily at no other
//              (OotA-Enc ch.2 p.24). Fail and they notice the party; nobody is surprised.
//   AMBUSH     Only when the party saw them first. A fight, and THEY are surprised.
//   FIGHT      A fight. When they saw the party first, the PARTY is surprised (meeting.ts).
//
// "Surprised" is SRD 5.2.1, this campaign's canon: Disadvantage on the Initiative roll.
//
// What is deliberately NOT here yet, and why:
//   * Run / go around: fleeing creatures that have seen you is a matter of the fight itself (Dash, Disengage)
//     and going around has no published cost. Both wait for the fight hand-off and Sam's ruling on pursuit.
//   * A Charisma check on Talk: the reaction DCs are the DMG's, which is not loaded into this game.
//   * Manner for Escaped slaves, Scouts and Traders: the book decides each by a further roll this game does
//     not make yet, so the box says nothing about their manner rather than guess.
//
// Pure. The route (app/api/travel/route.ts, action "stance") loads the sheets and stat blocks and stores the
// result on the open halt. Nothing here invents a creature, a number or an attitude.

import type { RolledStep } from "./arrival"
import { CREATURE_TABLES, type Meeting } from "./meeting"
import type { Pace, Rng } from "./march"
import { resolveSkillCheck, type SheetSlice } from "../game-context"

export const STANCE_SOURCE =
  "Group Dexterity (Stealth) check vs passive Perception (SRD, Ability Checks: Group Checks; Hiding); stealth only at a slow pace (OotA-Enc ch.2 p.24); surprise per SRD 5.2.1 (Disadvantage on Initiative). Box: Sam, 2026-11-12."

export type Manner = "hostile" | "peaceable"

/** What the book itself says about a result on the creature tables. Keyed by the row's own text, lower case. */
const BOOK: Record<string, { manner: Manner | null; talks: boolean; line: string | null }> = {
  raiders: { manner: "hostile", talks: true, line: "Initially hostile, though they might be bribed for safe passage or information (OotA ch.2, Raiders)." },
  "society of brilliance": { manner: "peaceable", talks: true, line: "Erudite and talkative; prefers diplomacy and debate over violence, but defends itself if attacked (OotA ch.2, Society of Brilliance)." },
  "escaped slaves": { manner: null, talks: true, line: null },
  scouts: { manner: null, talks: true, line: null },
  traders: { manner: null, talks: true, line: null },
}
const AMBUSH_LINE = "Lying in wait to ambush the party (OotA ch.2, Ambushers)."

export interface Foe {
  /** The row as the book prints it: "1d4 orogs perching on ledges". */
  result: string
  table_key: string
  /** The linked stat block's name, when the row has one. */
  bestiary: string | null
  /** Its passive Perception, read from the stat block. Null when no stat block is linked. */
  passive: number | null
  manner: Manner | null
  talks: boolean
  /** The book's own words on how it behaves, with the page; null when the book leaves it to a further roll. */
  line: string | null
}

/** "darkvision 60 ft., passive Perception 12" -> 12. Null when the stat block does not say. */
export function passiveFromSenses(senses: string | null | undefined): number | null {
  const m = /passive perception\s+(\d+)/i.exec(String(senses ?? ""))
  return m ? Number(m[1]) : null
}

/**
 * The creatures the dice named, from the rolled steps. A row that only sends you on to another table
 * ("Ambushers") is not a creature. `senses` maps a stat block's name to its senses line.
 */
export function foesOf(rolls: readonly Pick<RolledStep, "table_key" | "result" | "detail">[] | null | undefined, senses: Readonly<Record<string, string | null | undefined>>): Foe[] {
  const out: Foe[] = []
  for (const r of rolls ?? []) {
    if (!CREATURE_TABLES.includes(r.table_key)) continue
    const d = (r.detail ?? {}) as Record<string, unknown>
    if (Array.isArray(d.rolls) && d.rolls.length) continue
    const bestiary = typeof d.bestiary === "string" && d.bestiary.trim() ? d.bestiary.trim() : null
    const book = BOOK[r.result.trim().toLowerCase()]
    const ambush = r.table_key === "underdark_ambush"
    out.push({
      result: r.result,
      table_key: r.table_key,
      bestiary,
      passive: bestiary ? passiveFromSenses(senses[bestiary]) : null,
      manner: ambush ? "hostile" : book?.manner ?? null,
      talks: !ambush && !!book?.talks,
      line: ambush ? AMBUSH_LINE : book?.line ?? null,
    })
  }
  return out
}

export type StanceKey = "talk" | "slip_past" | "ambush" | "fight"

export interface StanceOption {
  key: StanceKey
  label: string
  /** One line under the label: what it is and what it risks. */
  detail: string
  /** The check, in words, when the choice rolls one. */
  check: string | null
  available: boolean
  /** Why not, when unavailable. Shown on the disabled row. */
  blocked: string | null
}

/**
 * The choices open right now. `spotted` is true once a Slip past has failed: the party is seen, nobody is
 * surprised, and what is left is to talk or to fight.
 */
export function stanceOptions(input: { first: Meeting["first"]; foes: readonly Foe[]; pace: Pace; spotted?: boolean }): StanceOption[] {
  const { foes, pace } = input
  if (!foes.length) return []
  const partyFirst = input.first === "party" && !input.spotted
  const talkers = foes.some((f) => f.talks)
  const out: StanceOption[] = []
  if (talkers) {
    out.push({
      key: "talk",
      label: partyFirst ? "Hail them" : "Talk fast",
      detail: partyFirst ? "Step out and speak. They will know you are here." : "They have seen you. Speak before anyone draws.",
      check: null,
      available: true,
      blocked: null,
    })
  }
  if (partyFirst) {
    const unknown = foes.filter((f) => f.passive == null)
    const dc = unknown.length ? null : Math.max(...foes.map((f) => f.passive as number))
    const blocked = pace !== "slow" ? "Only at a slow pace: a party cannot move stealthily at any other (p.24)." : unknown.length ? "No stat block is linked for these yet, so their passive Perception is not known." : null
    out.push({
      key: "slip_past",
      label: "Slip past",
      detail: "Everyone moves quietly. Fail and they notice you; nobody is surprised.",
      check: dc != null ? `Group Stealth vs passive Perception ${dc}: at least half the party must succeed` : "Group Stealth vs their passive Perception",
      available: !blocked,
      blocked,
    })
    out.push({ key: "ambush", label: "Ambush them", detail: "Strike first. It is a fight, and they are surprised: Disadvantage on Initiative.", check: null, available: true, blocked: null })
  } else {
    const surprised = input.first === "them" && !input.spotted
    out.push({
      key: "fight",
      label: "Stand and fight",
      detail: surprised ? "It is a fight, and the party is surprised: Disadvantage on Initiative." : "It is a fight. Nobody is surprised.",
      check: null,
      available: true,
      blocked: null,
    })
  }
  return out
}

export interface StanceCheck {
  name: string
  total: number
  success: boolean
  arithmetic: string
}

export interface StanceResult {
  key: StanceKey
  /** What it came to: a fight, talk at the table, past them unseen, or seen while sneaking. */
  outcome: "fight" | "parley" | "passed" | "spotted"
  /** Who starts a fight surprised, if it comes to one now. */
  surprised: "party" | "them" | null
  /** The DC the group rolled against, when a check was made. */
  dc: number | null
  checks: StanceCheck[]
  text: string
  source: string
}

/**
 * Resolve the choice. Returns null when the key is not open right now (not offered, or blocked), so the
 * route can refuse it: the same gate the card drew.
 */
export function resolveStance(key: string, input: { meeting: Pick<Meeting, "first" | "surprised">; foes: readonly Foe[]; pace: Pace; party: readonly SheetSlice[]; spotted?: boolean }, rng: Rng): StanceResult | null {
  const open = stanceOptions({ first: input.meeting.first, foes: input.foes, pace: input.pace, spotted: input.spotted }).find((o) => o.key === key)
  if (!open || !open.available) return null
  const base = { key: open.key, dc: null as number | null, checks: [] as StanceCheck[], source: STANCE_SOURCE }
  if (open.key === "talk") {
    return { ...base, outcome: "parley", surprised: null, text: "The party speaks. What is said, and what comes of it, is settled at the table. If it turns to a fight now, nobody is surprised." }
  }
  if (open.key === "ambush") {
    return { ...base, outcome: "fight", surprised: "them", text: "The party strikes from the dark. It is a fight, and they are surprised: Disadvantage on Initiative." }
  }
  if (open.key === "fight") {
    const surprised = input.spotted ? null : input.meeting.surprised
    return { ...base, outcome: "fight", surprised, text: surprised === "party" ? "It is a fight, and the party is surprised: Disadvantage on Initiative." : "It is a fight. Nobody is surprised." }
  }
  // slip_past
  if (!input.party.length) return null
  const dc = Math.max(...input.foes.map((f) => f.passive as number))
  const checks: StanceCheck[] = input.party.map((s) => {
    const c = resolveSkillCheck(s, "stealth", dc, rng)
    return { name: s.name, total: c.total, success: c.success, arithmetic: c.arithmetic }
  })
  const passed = checks.filter((c) => c.success).length * 2 >= checks.length
  return {
    ...base,
    dc,
    checks,
    outcome: passed ? "passed" : "spotted",
    surprised: null,
    text: passed
      ? `${checks.filter((c) => c.success).length} of ${checks.length} keep quiet, and that is enough. The party is past them unseen.`
      : `Only ${checks.filter((c) => c.success).length} of ${checks.length} keep quiet. They notice the party. Nobody is surprised.`,
  }
}
