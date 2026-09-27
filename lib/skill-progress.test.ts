import { describe, expect, it } from "vitest"
import type { SheetSlice } from "./game-context"
import {
  DEFAULT_RULES,
  TEACHING_STAKE_PREFIX,
  buildAward,
  evaluate,
  patchSkillsText,
  recordCheck,
  recordTraining,
  skillsInProgress,
  stakeKeyFromPurpose,
  type LedgerRow,
  type ResolvedCheck,
} from "./skill-progress"

// ---------------------------------------------------------------------------
// A seeded ledger, built the way the route builds it: one recordCheck at a
// time, each decision appended before the next. Nothing here touches a
// database or a die; the kept face and the DC are named outright.
// ---------------------------------------------------------------------------

const SAMSON = "00000000-0000-4000-8000-00000000000a"
const ELDETH = "00000000-0000-4000-8000-00000000000b"

function sheet(over: Partial<SheetSlice> = {}): SheetSlice {
  return {
    id: SAMSON,
    name: "Samson",
    level: 1,
    str_score: 14,
    dex_score: 10,
    con_score: 14,
    int_score: 10,
    wis_score: 12,
    cha_score: 10,
    proficiency_bonus: 2,
    sheet_skill_proficiencies: { Insight: "proficient", Religion: "proficient" },
    ...over,
  }
}

function check(over: Partial<ResolvedCheck> = {}): ResolvedCheck {
  return {
    characterId: SAMSON,
    skill: "animal_handling",
    dc: 12,
    keptDie: 14,
    total: 15,
    campaignDay: 1,
    stakeKey: "beast:riding-lizard",
    rollRequestId: null,
    ...over,
  }
}

/** Run a sequence of checks through recordCheck, appending as the route would. */
function play(checks: ResolvedCheck[], s: SheetSlice = sheet(), start: LedgerRow[] = []) {
  const ledger: LedgerRow[] = [...start]
  const skipped: string[][] = []
  for (const c of checks) {
    const d = recordCheck(c, s, ledger, DEFAULT_RULES)
    ledger.push(...d.rows)
    skipped.push(d.skipped)
  }
  return { ledger, skipped }
}

// ---------------------------------------------------------------------------

describe("Path A — practice", () => {
  it("eight fresh successes at DC >= 10 earn the proficiency; seven do not", () => {
    const seven = Array.from({ length: 7 }, (_, i) => check({ campaignDay: i + 1, stakeKey: `beast:${i}` }))
    const { ledger } = play(seven)
    expect(ledger.filter((r) => r.kind === "success")).toHaveLength(7)
    expect(evaluate(ledger, SAMSON, "animal_handling").ready).toBe(false)
    expect(evaluate(ledger, SAMSON, "animal_handling").inProgress).toBe(true)

    const { ledger: eight } = play([check({ campaignDay: 23, stakeKey: "beast:7" })], sheet(), ledger)
    const ev = evaluate(eight, SAMSON, "animal_handling")
    expect(ev.ready).toBe(true)
    expect(ev.path).toBe("practice")
    expect(ev.summary).toBe("8 successes over 23 days")
  })

  it("guardrail: a DC below 10 teaches nothing", () => {
    const { ledger, skipped } = play([check({ dc: 5, total: 20 })])
    expect(ledger).toHaveLength(0)
    expect(skipped[0]).toContain("dc_below_minimum")
  })

  it("guardrail: a failed check is not a success, and no DC means no judgement", () => {
    const { ledger, skipped } = play([check({ dc: 15, total: 12 }), check({ dc: null, total: 25 })])
    expect(ledger).toHaveLength(0)
    expect(skipped[0]).toContain("failed")
    expect(skipped[1]).toContain("no_dc")
  })

  it("guardrail: freshness — the same lock on the same day counts once; the next day it counts again", () => {
    const sameLock = "lock:pen-door"
    const { ledger, skipped } = play([
      check({ skill: "sleight_of_hand", stakeKey: sameLock, campaignDay: 3 }),
      check({ skill: "sleight_of_hand", stakeKey: sameLock, campaignDay: 3 }),
      check({ skill: "sleight_of_hand", stakeKey: sameLock, campaignDay: 3 }),
      check({ skill: "sleight_of_hand", stakeKey: "lock:armoury", campaignDay: 3 }),
      check({ skill: "sleight_of_hand", stakeKey: sameLock, campaignDay: 4 }),
    ])
    expect(ledger.filter((r) => r.kind === "success")).toHaveLength(3)
    expect(skipped[1]).toContain("stale_stake")
    expect(skipped[2]).toContain("stale_stake")
    expect(skipped[3]).not.toContain("stale_stake")
    expect(skipped[4]).not.toContain("stale_stake")
  })

  it("guardrail: a check with no stake at all is held to one per day, not to none", () => {
    const { ledger } = play([
      check({ stakeKey: null, campaignDay: 1 }),
      check({ stakeKey: null, campaignDay: 1 }),
      check({ stakeKey: null, campaignDay: 2 }),
    ])
    expect(ledger.filter((r) => r.kind === "success")).toHaveLength(2)
  })

  it("nine picks of the same lock by lunch is not a locksmith", () => {
    const { ledger } = play(Array.from({ length: 9 }, () => check({ skill: "sleight_of_hand", stakeKey: "lock:pen-door", campaignDay: 1, dc: 10, total: 18 })))
    expect(evaluate(ledger, SAMSON, "sleight_of_hand").ready).toBe(false)
    expect(evaluate(ledger, SAMSON, "sleight_of_hand").counts.successes).toBe(1)
  })
})

