// Level trials — what a character must do, besides earn the XP, to take a level.
//
// Sam, 2026-09-27:
//   "Magic for some users needs to be practiced for it to work and others a
//    scroll or text needs to be deciphered. For warlocks it may be a matter of
//    how close you are to getting your patron's favor. Going in the wrong
//    direction may lead to a random curse. For sorcerers it needs practice and
//    magic sometimes is randomly found based on your spells available for your
//    new level and spells close to your subclass are more likely to be
//    discovered. Clerics must, like warlocks, have favor from their deity but
//    are unlikely to be cursed. When you've met the criteria for level up a
//    Level Up box will appear … A summary at the end."
//
// Decisions (Sam, 2026-09-27, answering three questions):
//   • The gate is XP AND the class trial. XP stays the 5e table (lib/camp
//     levelUp owns that, and the HP, slots and pending choices).
//   • Progress shows as real bars on the Level Up page only. The character
//     sheet keeps the Earned Proficiency spec's faint mark (§6).
//   • Favor and curses: the DM decides each time. The engine tracks the favor
//     number the DM sets and says when a curse is due; it never picks one.
//
// HOMEBREW throughout — no book has class trials. The trial counts below are
// PROPOSED (marked in `flags`) until Sam sets them.
//
// Pure: rows in, words out. Every random draw takes an `Rng`.

import { XP_THRESHOLDS } from "./game-data"

export type Rng = () => number

export type TrialKind = "none" | "practice" | "decipher" | "favor"

/**
 * Which trial each class faces. Sam named sorcerer (practice), wizard
 * (decipher), warlock and cleric (favor). The rest are PROPOSED by analogy:
 * the other spontaneous casters practise, the paladin keeps an oath like a
 * cleric keeps faith, and classes without spells need only the XP.
 */
export const CLASS_TRIAL: Record<string, { kind: TrialKind; source: "Sam" | "PROPOSED"; of?: string }> = {
  sorcerer: { kind: "practice", source: "Sam" },
  wizard: { kind: "decipher", source: "Sam" },
  warlock: { kind: "favor", source: "Sam", of: "patron" },
  cleric: { kind: "favor", source: "Sam", of: "deity" },
  paladin: { kind: "favor", source: "PROPOSED", of: "oath" },
  bard: { kind: "practice", source: "PROPOSED" },
  druid: { kind: "practice", source: "PROPOSED" },
  ranger: { kind: "practice", source: "PROPOSED" },
  artificer: { kind: "decipher", source: "PROPOSED" },
  barbarian: { kind: "none", source: "PROPOSED" },
  fighter: { kind: "none", source: "PROPOSED" },
  monk: { kind: "none", source: "PROPOSED" },
  rogue: { kind: "none", source: "PROPOSED" },
}

/**
 * How much of the trial a level asks for. PROPOSED:
 *   practice — one evening of practice per level being reached (level 2: 2).
 *   decipher — one text deciphered or scroll copied since the last level.
 *   favor    — the DM's target; the default is the level being reached.
 */
export function trialTarget(kind: TrialKind, nextLevel: number): number {
  if (kind === "practice") return nextLevel
  if (kind === "decipher") return 1
  if (kind === "favor") return nextLevel
  return 0
}

export interface TrialSheet {
  id: string
  name: string
  class?: string | null
  subclass?: string | null
  level?: number | null
  xp?: number | null
  /** Tallies since the last level. The route derives them from the camp ledger. */
  practiceSinceLevel?: number | null
  decipheredSinceLevel?: number | null
  /** The DM's number. Negative for a warlock means the patron is displeased. */
  favor?: number | null
  /** The DM may set a target other than the default. */
  favorTarget?: number | null
  sheet_personality?: { faith?: string | null } | null
  patron?: string | null
}


export interface Bar { label: string; have: number; need: number; done: boolean; note?: string }

export interface TrialStatus {
  kind: TrialKind
  nextLevel: number | null
  xp: Bar | null
  trial: Bar | null
  /** Everything met: the Level Up box appears. */
  ready: boolean
  /** A warlock whose favor has gone below zero: the DM owes them a curse. */
  cursePending: boolean
  flags: string[]
  note: string
}

const clsOf = (c: TrialSheet) => (c.class ?? "").trim().toLowerCase()

