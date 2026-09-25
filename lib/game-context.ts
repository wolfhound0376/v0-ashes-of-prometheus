// lib/game-context.ts
//
// Ashes of Prometheus — game context state machine + the 5e maths that gates it.
// Spec: claude_Game_Context_State_Machine.md (2026-09-25).
//
// Pure functions. No imports, no database, no rendering. Give it a seeded rng
// and it is deterministic (Playable Layer §2.1). Everything it computes is a
// FACT the server can log and the board can draw; it never names an animation.
//
// Rule sources are cited inline as SRD 5.1 sections (campaign_books.slug =
// 'srd-5-1', query via search_srd()). Nothing here is homebrew.

// ---------------------------------------------------------------------------
// Contexts and transitions
// ---------------------------------------------------------------------------

export type GameContext = "overworld" | "exploration" | "combat" | "camp"

export type TransitionEvent =
  | { type: "arrive"; nodeId: string; hasMap: boolean; discoveredAt: string | null }
  | { type: "depart" }
  | { type: "initiative"; combatStateId: string; encounterKey: string }
  | { type: "ambush"; combatStateId: string; encounterKey: string } // overworld → combat, skips the diorama
  | { type: "combat_ended"; combatStateId: string }
  | { type: "make_camp"; nodeId: string }
  | { type: "break_camp" }

export type TransitionResult =
  | { ok: true; next: GameContext; reason: string }
  | { ok: false; error: string }

/**
 * The whole machine. Every legal edge is listed; anything else is an error,
 * never a silent no-op. `reason` is meant to be logged (same discipline as the
 * Scene Composer's per-placement rationale).
 */
export function applyTransition(current: GameContext, ev: TransitionEvent): TransitionResult {
  switch (ev.type) {
    case "arrive":
      if (current !== "overworld") return fail(`arrive is only legal from overworld (in ${current})`)
      // Reachability is discovery, not unlocking. travel_nodes.discovered_at is the gate.
      if (!ev.discoveredAt) return fail(`node ${ev.nodeId} is not discovered`)
      if (!ev.hasMap) return fail(`node ${ev.nodeId} has no diorama/map; stay on the overworld`)
      return ok("exploration", `arrived at ${ev.nodeId}`)

    case "depart":
      if (current !== "exploration") return fail(`depart is only legal from exploration (in ${current})`)
      return ok("overworld", "party departed the node")

    case "initiative":
      if (current !== "exploration") return fail(`initiative is only legal from exploration (in ${current})`)
      return ok("combat", `initiative rolled for ${ev.encounterKey} (combat_state ${ev.combatStateId})`)

    case "ambush":
      if (current !== "overworld") return fail(`ambush is only legal from overworld (in ${current})`)
      return ok("combat", `travel ambush ${ev.encounterKey} (combat_state ${ev.combatStateId})`)

    case "combat_ended":
      if (current !== "combat") return fail(`combat_ended while not in combat (in ${current})`)
      return ok("exploration", `combat_state ${ev.combatStateId} ended`)

    case "make_camp":
      if (current !== "exploration") return fail(`make_camp is only legal from exploration (in ${current})`)
      return ok("camp", `camp made at ${ev.nodeId}`)

    case "break_camp":
      if (current !== "camp") return fail(`break_camp while not camping (in ${current})`)
      return ok("exploration", "camp broken")
  }
}

const ok = (next: GameContext, reason: string): TransitionResult => ({ ok: true, next, reason })
const fail = (error: string): TransitionResult => ({ ok: false, error })

// ---------------------------------------------------------------------------
// Dice
// ---------------------------------------------------------------------------

/** Returns a float in [0, 1). Pass Math.random in play, a seeded PRNG in tests/replays. */
export type Rng = () => number

export const d20 = (rng: Rng) => 1 + Math.floor(rng() * 20)

export type RollMode = "flat" | "advantage" | "disadvantage"

/** SRD 5.1, Using Ability Scores: Advantage and Disadvantage — sources never stack; one of each cancels. */
export function rollD20(rng: Rng, mode: RollMode): { roll: number; rolls: number[] } {
  if (mode === "flat") {
    const r = d20(rng)
    return { roll: r, rolls: [r] }
  }
  const a = d20(rng)
  const b = d20(rng)
  return { roll: mode === "advantage" ? Math.max(a, b) : Math.min(a, b), rolls: [a, b] }
}