describe("Path B — flash of talent", () => {
  it("two natural 20s within seven campaign days earn it, at any DC", () => {
    const { ledger } = play([
      check({ skill: "perception", dc: 5, keptDie: 20, total: 21, campaignDay: 2 }),
      check({ skill: "perception", dc: 18, keptDie: 20, total: 21, campaignDay: 8, stakeKey: "other" }),
    ])
    // The DC 5 crit is a crit even though DC 5 is below the practice floor.
    expect(ledger.filter((r) => r.kind === "crit")).toHaveLength(2)
    const ev = evaluate(ledger, SAMSON, "perception")
    expect(ev.ready).toBe(true)
    expect(ev.path).toBe("talent")
    expect(ev.summary).toBe("2 natural 20s within 7 days")
  })

  it("guardrail: the window is campaign days — day 1 and day 8 are eight days, not seven", () => {
    const { ledger } = play([
      check({ skill: "perception", keptDie: 20, total: 21, campaignDay: 1 }),
      check({ skill: "perception", keptDie: 20, total: 21, campaignDay: 8 }),
    ])
    expect(evaluate(ledger, SAMSON, "perception").ready).toBe(false)
    expect(evaluate(ledger, SAMSON, "perception").counts.crits).toBe(2)
  })

  it("a third 20 inside the window with an earlier stray one still crosses", () => {
    const { ledger } = play([
      check({ skill: "perception", keptDie: 20, total: 21, campaignDay: 1 }),
      check({ skill: "perception", keptDie: 20, total: 21, campaignDay: 20 }),
      check({ skill: "perception", keptDie: 20, total: 21, campaignDay: 26 }),
    ])
    expect(evaluate(ledger, SAMSON, "perception").ready).toBe(true)
  })

  it("a natural 20 that still fails the DC is a crit and not a success", () => {
    const { ledger } = play([check({ dc: 25, keptDie: 20, total: 21 })])
    expect(ledger.map((r) => r.kind)).toEqual(["crit"])
  })

  it("a 19 is not talent", () => {
    const { ledger, skipped } = play([check({ keptDie: 19, total: 20 })])
    expect(ledger.map((r) => r.kind)).toEqual(["success"])
    expect(skipped[0]).toContain("not_a_natural_20")
  })
})

