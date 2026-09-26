// Earned skill proficiency — the engine counts, the engine awards.
//
// Decision of record: docs/claude_Earned_Proficiency.md (approved 2026-09-26).
// Read it first; this file is the rules in that document and nothing the
// document does not say. HOMEBREW, Sam's call: 5e has no rule for earning a
// skill proficiency through play, and nothing here may be presented to players
// as a book rule.
//
// Three paths, all for a skill the character is NOT already proficient in
// (expertise is a different, undesigned mechanic and is never touched here):
//
//   practice   8 meaningful successes — DC >= 10 and a fresh stake (one success
//              per stake_key per campaign day)
//   talent     2 natural 20s on the kept die within 7 campaign days, any DC
//   teaching   40 campaign hours with a teacher who has the proficiency, then
//              one check at DC 12
//
// The numbers live in skill_progress_rules; DEFAULT_RULES mirrors the seeded
// rows so the module can be tested without the table, and the route passes
// the live rows so Sam's edits win.
//
// Pure, like lib/camp and lib/game-context. Rows in, rows out. The resolve
// route owns the database; this file owns the rule. The ledger is append-only
// and the award is DERIVED from it — `evaluate` recomputes the answer from
// the rows every time and nothing here stores a counter. Malachar never sees
// the tally and has no tag that can touch it: the only thing that reaches his
// prompt is the one PROFICIENCY EARNED line when an award fires.

import {
  SKILL_ABILITY,
  abilityMod,
  normaliseSkill,
  proficiency,
  scoreFor,
  skillProficiency,
  type SheetSlice,
  type Skill,
} from "./game-context"
import type { RelationshipEventRow } from "./camp"

export type SkillProgressPath = "practice" | "talent" | "teaching"
export type SkillProgressKind = "success" | "crit" | "training_hours" | "award"

/** One row of skill_progress_rules. `source` is documentation, not logic. */
export interface ProgressRule {
  path: SkillProgressPath
  threshold: number
  window_days: number | null
  min_dc: number | null
}

/** Mirror of the seeded rows in 20260926120000_earned_proficiency.sql. The database wins when it is available. */
export const DEFAULT_RULES: readonly ProgressRule[] = [
  { path: "practice", threshold: 8, window_days: null, min_dc: 10 },
  { path: "talent", threshold: 2, window_days: 7, min_dc: null },
  { path: "teaching", threshold: 40, window_days: null, min_dc: 12 },
]

/** stake_key prefix that marks the teaching path's final check. */
export const TEACHING_STAKE_PREFIX = "teaching:"

/**
 * One skill_progress row, as written or as read back. `id` and `created_at`
 * are the database's; the module never needs them.
 */
export interface LedgerRow {
  character_id: string
  skill: Skill
  kind: SkillProgressKind
  /** hours for training_hours; 1 otherwise */
  amount: number
  dc: number | null
  stake_key: string | null
  teacher_id: string | null
  campaign_day: number
  roll_request_id: string | null
}

/** A skill check the engine has already resolved — from the roll ledger or from resolveInteraction. */
export interface ResolvedCheck {
  characterId: string
  skill: Skill
  /** Null when Malachar named no DC: success cannot be judged, a natural 20 still counts. */
  dc: number | null
  /** The KEPT d20 face. Under advantage/disadvantage the caller passes the face that counted. */
  keptDie: number
  total: number
  campaignDay: number
  /** What the check was against — interaction key or roll purpose. Freshness is judged on it. */
  stakeKey: string | null
  rollRequestId?: string | null
}

export type SkipReason =
  | "already_proficient"
  | "already_awarded"
  | "no_dc"
  | "failed"
  | "dc_below_minimum"
  | "stale_stake"
  | "teaching_hours_not_banked"
  | "teaching_dc_below_minimum"
  | "teacher_not_proficient"
  | "teacher_is_student"
  | "no_hours"
  | "not_a_natural_20"

export interface RecordDecision {
  /** Rows to append — zero, one or two. Never a counter. */
  rows: LedgerRow[]
  /** Why something was not counted. Readable, so the route can log it and Sam can read the log. */
  skipped: SkipReason[]
}

