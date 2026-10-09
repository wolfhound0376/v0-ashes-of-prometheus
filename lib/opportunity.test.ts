import { describe, expect, it } from "vitest"
import {
  clearReactionAtTurnStart,
  forbidsReactions,
  distanceFt,
  hasReaction,
  provokers,
  spendReaction,
  withinReach,
  type OaCombatant,
  type TurnOrderEntry,
} from "./opportunity"

const drow = (over: Partial<OaCombatant> = {}): OaCombatant => ({
  token_id: "drow",
  grid_x: 5,
  grid_y: 5,
  camp: "hostile",
  reach_ft: 5,
  reacted: false,
  incapacitated: false,
  can_see: true,
  ...over,
})

const mover = { token_id: "fifi", camp: "friendly" }
const at = (x: number, y: number) => ({ grid_x: x, grid_y: y })

describe("distance and reach", () => {
  it("counts a diagonal as 5 ft, like the rest of the board", () => {
    expect(distanceFt(at(0, 0), at(1, 1))).toBe(5)
  })

  it("puts an adjacent square inside a 5-ft reach and two squares outside it", () => {
    const d = drow()
    expect(withinReach(d, at(5, 6))).toBe(true)
    expect(withinReach(d, at(5, 7))).toBe(false)
  })

  it("lets a 10-ft reach cover two squares", () => {
    expect(withinReach(drow({ reach_ft: 10 }), at(5, 7))).toBe(true)
  })

  it("falls back to 5 ft when reach is missing or nonsense", () => {
    expect(withinReach(drow({ reach_ft: 0 }), at(5, 6))).toBe(true)
    expect(withinReach(drow({ reach_ft: Number.NaN }), at(5, 7))).toBe(false)
  })
})

describe("provokers — the rule", () => {
  it("charges for stepping out of reach", () => {
    const got = provokers({ mover, from: at(5, 6), to: at(5, 8), others: [drow()] })
    expect(got.map((g) => g.token_id)).toEqual(["drow"])
  })

  it("does NOT charge for moving around inside reach", () => {
    // Circling at arm's length is free. This is the half of the rule people
    // most often get wrong, and getting it wrong makes melee unplayable.
    expect(provokers({ mover, from: at(5, 6), to: at(6, 6), others: [drow()] })).toEqual([])
  })

  it("does not charge for approaching", () => {
    expect(provokers({ mover, from: at(5, 8), to: at(5, 6), others: [drow()] })).toEqual([])
  })

  it("is silent when nobody is near", () => {
    expect(provokers({ mover, from: at(0, 0), to: at(0, 3), others: [drow()] })).toEqual([])
  })

  it("Disengage buys immunity", () => {
    const args = { mover, from: at(5, 6), to: at(5, 8), others: [drow()] }
    expect(provokers(args)).toHaveLength(1)
    expect(provokers({ ...args, disengaged: true })).toEqual([])
  })

  it("allies never swing at you", () => {
    const friend = drow({ token_id: "eldeth", camp: "friendly" })
    expect(provokers({ mover, from: at(5, 6), to: at(5, 8), others: [friend] })).toEqual([])
  })

  it("a spent reaction cannot swing twice", () => {
    expect(provokers({ mover, from: at(5, 6), to: at(5, 8), others: [drow({ reacted: true })] })).toEqual([])
  })

  it("an incapacitated creature does not swing", () => {
    expect(
      provokers({ mover, from: at(5, 6), to: at(5, 8), others: [drow({ incapacitated: true })] }),
    ).toEqual([])
  })

  it("a creature that cannot see the mover does not swing", () => {
    expect(provokers({ mover, from: at(5, 6), to: at(5, 8), others: [drow({ can_see: false })] })).toEqual([])
  })

  it("never swings at itself", () => {
    const self = drow({ token_id: "fifi", camp: "friendly" })
    expect(provokers({ mover, from: at(5, 6), to: at(5, 8), others: [self] })).toEqual([])
  })

  it("a zero-distance move provokes nothing", () => {
    expect(provokers({ mover, from: at(5, 6), to: at(5, 6), others: [drow()] })).toEqual([])
  })

  it("collects every eligible watcher, not just the first", () => {
    const a = drow({ token_id: "a", grid_x: 5, grid_y: 5 })
    const b = drow({ token_id: "b", grid_x: 7, grid_y: 5 })
    const got = provokers({ mover, from: at(6, 5), to: at(6, 9), others: [a, b] })
    expect(got.map((g) => g.token_id)).toEqual(["a", "b"])
  })

  it("a reach weapon still catches someone who only stepped back one square", () => {
    // Leaving a 5-ft attacker is not leaving a 10-ft one.
    const pike = drow({ token_id: "pike", reach_ft: 10 })
    const short = drow({ token_id: "short", reach_ft: 5 })
    const got = provokers({ mover, from: at(5, 6), to: at(5, 7), others: [pike, short] })
    expect(got.map((g) => g.token_id)).toEqual(["short"])
  })

  it("KNOWN LIMIT: a path that leaves reach and returns is not caught", () => {
    // The route only receives endpoints, so this reads as a move inside reach.
    // Asserted deliberately: when the client starts sending real path steps,
    // this test should FAIL and be rewritten, which is the signal that the
    // limitation is gone.
    expect(provokers({ mover, from: at(5, 6), to: at(6, 6), others: [drow()] })).toEqual([])
  })
})