describe("Path C — teaching", () => {
  const eldeth = (): SheetSlice =>
    sheet({ id: ELDETH, name: "Eldeth Feldrun", sheet_skill_proficiencies: { "Animal Handling": "proficient" } })
  const buppido = (): SheetSlice => sheet({ id: ELDETH, name: "Buppido", sheet_skill_proficiencies: { Deception: "expertise" } })

  it("guardrail: the engine checks the teacher's sheet — Buppido cannot teach Animal Handling", () => {
    const d = recordTraining(
      { characterId: SAMSON, skill: "animal_handling", teacher: buppido(), hours: 8, campaignDay: 1 },
      sheet(),
      [],
    )
    expect(d.rows).toHaveLength(0)
    expect(d.skipped).toEqual(["teacher_not_proficient"])
  })

  it("guardrail: you cannot teach yourself, and zero hours bank nothing", () => {
    expect(recordTraining({ characterId: SAMSON, skill: "animal_handling", teacher: sheet(), hours: 8, campaignDay: 1 }, sheet(), []).skipped).toEqual(["teacher_is_student"])
    expect(recordTraining({ characterId: SAMSON, skill: "animal_handling", teacher: eldeth(), hours: 0, campaignDay: 1 }, sheet(), []).skipped).toEqual(["no_hours"])
  })

  it("forty hours bank, then the DC 12 check earns it", () => {
    const ledger: LedgerRow[] = []
    for (let day = 1; day <= 5; day++) {
      const d = recordTraining({ characterId: SAMSON, skill: "animal_handling", teacher: eldeth(), hours: 8, campaignDay: day }, sheet(), ledger)
      ledger.push(...d.rows)
    }
    expect(ledger).toHaveLength(5)
    expect(ledger[0].teacher_id).toBe(ELDETH)

    let ev = evaluate(ledger, SAMSON, "animal_handling")
    expect(ev.counts.hours).toBe(40)
    expect(ev.ready).toBe(false)
    expect(ev.teachingCheckReady).toBe(true)

    const final = check({ dc: 12, total: 14, campaignDay: 6, stakeKey: `${TEACHING_STAKE_PREFIX}${ELDETH}` })
    const { ledger: done } = play([final], sheet(), ledger)
    ev = evaluate(done, SAMSON, "animal_handling")
    expect(ev.ready).toBe(true)
    expect(ev.path).toBe("teaching")
    expect(ev.teacherId).toBe(ELDETH)
    expect(ev.summary).toBe("40 hours of instruction over 5 days, then the test")
    // The final check is not also a practice success.
    expect(ev.counts.successes).toBe(0)
  })

  it("guardrail: the final check before the hours are banked does not count", () => {
    const ledger: LedgerRow[] = []
    ledger.push(...recordTraining({ characterId: SAMSON, skill: "animal_handling", teacher: eldeth(), hours: 39, campaignDay: 1 }, sheet(), ledger).rows)
    const { ledger: after, skipped } = play([check({ dc: 12, total: 20, campaignDay: 2, stakeKey: `${TEACHING_STAKE_PREFIX}${ELDETH}` })], sheet(), ledger)
    expect(skipped[0]).toContain("teaching_hours_not_banked")
    expect(evaluate(after, SAMSON, "animal_handling").ready).toBe(false)
    expect(evaluate(after, SAMSON, "animal_handling").teachingCheckReady).toBe(false)
  })

  it("guardrail: the final check must be at least DC 12", () => {
    const ledger: LedgerRow[] = []
    ledger.push(...recordTraining({ characterId: SAMSON, skill: "animal_handling", teacher: eldeth(), hours: 40, campaignDay: 1 }, sheet(), ledger).rows)
    const { skipped } = play([check({ dc: 10, total: 20, campaignDay: 2, stakeKey: `${TEACHING_STAKE_PREFIX}${ELDETH}` })], sheet(), ledger)
    expect(skipped[0]).toContain("teaching_dc_below_minimum")
  })

  it("an expertise teacher counts as having the proficiency", () => {
    const d = recordTraining(
      { characterId: SAMSON, skill: "deception", teacher: buppido(), hours: 4, campaignDay: 1 },
      sheet(),
      [],
    )
    expect(d.rows).toHaveLength(1)
  })
})