const ruleFor = (rules: readonly ProgressRule[], path: SkillProgressPath): ProgressRule =>
  rules.find((r) => r.path === path) ?? DEFAULT_RULES.find((r) => r.path === path)!

const isTeachingStake = (stake: string | null) => !!stake && stake.startsWith(TEACHING_STAKE_PREFIX)

const forSkill = (ledger: readonly LedgerRow[], characterId: string, skill: Skill) =>
  ledger.filter((r) => r.character_id === characterId && r.skill === skill)

const hoursBanked = (rows: readonly LedgerRow[]) =>
  rows.filter((r) => r.kind === "training_hours").reduce((sum, r) => sum + r.amount, 0)

// ---------------------------------------------------------------------------
// recordCheck — which rows does one resolved check append?
// ---------------------------------------------------------------------------

export function recordCheck(
  check: ResolvedCheck,
  sheet: SheetSlice,
  ledger: readonly LedgerRow[],
  rules: readonly ProgressRule[] = DEFAULT_RULES,
): RecordDecision {
  const rows: LedgerRow[] = []
  const skipped: SkipReason[] = []
  const mine = forSkill(ledger, check.characterId, check.skill)

  // §1: only a skill the character is not already proficient in. Expertise is
  // not on this ladder either way.
  if (skillProficiency(sheet, check.skill) !== "none") return { rows, skipped: ["already_proficient"] }
  if (mine.some((r) => r.kind === "award")) return { rows, skipped: ["already_awarded"] }

  const base = {
    character_id: check.characterId,
    skill: check.skill,
    dc: check.dc,
    stake_key: check.stakeKey,
    teacher_id: null,
    campaign_day: check.campaignDay,
    roll_request_id: check.rollRequestId ?? null,
  }

  // Path B — "talent is talent": a natural 20 on the kept die counts at any DC,
  // even when the check itself fell short.
  if (check.keptDie === 20) rows.push({ ...base, kind: "crit", amount: 1 })
  else skipped.push("not_a_natural_20")

  // Path A / Path C's final check — a success against a real DC.
  if (check.dc == null) {
    skipped.push("no_dc")
  } else if (check.total < check.dc) {
    skipped.push("failed")
  } else if (isTeachingStake(check.stakeKey)) {
    const teaching = ruleFor(rules, "teaching")
    if (hoursBanked(mine) < teaching.threshold) skipped.push("teaching_hours_not_banked")
    else if (teaching.min_dc != null && check.dc < teaching.min_dc) skipped.push("teaching_dc_below_minimum")
    else rows.push({ ...base, kind: "success", amount: 1 })
  } else {
    const practice = ruleFor(rules, "practice")
    // §7: a DC 5 check teaches nothing.
    if (practice.min_dc != null && check.dc < practice.min_dc) skipped.push("dc_below_minimum")
    // §7 freshness: the same lock, the same guard, the same beast — once per
    // campaign day. A check with no stake at all is held to the same bar
    // against the other un-staked successes that day: without a key there is
    // nothing to prove it was a different lock.
    else if (
      mine.some(
        (r) => r.kind === "success" && r.campaign_day === check.campaignDay && (r.stake_key ?? "") === (check.stakeKey ?? ""),
      )
    )
      skipped.push("stale_stake")
    else rows.push({ ...base, kind: "success", amount: 1 })
  }

  return { rows, skipped }
}

// ---------------------------------------------------------------------------
// recordTraining — hours with a teacher (camp only; the caller owns the clock)
// ---------------------------------------------------------------------------

export interface TrainingSession {
  characterId: string
  skill: Skill
  teacher: SheetSlice
  hours: number
  campaignDay: number
}