export function resolveRollMode(advantageSources: number, disadvantageSources: number): RollMode {
  if (advantageSources > 0 && disadvantageSources > 0) return "flat"
  if (advantageSources > 0) return "advantage"
  if (disadvantageSources > 0) return "disadvantage"
  return "flat"
}

// ---------------------------------------------------------------------------
// Core maths
// ---------------------------------------------------------------------------

/** SRD 5.1, Using Ability Scores: floor((score − 10) / 2). */
export const abilityMod = (score: number) => Math.floor((score - 10) / 2)

/** SRD 5.1, Beyond 1st Level: proficiency bonus by character level. Monsters carry their own. */
export function proficiencyForLevel(level: number): number {
  if (level >= 17) return 6
  if (level >= 13) return 5
  if (level >= 9) return 4
  if (level >= 5) return 3
  return 2
}

export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha"

export type Skill =
  | "athletics"
  | "acrobatics" | "sleight_of_hand" | "stealth"
  | "arcana" | "history" | "investigation" | "nature" | "religion"
  | "animal_handling" | "insight" | "medicine" | "perception" | "survival"
  | "deception" | "intimidation" | "performance" | "persuasion"

/** SRD 5.1, Using Ability Scores: Skills — the full 18. Nothing falls through to STR. */
export const SKILL_ABILITY: Record<Skill, Ability> = {
  athletics: "str",
  acrobatics: "dex", sleight_of_hand: "dex", stealth: "dex",
  arcana: "int", history: "int", investigation: "int", nature: "int", religion: "int",
  animal_handling: "wis", insight: "wis", medicine: "wis", perception: "wis", survival: "wis",
  deception: "cha", intimidation: "cha", performance: "cha", persuasion: "cha",
}

export const skillAbility = (skill: Skill): Ability => SKILL_ABILITY[skill]

/**
 * characters.sheet_skill_proficiencies currently mixes "Sleight of Hand",
 * "sleight_of_hand" and "stealth". Normalise before lookup; reject unknowns.
 */
export function normaliseSkill(raw: string): Skill | null {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_")
  return key in SKILL_ABILITY ? (key as Skill) : null
}

export type ProficiencyLevel = "none" | "proficient" | "expertise"

/**
 * The slice of a `characters` row this module reads. Column names match the
 * table (str_score, dex_modifier, proficiency_bonus, passive_perception,
 * sheet_skill_proficiencies …). Modifiers are recomputed from scores when the
 * stored modifier is null — never trusted over the score.
 */
export interface SheetSlice {
  id: string
  name: string
  level: number
  str_score: number
  dex_score: number
  con_score: number
  int_score: number
  wis_score: number
  cha_score: number
  proficiency_bonus?: number | null
  passive_perception?: number | null
  /** e.g. { "Stealth": "expertise", "athletics": "proficient" } */
  sheet_skill_proficiencies?: Record<string, string> | null
  /** Bard 2+: half proficiency on non-proficient checks. Off by default. */
  jack_of_all_trades?: boolean
}

export function scoreFor(sheet: SheetSlice, ability: Ability): number {
  return sheet[`${ability}_score` as const]
}

export function proficiency(sheet: SheetSlice): number {
  return sheet.proficiency_bonus ?? proficiencyForLevel(sheet.level)
}

export function skillProficiency(sheet: SheetSlice, skill: Skill): ProficiencyLevel {
  const map = sheet.sheet_skill_proficiencies ?? {}
  for (const [k, v] of Object.entries(map)) {
    if (normaliseSkill(k) !== skill) continue
    const val = String(v).toLowerCase()
    if (val === "expertise") return "expertise"
    if (val === "proficient" || val === "true" || val === "yes") return "proficient"
  }
  return "none"
}

/** SRD 5.1, Using Ability Scores: Proficiency Bonus — applied once, doubled by Expertise. */
export function skillBonus(sheet: SheetSlice, skill: Skill): { mod: number; prof: number; level: ProficiencyLevel } {
  const mod = abilityMod(scoreFor(sheet, skillAbility(skill)))
  const level = skillProficiency(sheet, skill)
  const pb = proficiency(sheet)
  let prof = 0
  if (level === "expertise") prof = pb * 2
  else if (level === "proficient") prof = pb
  else if (sheet.jack_of_all_trades) prof = Math.floor(pb / 2)
  return { mod, prof, level }
}

// ---------------------------------------------------------------------------
// Exploration interaction = one ability check
// ---------------------------------------------------------------------------