describe("Guardrails that apply to every path", () => {
  it("a skill the character already has is never counted — proficient or expertise", () => {
    const { ledger, skipped } = play([check({ skill: "insight", keptDie: 20, total: 25 })])
    expect(ledger).toHaveLength(0)
    expect(skipped[0]).toEqual(["already_proficient"])
    const expert = sheet({ sheet_skill_proficiencies: { stealth: "expertise" } })
    expect(recordCheck(check({ skill: "stealth", keptDie: 20, total: 30 }), expert, []).skipped).toEqual(["already_proficient"])
  })

  it("once awarded, the ledger stops growing and nothing is due again", () => {
    const { ledger } = play(Array.from({ length: 8 }, (_, i) => check({ campaignDay: i + 1, stakeKey: `b${i}` })))
    const award = buildAward(sheet(), "animal_handling", evaluate(ledger, SAMSON, "animal_handling"), 9)
    ledger.push(award.row)
    const { ledger: after, skipped } = play([check({ campaignDay: 10, stakeKey: "b9", keptDie: 20, total: 21 })], sheet(), ledger)
    expect(after).toHaveLength(ledger.length)
    expect(skipped[0]).toEqual(["already_awarded"])
    expect(evaluate(after, SAMSON, "animal_handling").ready).toBe(false)
    expect(evaluate(after, SAMSON, "animal_handling").inProgress).toBe(false)
  })

  it("nothing retroactive: an empty ledger evaluates to nothing and marks nothing", () => {
    const ev = evaluate([], SAMSON, "animal_handling")
    expect(ev).toMatchObject({ path: null, ready: false, teachingCheckReady: false, inProgress: false, summary: "" })
    expect(skillsInProgress([], SAMSON)).toEqual([])
  })

  it("one character's rows never count for another", () => {
    const { ledger } = play(Array.from({ length: 8 }, (_, i) => check({ campaignDay: i + 1, stakeKey: `b${i}` })))
    expect(evaluate(ledger, ELDETH, "animal_handling").ready).toBe(false)
    expect(evaluate(ledger, ELDETH, "animal_handling").inProgress).toBe(false)
  })

  it("Sam's numbers come from the rules table, not the code", () => {
    const lenient = [
      { path: "practice" as const, threshold: 2, window_days: null, min_dc: 10 },
      { path: "talent" as const, threshold: 2, window_days: 7, min_dc: null },
      { path: "teaching" as const, threshold: 40, window_days: null, min_dc: 12 },
    ]
    const ledger: LedgerRow[] = []
    for (let i = 0; i < 2; i++) ledger.push(...recordCheck(check({ campaignDay: i + 1, stakeKey: `b${i}` }), sheet(), ledger, lenient).rows)
    expect(evaluate(ledger, SAMSON, "animal_handling", lenient).ready).toBe(true)
    expect(evaluate(ledger, SAMSON, "animal_handling", DEFAULT_RULES).ready).toBe(false)
  })
})