export function recordTraining(
  session: TrainingSession,
  student: SheetSlice,
  ledger: readonly LedgerRow[],
): RecordDecision {
  const mine = forSkill(ledger, session.characterId, session.skill)
  if (skillProficiency(student, session.skill) !== "none") return { rows: [], skipped: ["already_proficient"] }
  if (mine.some((r) => r.kind === "award")) return { rows: [], skipped: ["already_awarded"] }
  // §7: the engine checks the teacher's sheet. Malachar cannot declare Buppido
  // a master of Animal Handling.
  if (session.teacher.id === session.characterId) return { rows: [], skipped: ["teacher_is_student"] }
  if (skillProficiency(session.teacher, session.skill) === "none") return { rows: [], skipped: ["teacher_not_proficient"] }
  if (!Number.isInteger(session.hours) || session.hours <= 0) return { rows: [], skipped: ["no_hours"] }
  return {
    rows: [
      {
        character_id: session.characterId,
        skill: session.skill,
        kind: "training_hours",
        amount: session.hours,
        dc: null,
        stake_key: null,
        teacher_id: session.teacher.id,
        campaign_day: session.campaignDay,
        roll_request_id: null,
      },
    ],
    skipped: [],
  }
}

// ---------------------------------------------------------------------------
// evaluate — has any path crossed its threshold? Derived, never stored.
// ---------------------------------------------------------------------------

export interface Evaluation {
  /** The path that crossed, or null. When two cross at once the first in §1 order wins. */
  path: SkillProgressPath | null
  /** An award is due now. */
  ready: boolean
  /** Teaching hours are banked and the DC 12 check is the next step. */
  teachingCheckReady: boolean
  /** Something is on the ledger — the visible learning mark (§6) keys off this, and nothing else does. */
  inProgress: boolean
  counts: { successes: number; crits: number; hours: number }
  /** For the award line: "8 successes over 23 days". Empty when nothing is due. */
  summary: string
  /** The teacher on the most recent training row, for the gravity event. */
  teacherId: string | null
}

export function evaluate(
  ledger: readonly LedgerRow[],
  characterId: string,
  skill: Skill,
  rules: readonly ProgressRule[] = DEFAULT_RULES,
): Evaluation {
  const mine = forSkill(ledger, characterId, skill)
  const successes = mine.filter((r) => r.kind === "success" && !isTeachingStake(r.stake_key))
  const crits = mine.filter((r) => r.kind === "crit")
  const training = mine.filter((r) => r.kind === "training_hours")
  const hours = hoursBanked(mine)
  const counts = { successes: successes.length, crits: crits.length, hours }
  const teacherId = training.length ? training[training.length - 1].teacher_id : null
  const none: Evaluation = {
    path: null,
    ready: false,
    teachingCheckReady: false,
    inProgress: mine.length > 0,
    counts,
    summary: "",
    teacherId,
  }

  if (mine.some((r) => r.kind === "award")) return { ...none, inProgress: false }

  const days = (rows: readonly LedgerRow[]) => rows.map((r) => r.campaign_day).sort((a, b) => a - b)
  const span = (rows: readonly LedgerRow[]) => {
    const d = days(rows)
    return d.length ? d[d.length - 1] - d[0] + 1 : 0
  }

  // Path A — practice.
  const practice = ruleFor(rules, "practice")
  if (successes.length >= practice.threshold) {
    return { ...none, path: "practice", ready: true, summary: `${successes.length} successes over ${span(successes)} days` }
  }

  // Path B — talent: `threshold` natural 20s inside any `window_days`-day window.
  const talent = ruleFor(rules, "talent")
  const critDays = days(crits)
  for (let i = 0; i + talent.threshold - 1 < critDays.length; i++) {
    const first = critDays[i]
    const last = critDays[i + talent.threshold - 1]
    if (talent.window_days == null || last - first < talent.window_days) {
      return {
        ...none,
        path: "talent",
        ready: true,
        summary: `${talent.threshold} natural 20s within ${last - first + 1} day${last - first === 0 ? "" : "s"}`,
      }
    }
  }

  // Path C — teaching: hours banked, then the final check passed.
  const teaching = ruleFor(rules, "teaching")
  if (hours >= teaching.threshold) {
    const passed = mine.find(
      (r) => r.kind === "success" && isTeachingStake(r.stake_key) && (teaching.min_dc == null || (r.dc ?? 0) >= teaching.min_dc),
    )
    if (passed) {
      return {
        ...none,
        path: "teaching",
        ready: true,
        summary: `${hours} hours of instruction over ${span(training)} days, then the test`,
        teacherId: passed.teacher_id ?? teacherId,
      }
    }
    return { ...none, teachingCheckReady: true }
  }

  return none
}