/** Closed vocabulary for what failing does. There is no improvised trap. */
export type FailureConsequence =
  | { kind: "none" }
  | { kind: "locked_until_long_rest" } // the Velkynvelve manacle rule
  | { kind: "trigger"; key: string } // an encounter_key / scene_key that already exists

export interface Interaction {
  key: string
  label: string
  skill: Skill
  dc: number
  onFailure: FailureConsequence
}

export interface CheckResult {
  actor: string
  skill: Skill
  ability: Ability
  dc: number
  mode: RollMode
  rolls: number[]
  roll: number
  mod: number
  prof: number
  proficiency: ProficiencyLevel
  total: number
  success: boolean
  /** e.g. "d20(14) + DEX(+3) + expertise(+6) = 23 vs DC 20" — Sam is not a rules lawyer; show the working. */
  arithmetic: string
}

/**
 * SRD 5.1, Using Ability Scores: Ability Checks. d20 + ability mod + proficiency
 * (if proficient). A natural 20 is NOT an automatic success on a check and a
 * natural 1 is NOT an automatic failure — those rules belong to attacks and
 * death saves only.
 */
export function resolveSkillCheck(
  sheet: SheetSlice,
  skill: Skill,
  dc: number,
  rng: Rng,
  opts: { advantage?: number; disadvantage?: number } = {},
): CheckResult {
  const mode = resolveRollMode(opts.advantage ?? 0, opts.disadvantage ?? 0)
  const { roll, rolls } = rollD20(rng, mode)
  const { mod, prof, level } = skillBonus(sheet, skill)
  const total = roll + mod + prof
  const ability = skillAbility(skill)
  const profLabel = level === "none" ? (prof ? `jack(+${prof})` : "") : `${level}(+${prof})`
  const arithmetic =
    `d20(${roll}${mode !== "flat" ? `, ${mode} of ${rolls.join("/")}` : ""})` +
    ` + ${ability.toUpperCase()}(${signed(mod)})` +
    (profLabel ? ` + ${profLabel}` : "") +
    ` = ${total} vs DC ${dc}`
  return { actor: sheet.name, skill, ability, dc, mode, rolls, roll, mod, prof, proficiency: level, total, success: total >= dc, arithmetic }
}

export function resolveInteraction(sheet: SheetSlice, it: Interaction, rng: Rng, opts?: { advantage?: number; disadvantage?: number }) {
  const check = resolveSkillCheck(sheet, it.skill, it.dc, rng, opts)
  return { interaction: it.key, check, consequence: check.success ? null : it.onFailure }
}

// ---------------------------------------------------------------------------
// Entering combat — surprise and initiative
// ---------------------------------------------------------------------------

/** SRD 5.1, Using Ability Scores: Passive Checks — 10 + all modifiers that normally apply. */
export function passivePerception(sheet: SheetSlice, opts: { advantage?: boolean; disadvantage?: boolean } = {}): number {
  if (sheet.passive_perception != null) return sheet.passive_perception
  const { mod, prof } = skillBonus(sheet, "perception")
  return 10 + mod + prof + (opts.advantage ? 5 : 0) - (opts.disadvantage ? 5 : 0)
}

export interface Hider {
  sheet: SheetSlice
  /** Stealth disadvantage from medium/heavy armour is a sheet fact the caller supplies. */
  disadvantage?: number
  advantage?: number
}

export interface Observer {
  sheet: SheetSlice
  /** Set when the observer is not looking (asleep, distracted) — GM's call, logged upstream. */
  perceptionDisadvantage?: boolean
}

export interface SurpriseVerdict {
  observer: string
  passivePerception: number
  /** Every hider's stealth total this observer was measured against. */
  comparisons: { hider: string; stealth: number; noticed: boolean }[]
  surprised: boolean
}

/**
 * SRD 5.1, Combat: Surprise. The GM decides who *might* be surprised (if neither
 * side is stealthy, nobody is — the caller should not invoke this). Each hider's
 * Dexterity (Stealth) is compared to each opposing creature's passive Wisdom
 * (Perception). A creature that notices no threat is surprised: it can't move
 * or act on its first turn and can't react until that turn ends. Per creature,
 * not per side.
 *
 * A stealth total >= the observer's passive Perception means the hider was NOT
 * noticed (ties go to the hider; the SRD says the check "beats" or the
 * observer "notices" — the common ruling is >= for the hider, and it is the
 * one the manacle DCs in this campaign already use for checks).
 */