export function trialStatus(c: TrialSheet): TrialStatus {
  const level = Math.max(1, Math.trunc(c.level ?? 1))
  const flags: string[] = []
  if (level >= 20) return { kind: "none", nextLevel: null, xp: null, trial: null, ready: false, cursePending: false, flags, note: `${c.name} is level 20.` }
  const next = level + 1
  const rule = CLASS_TRIAL[clsOf(c)] ?? { kind: "none" as TrialKind, source: "PROPOSED" as const }
  if (rule.source === "PROPOSED") flags.push(`${c.class ?? "This class"}'s trial (${rule.kind}) is PROPOSED — needs Sam's yes`)
  const xpHave = Math.max(0, Math.trunc(c.xp ?? 0))
  const xp: Bar = { label: "Experience", have: xpHave, need: XP_THRESHOLDS[next], done: xpHave >= XP_THRESHOLDS[next] }

  let trial: Bar | null = null
  let cursePending = false
  if (rule.kind === "practice") {
    const need = trialTarget("practice", next)
    const have = Math.max(0, Math.trunc(c.practiceSinceLevel ?? 0))
    trial = { label: "Practice", have, need, done: have >= need, note: "Evenings spent practising at camp." }
    flags.push("Practice target (one evening per level being reached) is PROPOSED")
  } else if (rule.kind === "decipher") {
    const have = Math.max(0, Math.trunc(c.decipheredSinceLevel ?? 0))
    trial = { label: "Study", have, need: 1, done: have >= 1, note: "Decipher a text or copy a scroll into the spellbook." }
    flags.push("Decipher target (one text per level) is PROPOSED")
  } else if (rule.kind === "favor") {
    const need = Math.max(1, Math.trunc(c.favorTarget ?? trialTarget("favor", next)))
    const have = Math.trunc(c.favor ?? 0)
    const who = rule.of === "patron" ? c.patron || "your patron" : rule.of === "deity" ? c.sheet_personality?.faith || "your god" : "your oath"
    trial = { label: `Favor of ${who}`, have, need, done: have >= need, note: "The DM sets this. Prayers, rites and deeds move it; so do betrayals." }
    // A warlock heading the wrong way is owed a curse; a cleric almost never is (Sam) — the DM may still rule one.
    cursePending = clsOf(c) === "warlock" && have < 0
  }
  const ready = xp.done && (trial ? trial.done : true)
  const parts = [xp.done ? "the XP is there" : `${xp.need - xp.have} XP to go`]
  if (trial) parts.push(trial.done ? `the ${trial.label.toLowerCase()} is met` : `${trial.label.toLowerCase()} ${trial.have}/${trial.need}`)
  return { kind: rule.kind, nextLevel: next, xp, trial, ready, cursePending, flags, note: `${c.name} → level ${next}: ${parts.join("; ")}.${cursePending ? " The patron is displeased — the DM owes a curse." : ""}` }
}

// ============================================================================
// Spell discovery — sorcerers (and, PROPOSED, the other practising casters)
// ============================================================================

export interface SpellRow { name: string; level: number; classes: string[]; school?: string | null }

/** SRD 5.2.1 subclass spell lists that exist in the SRD. Others: no affinity yet. */
export const SUBCLASS_AFFINITY: Record<string, string[]> = {
  "draconic sorcery": ["Alter Self", "Chromatic Orb", "Command", "Dragon's Breath", "Fear", "Fly", "Arcane Eye", "Charm Monster", "Legend Lore", "Summon Dragon"],
}
/** Spells close to the subclass are this many times likelier to surface. PROPOSED. */
export const AFFINITY_WEIGHT = 3

/** Highest spell level a full caster reaches at `level` (SRD 5.2.1 table). */
export const fullCasterMaxSpellLevel = (level: number) => Math.min(9, Math.ceil(level / 2))

/**
 * Offer `count` spells the character could learn at the new level, drawn at
 * random from the class list: never one they already have, never a UA spell,
 * no higher than they can cast, subclass spells weighted up. The player picks
 * from what surfaces — the draw is the "found", the choice stays theirs.
 */
export function discoverSpells(opts: {
  cls: string
  subclass?: string | null
  nextLevel: number
  known: string[]
  spells: SpellRow[]
  rng: Rng
  count?: number
  includeCantrips?: boolean
}): { offered: SpellRow[]; pool: number; flags: string[] } {
  const cls = opts.cls.trim().toLowerCase()
  const top = fullCasterMaxSpellLevel(opts.nextLevel)
  const have = new Set(opts.known.map((k) => k.toLowerCase()))
  const affinity = new Set((SUBCLASS_AFFINITY[(opts.subclass ?? "").toLowerCase()] ?? []).map((s) => s.toLowerCase()))
  const pool = opts.spells.filter((s) =>
    s.classes.some((c) => c.toLowerCase() === cls) &&
    !/\(UA\)/.test(s.name) &&
    !have.has(s.name.toLowerCase()) &&
    s.level <= top &&
    (opts.includeCantrips ? true : s.level >= 1),
  )
  const weighted = pool.map((s) => ({ s, w: affinity.has(s.name.toLowerCase()) ? AFFINITY_WEIGHT : 1 }))
  const offered: SpellRow[] = []
  const want = Math.min(opts.count ?? 3, weighted.length)
  while (offered.length < want) {
    const total = weighted.reduce((a, b) => a + b.w, 0)
    let r = opts.rng() * total
    const i = weighted.findIndex((x) => (r -= x.w) < 0)
    const [hit] = weighted.splice(i < 0 ? weighted.length - 1 : i, 1)
    offered.push(hit.s)
  }
  const flags = ["Spell discovery (three found, subclass spells ×3 likelier) is PROPOSED"]
  if (!affinity.size) flags.push(opts.subclass ? `No SRD spell list for ${opts.subclass} — no affinity weighting` : "No subclass yet — every spell equally likely")
  return { offered, pool: pool.length, flags }
}

// ============================================================================
// Favor — the DM's number, with the log line that goes with each change
// ============================================================================

export function adjustFavor(c: TrialSheet, delta: number, reason: string): { favor: number; cursePending: boolean; note: string } {
  const favor = Math.trunc(c.favor ?? 0) + Math.trunc(delta)
  const cls = clsOf(c)
  const who = cls === "warlock" ? c.patron || "the patron" : c.sheet_personality?.faith || "the god"
  const cursePending = cls === "warlock" && favor < 0
  const dir = delta > 0 ? "rises" : delta < 0 ? "falls" : "holds"
  return { favor, cursePending, note: `${c.name}'s favor with ${who} ${dir} to ${favor} — ${reason}.${cursePending ? " The DM owes a curse." : ""}` }
}