describe("the reaction ledger", () => {
  const order: TurnOrderEntry[] = [{ token_id: "drow" }, { token_id: "fifi" }]

  it("starts with everyone holding a reaction", () => {
    expect(hasReaction(order[0], 1)).toBe(true)
  })

  it("spending removes it for that round only", () => {
    const next = spendReaction(order, "drow", 1)
    expect(hasReaction(next[0], 1)).toBe(false)
    // A stale flag must never disarm a creature in a LATER round — which is
    // the whole reason this stores a round number rather than a boolean.
    expect(hasReaction(next[0], 2)).toBe(true)
  })

  it("does not touch anyone else", () => {
    const next = spendReaction(order, "drow", 1)
    expect(hasReaction(next[1], 1)).toBe(true)
  })

  it("the turn start regains it", () => {
    const spent = spendReaction(order, "drow", 3)
    expect(hasReaction(spent[0], 3)).toBe(false)
    expect(hasReaction(clearReactionAtTurnStart(spent, "drow")[0], 3)).toBe(true)
  })

  it("a token absent from the initiative order holds no reaction", () => {
    // It is not in the fight, so it does not swing. `false` is the safe
    // default here precisely because it REFUSES the attack rather than
    // granting one to something the order has never heard of.
    expect(hasReaction(undefined, 1)).toBe(false)
  })

  it("never mutates the array it was given", () => {
    const before = JSON.stringify(order)
    spendReaction(order, "drow", 1)
    clearReactionAtTurnStart(order, "drow")
    expect(JSON.stringify(order)).toBe(before)
  })
})

describe("forbidsReactions", () => {
  it("lets a healthy creature react", () => {
    expect(forbidsReactions([])).toBe(false)
    expect(forbidsReactions(null)).toBe(false)
    expect(forbidsReactions(undefined)).toBe(false)
  })

  it("stops the five conditions that incapacitate", () => {
    for (const c of ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"]) {
      expect(forbidsReactions([c])).toBe(true)
    }
  })

  it("still lets a PRONE creature swing — it is legal from the floor", () => {
    expect(forbidsReactions(["prone"])).toBe(false)
  })

  it("does not stop a merely frightened or grappled creature", () => {
    expect(forbidsReactions(["frightened", "grappled", "restrained"])).toBe(false)
  })

  it("reads the stored casing the conditions vocabulary actually writes", () => {
    expect(forbidsReactions(["Unconscious"])).toBe(true)
    expect(forbidsReactions([" Stunned "])).toBe(true)
  })
})