export function resolveSurprise(hiders: Hider[], observers: Observer[], rng: Rng): { stealth: CheckResult[]; verdicts: SurpriseVerdict[] } {
  const stealth = hiders.map((h) =>
    resolveSkillCheck(h.sheet, "stealth", 0, rng, { advantage: h.advantage ?? 0, disadvantage: h.disadvantage ?? 0 }),
  )
  const verdicts = observers.map((o) => {
    const pp = passivePerception(o.sheet, { disadvantage: o.perceptionDisadvantage })
    const comparisons = stealth.map((s) => ({ hider: s.actor, stealth: s.total, noticed: s.total < pp }))
    return { observer: o.sheet.name, passivePerception: pp, comparisons, surprised: comparisons.every((c) => !c.noticed) }
  })
  return { stealth, verdicts }
}

/** The condition to write into characters.conditions; the engine clears it at the end of the creature's first turn. */
export const SURPRISED_CONDITION = { name: "surprised", clears: "end_of_first_turn" } as const

export interface Combatant {
  id: string
  name: string
  side: "party" | "enemy" | "ally"
  dex_score: number
}

export interface InitiativeEntry {
  id: string
  name: string
  side: Combatant["side"]
  roll: number
  dexMod: number
  total: number
  /** true when another entry has the same total — PC/PC ties are the players' call, surface it in the UI */
  tied: boolean
}

/**
 * SRD 5.1, Combat: Initiative — d20 + Dexterity modifier. Proficiency does not
 * apply. Ties: the engine orders by DEX score, then by a re-roll, and flags them;
 * ties between player characters should be offered to the players, not decided.
 */
export function rollInitiative(combatants: Combatant[], rng: Rng): InitiativeEntry[] {
  const entries = combatants.map((c) => {
    const dexMod = abilityMod(c.dex_score)
    const roll = d20(rng)
    return { id: c.id, name: c.name, side: c.side, roll, dexMod, total: roll + dexMod, tied: false, _dex: c.dex_score, _tiebreak: rng() }
  })
  entries.sort((a, b) => b.total - a.total || b._dex - a._dex || b._tiebreak - a._tiebreak)
  const counts = new Map<number, number>()
  for (const e of entries) counts.set(e.total, (counts.get(e.total) ?? 0) + 1)
  return entries.map(({ _dex, _tiebreak, ...e }) => ({ ...e, tied: (counts.get(e.total) ?? 0) > 1 }))
}

// ---------------------------------------------------------------------------
// Time — a clock in hours, not a day/night toggle
// ---------------------------------------------------------------------------

export interface CampaignClock {
  /** hours elapsed since campaign start */
  hours: number
  /** hours value at the last completed long rest (one long-rest benefit per 24 h — SRD 5.1, Adventuring: Resting) */
  lastLongRestAt: number | null
}

export const ROUND_HOURS = 6 / 3600 // a round is 6 seconds (SRD 5.1, Combat: The Order of Combat)

export function advanceClock(clock: CampaignClock, by: { rounds?: number; hours?: number }): CampaignClock {
  return { ...clock, hours: clock.hours + (by.rounds ?? 0) * ROUND_HOURS + (by.hours ?? 0) }
}

export function canBenefitFromLongRest(clock: CampaignClock): boolean {
  return clock.lastLongRestAt == null || clock.hours - clock.lastLongRestAt >= 24
}

export function completeLongRest(clock: CampaignClock): CampaignClock {
  // 8 hours (SRD 5.1, Adventuring: Long Rest). Feeds characters.rest_actions_remaining / hit_dice_remaining upstream.
  const after = advanceClock(clock, { hours: 8 })
  return { ...after, lastLongRestAt: after.hours }
}

/** Night is only meaningful where the environment has a sky. The Underdark never returns true. */
export function isNight(clock: CampaignClock, env: { hasSky: boolean; nightStartsAt?: number; nightEndsAt?: number }): boolean {
  if (!env.hasSky) return false
  const hourOfDay = ((clock.hours % 24) + 24) % 24
  const start = env.nightStartsAt ?? 20
  const end = env.nightEndsAt ?? 6
  return start > end ? hourOfDay >= start || hourOfDay < end : hourOfDay >= start && hourOfDay < end
}

export const daysElapsed = (clock: CampaignClock) => Math.floor(clock.hours / 24)

// ---------------------------------------------------------------------------

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
