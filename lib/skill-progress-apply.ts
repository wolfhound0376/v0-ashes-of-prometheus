// Earned skill proficiency — the database side of lib/skill-progress.
//
// lib/skill-progress owns the rule and never touches Supabase. This file owns
// the choreography: read the ledger and the rules, ask the pure functions what
// to append, append it, and when an award is due make the two writes that are
// one truth (the award row and the sheet) plus the one line for the shared
// log. docs/claude_Earned_Proficiency.md §4.
//
// Server-only: it takes the service-role client. Both tables are RLS-locked
// with no policies, so nothing here can be reached from a browser.
//
// Best-effort by contract, like book retrieval: a failure anywhere in here is
// logged and swallowed. The roll that triggered it has already been committed
// to the roll ledger and must never be un-done or held up by the tally.

import { DEFAULT_RULES, buildAward, evaluate, recordCheck, type Award, type LedgerRow, type ProgressRule, type ResolvedCheck } from "./skill-progress"
import { normaliseSkill, type CheckResult, type SheetSlice, type Skill } from "./game-context"
import { readGameClock } from "./time-tracking"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export interface ApplyOutcome {
  /** Rows appended this time (success and/or crit). Empty when nothing counted. */
  appended: LedgerRow[]
  /** Why nothing (or not everything) counted — straight from recordCheck. */
  skipped: string[]
  /** Set when this check crossed a threshold and the award was written. */
  award: Award | null
}

const SHEET_COLUMNS =
  "id, name, level, str_score, dex_score, con_score, int_score, wis_score, cha_score, proficiency_bonus, passive_perception, sheet_skill_proficiencies, skills"

/** The rules Sam tunes in skill_progress_rules; the seeded defaults when the table cannot be read. */
export async function loadRules(admin: Admin): Promise<readonly ProgressRule[]> {
  try {
    const { data, error } = await admin.from("skill_progress_rules").select("path, threshold, window_days, min_dc")
    if (error || !Array.isArray(data) || data.length === 0) return DEFAULT_RULES
    return data as ProgressRule[]
  } catch {
    return DEFAULT_RULES
  }
}

export async function loadLedger(admin: Admin, characterId: string, skill: Skill): Promise<LedgerRow[]> {
  const { data, error } = await admin
    .from("skill_progress")
    .select("character_id, skill, kind, amount, dc, stake_key, teacher_id, campaign_day, roll_request_id")
    .eq("character_id", characterId)
    .eq("skill", skill)
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as LedgerRow[]
}

/**
 * The exploration path already resolves a check with its skill, DC and kept
 * die (lib/game-context resolveInteraction). This turns that result into the
 * same event the dice ledger produces, so both paths feed one tally.
 */
export function fromCheckResult(characterId: string, check: CheckResult, campaignDay: number, stakeKey: string | null): ResolvedCheck {
  return {
    characterId,
    skill: check.skill,
    dc: check.dc,
    keptDie: check.roll,
    total: check.total,
    campaignDay,
    stakeKey,
    rollRequestId: null,
  }
}

/**
 * Append what one resolved check earns and, if a path crossed, write the award.
 * Returns null when the check was not a skill check at all.
 */
export async function applyResolvedCheck(admin: Admin, check: ResolvedCheck): Promise<ApplyOutcome | null> {
  const { data: sheetRow, error: sheetError } = await admin.from("characters").select(SHEET_COLUMNS).eq("id", check.characterId).maybeSingle()
  if (sheetError) throw sheetError
  if (!sheetRow) return null
  const sheet = sheetRow as SheetSlice & { skills?: string | null }

  const [rules, ledger] = await Promise.all([loadRules(admin), loadLedger(admin, check.characterId, check.skill)])
  const decision = recordCheck(check, sheet, ledger, rules)
  if (decision.rows.length) {
    const { error } = await admin.from("skill_progress").insert(decision.rows)
    if (error) throw error
  }

  const evaluation = evaluate([...ledger, ...decision.rows], check.characterId, check.skill, rules)
  let award: Award | null = null
  if (evaluation.ready) {
    award = buildAward(sheet, check.skill, evaluation, check.campaignDay, sheet.skills)

    // The two writes that are one truth. The award row goes first: if the
    // sheet update then fails, the next evaluate sees the award and stops
    // counting, and the mismatch is loud in the log rather than a quiet
    // second award later.
    const { error: awardError } = await admin.from("skill_progress").insert(award.row)
    if (awardError) throw awardError
    const { error: sheetWriteError } = await admin
      .from("characters")
      .update({
        sheet_skill_proficiencies: award.sheetSkillProficiencies,
        ...(award.skillsText ? { skills: award.skillsText } : {}),
      })
      .eq("id", check.characterId)
    if (sheetWriteError) throw sheetWriteError

    if (award.relationshipEvent) {
      const { error } = await admin.from("relationship_events").insert(award.relationshipEvent)
      if (error) console.error("[skill-progress] relationship event not written:", error.message)
    }

    // The shared log carries the moment; Malachar carries it next turn via
    // the chat route's PROFICIENCY EARNED block. Same shape as the client's
    // own System lines (app/page.tsx): speaker "System", nothing else special.
    const { error: logError } = await admin.from("dialogue").insert({ speaker: "System", text: award.logLine, channel: "dm" })
    if (logError) console.error("[skill-progress] log line not written:", logError.message)
  }

  return { appended: decision.rows, skipped: decision.skipped, award }
}

/**
 * The dice-ledger entry point: a roll request the resolve RPC has just
 * accepted. Only a single d20 with a skill on the request is a skill check;
 * anything else (attacks, damage, untagged rolls) returns null untouched.
 */
export async function applyAcceptedRoll(
  admin: Admin,
  args: { requestId: string; characterId: string; die: string; rolls: number[]; total: number },
): Promise<ApplyOutcome | null> {
  if (args.die.toLowerCase() !== "d20" || args.rolls.length !== 1) return null

  const { data: request, error } = await admin
    .from("roll_requests")
    .select("id, session_id, skill, dc, purpose, requested_expression")
    .eq("id", args.requestId)
    .eq("character_id", args.characterId)
    .maybeSingle()
  if (error) throw error
  const skill = request?.skill ? normaliseSkill(String(request.skill)) : null
  if (!request || !skill) return null

  const clock = await readGameClock(admin, request.session_id ?? null)
  return applyResolvedCheck(admin, {
    characterId: args.characterId,
    skill,
    dc: typeof request.dc === "number" ? request.dc : null,
    keptDie: args.rolls[0],
    total: args.total,
    campaignDay: clock?.day ?? 1,
    // Freshness is judged on what the check was against. Malachar's tag has
    // no stake field yet, so the request's purpose (when set) or the
    // expression stands in: same skill, same day, same purpose - once.
    stakeKey: request.purpose ? String(request.purpose) : null,
    rollRequestId: request.id,
  })
}
