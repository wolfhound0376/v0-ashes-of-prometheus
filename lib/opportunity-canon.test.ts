import { describe, expect, it } from "vitest"
import { meleeReachFt, opportunityAttack, type Combatant } from "./npc-ai"
import { provokers, type OaCombatant } from "./opportunity"

// Verified against the LIVE bestiary rather than invented prose. Every blob
// below is copied from the real `bestiary.actions` on 2026-10-09, because the
// whole reach rule depends on parsing the book's own sentence and a
// hand-written fixture would only ever prove that the parser agrees with me.

const GRELL = JSON.parse(
  '[{"desc":"Two attacks: one with its tentacles and one with its beak.","name":"Multiattack"},' +
  '{"desc":"One creature. Hit: 7 (1d10+2) piercing.","name":"Tentacles","reach":"10 ft.","to_hit":"+4"},' +
  '{"desc":"Hit: 7 (2d4+2) piercing.","name":"Beak","reach":"5 ft.","to_hit":"+4"}]',
)
const RONT = JSON.parse(
  '[{"desc":"Hit: 9 (1d12+3) slashing.","name":"Greataxe","reach":"5 ft.","to_hit":"+5"}]',
)
const JIMJAR = JSON.parse("[]")
const STOOL = JSON.parse(
  '[{"desc":"Hit: 1 (1d4-1) bludgeoning plus 2 (1d4) poison.","name":"Fist","reach":"5 ft.","to_hit":"+1"}]',
)

describe("reach, read off real stat blocks", () => {
  it("gives the grell its 10 ft from the tentacles, not the beak", () => {
    expect(meleeReachFt(GRELL)).toBe(10)
  })

  it("gives Ront's greataxe 5 ft", () => {
    expect(meleeReachFt(RONT)).toBe(5)
  })

  it("falls back to 5 ft for a creature with no actions at all (Jimjar)", () => {
    expect(meleeReachFt(JIMJAR)).toBe(5)
  })
})

describe("a grell threatens two squares", () => {
  const grell = (over: Partial<OaCombatant> = {}): OaCombatant => ({
    token_id: "grell",
    grid_x: 5,
    grid_y: 5,
    camp: "hostile",
    reach_ft: meleeReachFt(GRELL),
    reacted: false,
    incapacitated: false,
    can_see: true,
    ...over,
  })
  const mover = { token_id: "fifi", camp: "friendly" }

  it("stepping from 2 squares to 3 provokes", () => {
    const got = provokers({
      mover,
      from: { grid_x: 5, grid_y: 7 },
      to: { grid_x: 5, grid_y: 8 },
      others: [grell()],
    })
    expect(got).toHaveLength(1)
  })

  it("stepping from 1 square to 2 does NOT — still inside the tentacles", () => {
    expect(
      provokers({
        mover,
        from: { grid_x: 5, grid_y: 6 },
        to: { grid_x: 5, grid_y: 7 },
        others: [grell()],
      }),
    ).toEqual([])
  })
})

describe("opportunityAttack against a real stat block", () => {
  const self = (actions: unknown): Combatant & { actions?: unknown } => ({
    token_id: "ront",
    label: "Ront",
    kind: "npc",
    x: 5,
    y: 5,
    hp_current: 30,
    hp_max: 30,
    ac: 13,
    conditions: [],
  })
  const target: Combatant = {
    token_id: "fifi",
    label: "Fifi of Copperas Cove",
    kind: "pc",
    x: 5,
    y: 6,
    hp_current: 9,
    hp_max: 9,
    ac: 14,
    conditions: [],
  }

  it("swings with the greataxe and says so", () => {
    // Seeded so the assertion is about the shape, not the luck.
    let n = 0
    const rng = () => [0.95, 0.3, 0.5][n++ % 3]
    const out = opportunityAttack({ self: self(RONT), actions: RONT, target, rng })
    expect(out).not.toBeNull()
    expect(out!.attack.name).toBe("Greataxe")
    expect(out!.narration.startsWith("Opportunity attack — ")).toBe(true)
  })

  it("returns null when the creature has no melee attack — no reaction is burned", () => {
    expect(opportunityAttack({ self: self(JIMJAR), actions: JIMJAR, target })).toBeNull()
  })

  it("still resolves for a 1-damage myconid sprout", () => {
    const out = opportunityAttack({ self: self(STOOL), actions: STOOL, target })
    expect(out!.attack.name).toBe("Fist")
  })

  it("a hit never deals negative damage however the dice fall", () => {
    for (let seed = 0; seed < 60; seed++) {
      let n = seed
      const rng = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
      const out = opportunityAttack({ self: self(STOOL), actions: STOOL, target, rng })
      expect(out!.damage).toBeGreaterThanOrEqual(0)
    }
  })
})