// ---------------------------------------------------------------------------
// buildAward — the two writes that are one truth, plus the line Malachar gets
// ---------------------------------------------------------------------------

export interface Award {
  /** The kind='award' ledger row. */
  row: LedgerRow
  /** The whole sheet_skill_proficiencies map to write back: existing entries kept, the new skill set. */
  sheetSkillProficiencies: Record<string, string>
  /** characters.skills, the display string, with the new bonus. Null when the text was empty. */
  skillsText: string | null
  /** Teaching only: the student's regard for the teacher. Practice and talent have no second party. */
  relationshipEvent: RelationshipEventRow | null
  /** The one line the next prompt carries. Nothing else about the tally ever reaches Malachar. */
  promptLine: string
  /** The line for the shared log. */
  logLine: string
}

/** "animal_handling" -> "Animal Handling" — how the forge already writes the map's keys. */
export function skillTitle(skill: Skill): string {
  return skill
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

/**
 * characters.skills is a display string — "Acrobatics +2, Insight +1" — that
 * the sheet still reads. Rewrite the one entry (or append it) with the
 * proficient bonus so the flip is visible the moment the award lands.
 */
export function patchSkillsText(text: string | null | undefined, skill: Skill, bonus: number): string | null {
  const entry = `${skillTitle(skill)} ${signed(bonus)}`
  if (!text || !text.trim()) return null
  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
  const idx = parts.findIndex((p) => normaliseSkill(p.replace(/\s*[+-]\s*\d+\s*$/, "")) === skill)
  if (idx >= 0) parts[idx] = entry
  else parts.push(entry)
  return parts.join(", ")
}

export function buildAward(
  sheet: SheetSlice,
  skill: Skill,
  evaluation: Evaluation,
  campaignDay: number,
  skillsText?: string | null,
): Award {
  if (!evaluation.ready || !evaluation.path) throw new Error("buildAward called with nothing due")
  const title = skillTitle(skill)
  const bonus = abilityMod(scoreFor(sheet, SKILL_ABILITY[skill])) + proficiency(sheet)

  // Keep whatever keys the forge wrote; add ours in the same Title Case style.
  const map: Record<string, string> = {}
  for (const [k, v] of Object.entries(sheet.sheet_skill_proficiencies ?? {})) {
    if (normaliseSkill(k) === skill) continue
    map[k] = String(v)
  }
  map[title] = "proficient"

  const relationshipEvent: RelationshipEventRow | null =
    evaluation.path === "teaching" && evaluation.teacherId
      ? {
          subject_id: sheet.id,
          object_id: evaluation.teacherId,
          kind: "taught_proficiency",
          // Sam's palliation rule (lib/camp PALLIATION) scales positive scenes
          // to ~65%; 80 lands at 52 — high, as §4 asks, without being a wedding.
          gravity: 52,
          deltas: { respect: 13, affection: 7, debt: 7 },
          note: `${sheet.name} earned ${title} under their instruction`,
          source: "camp:talk",
        }
      : null

  return {
    row: {
      character_id: sheet.id,
      skill,
      kind: "award",
      amount: 1,
      dc: null,
      stake_key: evaluation.path,
      teacher_id: evaluation.path === "teaching" ? evaluation.teacherId : null,
      campaign_day: campaignDay,
      roll_request_id: null,
    },
    sheetSkillProficiencies: map,
    skillsText: patchSkillsText(skillsText, skill, bonus),
    relationshipEvent,
    promptLine: `PROFICIENCY EARNED: ${sheet.name} is now proficient in ${title} (path: ${evaluation.path}, ${evaluation.summary}). Narrate it; do not explain the rule.`,
    logLine: `${sheet.name} is now proficient in ${title}.`,
  }
}

/** The skills that have any progress on the ledger — the §6 learning mark, nothing more. */
export function skillsInProgress(ledger: readonly LedgerRow[], characterId: string): Skill[] {
  const out = new Set<Skill>()
  for (const r of ledger) {
    if (r.character_id !== characterId || r.kind === "award") continue
    out.add(r.skill)
  }
  for (const r of ledger) if (r.character_id === characterId && r.kind === "award") out.delete(r.skill)
  return [...out]
}
