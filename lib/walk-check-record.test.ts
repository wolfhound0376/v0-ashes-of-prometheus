import { describe, it, expect } from "vitest"
import { walkResolvedCheck, walkStakeKey } from "./walk-check-record"
import { WALK_ACTIONS, pickpocketKey, type WalkActionKey } from "./walk-roll"

const CHAR = "11111111-1111-4111-8111-111111111111"
const base = { characterId: CHAR, natural: 14, total: 19, campaignDay: 3 }

describe("walkResolvedCheck", () => {
  it("maps a skill check to the ledger's shape, DC and all", () => {
    const got = walkResolvedCheck({ ...base, action: "pen-gate:force" })
    expect(got).toEqual({
      characterId: CHAR,
      skill: "athletics",
      dc: 20,
      keptDie: 14,
      total: 19,
      campaignDay: 3,
      stakeKey: "walk:pen-gate:force",
      rollRequestId: null,
    })
  })

  it("refuses a TOOL check — there is no rung for thieves' tools", () => {
    expect(WALK_ACTIONS["pen-gate:pick"].check.kind).toBe("tool")
    expect(walkResolvedCheck({ ...base, action: "pen-gate:pick" })).toBeNull()
  })

  it("refuses a bare ABILITY check — the lift's spool is a Strength check, not a skill", () => {
    expect(WALK_ACTIONS["lift:spool"].check.kind).toBe("ability")
    expect(walkResolvedCheck({ ...base, action: "lift:spool" })).toBeNull()
  })

  it("carries the kept die, not the first die, so advantage is honoured", () => {
    const got = walkResolvedCheck({ ...base, natural: 20, total: 25, action: "falls:look" })
    expect(got?.keptDie).toBe(20)
  })

  it("refuses an action key that is not in the registry", () => {
    expect(walkResolvedCheck({ ...base, action: "pen-gate:dance" as WalkActionKey })).toBeNull()
  })

  it("every skill row in the registry maps, and every non-skill row does not", () => {
    for (const key of Object.keys(WALK_ACTIONS) as WalkActionKey[]) {
      const expected = WALK_ACTIONS[key].check.kind === "skill"
      expect(walkResolvedCheck({ ...base, action: key }) !== null).toBe(expected)
    }
  })

  it("passes the registry's own DC through unchanged — nothing is re-judged here", () => {
    for (const key of Object.keys(WALK_ACTIONS) as WalkActionKey[]) {
      const got = walkResolvedCheck({ ...base, action: key })
      if (got) expect(got.dc).toBe(WALK_ACTIONS[key].dc)
    }
  })
})

describe("walkStakeKey", () => {
  it("collapses every pickpocket row to one stake", () => {
    // Otherwise a thief banks eight 'fresh' successes in a day by choosing
    // marks with different passive Perception. It is the same act.
    expect(walkStakeKey(pickpocketKey(12))).toBe("walk:pickpocket")
    expect(walkStakeKey(pickpocketKey(14))).toBe("walk:pickpocket")
    expect(walkStakeKey(pickpocketKey(12))).toBe(walkStakeKey(pickpocketKey(30)))
  })

  it("keeps distinct acts distinct", () => {
    expect(walkStakeKey("labor:water")).not.toBe(walkStakeKey("labor:pots"))
    expect(walkStakeKey("pen-gate:force")).toBe("walk:pen-gate:force")
  })

  it("gives every registry row a stake that is namespaced to the walk", () => {
    for (const key of Object.keys(WALK_ACTIONS) as WalkActionKey[]) {
      expect(walkStakeKey(key)).toMatch(/^walk:/)
    }
  })
})