describe("The award — two writes, one truth, one line for Malachar", () => {
  it("writes the award row, flips the sheet without losing the forge's entries, and hands Malachar exactly one line", () => {
    const { ledger } = play(Array.from({ length: 8 }, (_, i) => check({ campaignDay: i + 1, stakeKey: `b${i}` })))
    const ev = evaluate(ledger, SAMSON, "animal_handling")
    const award = buildAward(sheet(), "animal_handling", ev, 23, "Insight +3, Religion +2, Animal Handling +1")

    expect(award.row).toMatchObject({ character_id: SAMSON, skill: "animal_handling", kind: "award", stake_key: "practice", campaign_day: 23, teacher_id: null })
    expect(award.sheetSkillProficiencies).toEqual({ Insight: "proficient", Religion: "proficient", "Animal Handling": "proficient" })
    // WIS 12 (+1) + proficiency 2 = +3, replacing the old +1 in the display string.
    expect(award.skillsText).toBe("Insight +3, Religion +2, Animal Handling +3")
    expect(award.relationshipEvent).toBeNull()
    expect(award.promptLine).toBe(
      "PROFICIENCY EARNED: Samson is now proficient in Animal Handling (path: practice, 8 successes over 8 days). Narrate it; do not explain the rule.",
    )
    expect(award.logLine).toBe("Samson is now proficient in Animal Handling.")
  })

  it("a teaching award carries the student's regard for the teacher; practice and talent have no second party", () => {
    const eldeth = sheet({ id: ELDETH, name: "Eldeth", sheet_skill_proficiencies: { "Animal Handling": "proficient" } })
    const ledger: LedgerRow[] = []
    ledger.push(...recordTraining({ characterId: SAMSON, skill: "animal_handling", teacher: eldeth, hours: 40, campaignDay: 1 }, sheet(), ledger).rows)
    ledger.push(...recordCheck(check({ dc: 12, total: 13, campaignDay: 2, stakeKey: `${TEACHING_STAKE_PREFIX}${ELDETH}` }), sheet(), ledger).rows)
    const award = buildAward(sheet(), "animal_handling", evaluate(ledger, SAMSON, "animal_handling"), 2)
    expect(award.row.teacher_id).toBe(ELDETH)
    expect(award.relationshipEvent).toMatchObject({ subject_id: SAMSON, object_id: ELDETH, kind: "taught_proficiency", source: "camp:talk" })
    expect(award.relationshipEvent!.gravity).toBeGreaterThanOrEqual(50)
  })

  it("refuses to build an award nothing earned", () => {
    expect(() => buildAward(sheet(), "animal_handling", evaluate([], SAMSON, "animal_handling"), 1)).toThrow()
  })

  it("patchSkillsText appends when the skill was never listed and leaves an empty string alone", () => {
    expect(patchSkillsText("Insight +3", "stealth", 2)).toBe("Insight +3, Stealth +2")
    expect(patchSkillsText("Sleight of Hand +4, Stealth +0", "stealth", 2)).toBe("Sleight of Hand +4, Stealth +2")
    expect(patchSkillsText("", "stealth", 2)).toBeNull()
    expect(patchSkillsText(null, "stealth", 2)).toBeNull()
  })

  it("the learning mark lists skills with progress and drops the ones already awarded", () => {
    const { ledger } = play([check({ skill: "stealth", stakeKey: "s1" }), check({ skill: "perception", keptDie: 20, total: 21 })])
    expect(skillsInProgress(ledger, SAMSON).sort()).toEqual(["perception", "stealth"])
    ledger.push({ character_id: SAMSON, skill: "stealth", kind: "award", amount: 1, dc: null, stake_key: "practice", teacher_id: null, campaign_day: 9, roll_request_id: null })
    expect(skillsInProgress(ledger, SAMSON)).toEqual(["perception"])
  })
})

describe("The roll request's purpose is the stake", () => {
  it("a camp training test becomes the teaching stake; anything else is itself, settled or not", () => {
    expect(stakeKeyFromPurpose("camp:train:00000000-0000-4000-8000-00000000000b")).toBe(`${TEACHING_STAKE_PREFIX}00000000-0000-4000-8000-00000000000b`)
    expect(stakeKeyFromPurpose("camp:train:t-eldeth:done")).toBe(`${TEACHING_STAKE_PREFIX}t-eldeth`)
    expect(stakeKeyFromPurpose("camp:forage")).toBe("camp:forage")
    expect(stakeKeyFromPurpose("camp:forage:done")).toBe("camp:forage")
    expect(stakeKeyFromPurpose("lock:pen-door")).toBe("lock:pen-door")
    expect(stakeKeyFromPurpose(null)).toBeNull()
    expect(stakeKeyFromPurpose("")).toBeNull()
  })
})

