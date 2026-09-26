import { describe, expect, it } from "vitest"
import type { Rng, SheetSlice } from "./game-context"
import {
  canLevelUp,
  canTakeCampAction,
  craftProgress,
  forage,
  levelForXp,
  levelUp,
  levelUpAllowedHere,
  parseHitDie,
  perform,
  resolveWatch,
  rollEncounterTable,
  shortRest,
  songOfRestDie,
  weightRelationshipEvent,
  xpToNext,
  type EncounterRow,
} from "./camp"

/** mulberry32 — same seed, same stream, every run (as lib/game-context.test.ts). */
function seeded(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** Fixed-value rng: every roll lands on `value` of any die. */
const fixed = (value: number, die = 20): Rng => () => (value - 1) / die + 1e-9

const sheet = (over: Partial<SheetSlice> = {}): SheetSlice => ({
  id: "x", name: "Samson", level: 1,
  str_score: 14, dex_score: 12, con_score: 14, int_score: 10, wis_score: 16, cha_score: 10,
  sheet_skill_proficiencies: { Survival: "proficient", Performance: "proficient" },
  ...over,
})

describe("camp action budget (house rule)", () => {
  it("sleep is always free; other actions spend the budget", () => {
    expect(canTakeCampAction(0, "sleep").ok).toBe(true)
    expect(canTakeCampAction(0, "forage").ok).toBe(false)
    expect(canTakeCampAction(1, "forage").ok).toBe(true)
  })
})

describe("short rest — SRD Resting", () => {
  const rester = (over = {}) => ({
    id: "s", name: "Samson", level: 3, hp: 10, hpMax: 24, conScore: 14,
    sheetHitDice: "3d8", hitDiceRemaining: 3, spend: 2, ...over,
  })

  it("parses the sheet's Hit Die", () => {
    expect(parseHitDie("3d8")).toBe(8)
    expect(parseHitDie("1d12")).toBe(12)
    expect(parseHitDie("d7")).toBeNull()
    expect(parseHitDie(null)).toBeNull()
  })

  it("each die is roll + CON, minimum 0 per die, and dice are deducted", () => {
    // d8 always 1, CON 14 → +2 → 3 per die; two dice → 6
    const r = shortRest([rester()], fixed(1, 8))
    expect(r.outcomes[0].healed).toBe(6)
    expect(r.outcomes[0].hitDiceRemaining).toBe(1)
    // CON 6 (−2) rolling 1 → max(0, −1) = 0 per die
    const r2 = shortRest([rester({ conScore: 6 })], fixed(1, 8))
    expect(r2.outcomes[0].healed).toBe(0)
  })

  it("never spends more dice than owned and never overheals", () => {
    const r = shortRest([rester({ spend: 9, hp: 23 })], fixed(8, 8))
    expect(r.outcomes[0].diceSpent).toBeLessThanOrEqual(3)
    expect(r.outcomes[0].hp).toBe(24)
    expect(r.outcomes[0].healed).toBe(1)
  })

  it("full hit points → no dice spent", () => {
    const r = shortRest([rester({ hp: 24 })], seeded(1))
    expect(r.outcomes[0].diceSpent).toBe(0)
  })

  it("Song of Rest adds one extra die to anyone who spent a Hit Die, scaling by bard level", () => {
    expect(songOfRestDie(1)).toBe(0)
    expect(songOfRestDie(2)).toBe(6)
    expect(songOfRestDie(9)).toBe(8)
    expect(songOfRestDie(13)).toBe(10)
    expect(songOfRestDie(17)).toBe(12)
    const bard = rester({ id: "b", name: "Scott", bardLevel: 2, sheetHitDice: "3d8", spend: 0 })
    const r = shortRest([rester(), bard], fixed(1, 8))
    expect(r.bard?.name).toBe("Scott")
    expect(r.outcomes[0].songOfRest).toBe(1)
    expect(r.outcomes[0].healed).toBe(7) // 3+3 from dice + 1 song
    expect(r.outcomes[1].songOfRest).toBeNull() // the bard spent nothing
  })

  it("warlock pact slots come back even without spending a die; dying and 0-hp gain nothing", () => {
    const r = shortRest([rester({ pact: true, spend: 0 }), rester({ id: "d", dying: true }), rester({ id: "z", hp: 0 })], seeded(2))
    expect(r.outcomes[0].pactSlotsRestored).toBe(true)
    expect(r.outcomes[1].healed).toBe(0)
    expect(r.outcomes[2].healed).toBe(0)
    expect(r.flags.some((f) => f.includes("Channel Divinity"))).toBe(true)
  })
})

describe("the watch — encounter tables as data", () => {
  const rows: EncounterRow[] = [
    { table_key: "underdark_random", roll_min: 1, roll_max: 13, result: "No encounter" },
    { table_key: "underdark_random", roll_min: 14, roll_max: 15, result: "Terrain" },
    { table_key: "underdark_random", roll_min: 16, roll_max: 17, result: "One or more creatures" },
    { table_key: "underdark_random", roll_min: 18, roll_max: 20, result: "Terrain featuring one or more creatures" },
    { table_key: "underdark_creature", roll_min: 1, roll_max: 18, result: "Spore servants" },
    { table_key: "underdark_creature", roll_min: 19, roll_max: 20, result: "Traders" },
  ]
  it("maps the roll to the row and classifies it", () => {
    expect(rollEncounterTable(rows, "underdark_random", 20, fixed(7)).kind).toBe("none")
    expect(rollEncounterTable(rows, "underdark_random", 20, fixed(14)).kind).toBe("terrain")
    expect(rollEncounterTable(rows, "underdark_random", 20, fixed(16)).kind).toBe("creatures")
    expect(rollEncounterTable(rows, "underdark_random", 20, fixed(19)).kind).toBe("terrain_creatures")
  })
  it("a missing table is reported, not invented", () => {
    const w = rollEncounterTable(rows, "barovia_random", 20, fixed(5))
    expect(w.result).toBeNull()
    expect(w.note).toContain("NO ROW")
  })
  it("a safe node rolls nothing; a creature result rolls the creature table (positive tail included)", () => {
    expect(resolveWatch({ safe: true }, rows, seeded(1)).interrupted).toBe(false)
    const w = resolveWatch({}, rows, fixed(20))
    expect(w.interrupted).toBe(true)
    expect(w.creature?.result).toBe("Traders")
  })
})

describe("foraging — OotA-Enc p.25 / DMG p.111", () => {
  it("fast pace forbids it", () => {
    expect(forage(sheet(), seeded(1), { pace: "fast" }).allowed).toBe(false)
  })
  it("success yields d6 + WIS days of supplies; failure yields nothing", () => {
    // d20 = 20 → 20 + WIS 3 + prof 2 = 25 ≥ 15; then d6 = 6 → 6 + 3 = 9
    const ok = forage(sheet(), fixed(20), {})
    expect(ok.check?.success).toBe(true)
    expect(ok.supplies).toBe(9)
    const bad = forage(sheet(), fixed(1), {})
    expect(bad.supplies).toBe(0)
  })
  it("slow pace rolls with advantage", () => {
    expect(forage(sheet(), seeded(3), { pace: "slow" }).check?.mode).toBe("advantage")
  })
})

describe("levelling — SRD Character Advancement", () => {
  it("thresholds", () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(299)).toBe(1)
    expect(levelForXp(300)).toBe(2)
    expect(levelForXp(6500)).toBe(5)
    expect(xpToNext(1)).toBe(300)
    expect(xpToNext(5)).toBe(14000)
    expect(xpToNext(20)).toBe(0)
    expect(canLevelUp({ xp: 300, level: 1 })).toBe(true)
    expect(canLevelUp({ xp: 299, level: 1 })).toBe(false)
  })
  it("is gated to camp unless the node allows it (house rule)", () => {
    expect(levelUpAllowedHere("camp").ok).toBe(true)
    expect(levelUpAllowedHere("exploration").ok).toBe(false)
    expect(levelUpAllowedHere("exploration", { allowsLevelUp: true }).ok).toBe(true)
  })
  const kenta = {
    name: "Kenta", class: "Sorcerer", level: 1, xp: 300, hpMax: 8, conScore: 14,
    sheetHitDice: "1d6", hitDiceRemaining: 1, slots: { "1": { max: 2, used: 1 } }, method: "fixed" as const,
  }
  it("fixed method uses the rounded-up average; roll method rolls the Hit Die", () => {
    const f = levelUp(kenta, seeded(1))
    expect(f.ok).toBe(true)
    expect(f.level).toBe(2)
    expect(f.hpRoll).toBe(4) // ceil(7/2)
    expect(f.hpGain).toBe(6) // 4 + CON 2
    expect(f.hpMax).toBe(14)
    expect(f.sheetHitDice).toBe("2d6")
    expect(f.hitDiceRemaining).toBe(2)
    expect(f.xpToNext).toBe(900)
    expect(f.proficiencyBonus).toBe(2)
    const r = levelUp({ ...kenta, method: "roll" }, fixed(6, 6))
    expect(r.hpRoll).toBe(6)
    expect(r.hpGain).toBe(8)
  })
  it("minimum 1 hp per level (PHB reading, flagged)", () => {
    const r = levelUp({ ...kenta, conScore: 3, method: "roll" }, fixed(1, 6))
    expect(r.hpGain).toBe(1)
    expect(r.flags.some((f) => f.includes("Minimum 1"))).toBe(true)
  })
  it("full casters get the next row of the slot table with `used` preserved", () => {
    const r = levelUp(kenta, seeded(1))
    expect(r.slots).toEqual({ "1": { max: 3, used: 1 } })
    const l3 = levelUp({ ...kenta, level: 2, xp: 900, slots: r.slots }, seeded(1))
    expect(l3.slots).toEqual({ "1": { max: 4, used: 1 }, "2": { max: 2, used: 0 } })
  })
  it("refuses multiclass sheets and one level at a time", () => {
    const m = levelUp({ ...kenta, class: "Rogue 3 / Warlock 2", level: 5, xp: 14000 }, seeded(1))
    expect(m.ok).toBe(false)
    expect(m.reason).toContain("multiclass")
    const two = levelUp({ ...kenta, xp: 900 }, seeded(1))
    expect(two.level).toBe(2)
    expect(two.flags.some((f) => f.includes("one level at a time"))).toBe(true)
  })
  it("lists ASI and features as pending choices", () => {
    const r = levelUp({ ...kenta, level: 3, xp: 2700 }, seeded(1))
    expect(r.pendingChoices.some((p) => p.includes("Ability Score Improvement"))).toBe(true)
  })
})

describe("crafting — SRD Downtime", () => {
  const dagger = { slug: "dagger", name: "Dagger", value: 2, craft: { tools: "Smith's Tools", requires: "forge" } }
  const plate = { slug: "plate", name: "Plate", value: 1500, craft: { tools: "Smith's Tools", requires: "forge" } }
  const smith = { name: "Eldeth", toolProficiencies: ["Smith's Tools"] }
  it("5 gp per day, materials half value, tool proficiency and location required", () => {
    expect(craftProgress(dagger, smith, 0, { nodeProvides: ["forge"] }).complete).toBe(true)
    const p = craftProgress(plate, smith, 0, { nodeProvides: ["forge"] })
    expect(p.daysTotal).toBe(300)
    expect(p.materialsGp).toBe(750)
    expect(p.progressGp).toBe(5)
    expect(craftProgress(dagger, { name: "Kenta", toolProficiencies: [] }, 0, { nodeProvides: ["forge"] }).ok).toBe(false)
    expect(craftProgress(dagger, smith, 0, {}).ok).toBe(false)
  })
  it("an item without craft data is not craftable — never improvised", () => {
    expect(craftProgress({ slug: "x", name: "Mystery", value: 10 }, smith, 0).ok).toBe(false)
  })
})

describe("talk and perform", () => {
  it("positive events land at palliation weight, negatives at full", () => {
    const pos = weightRelationshipEvent({ subjectId: "a", objectId: "b", kind: "confession", gravity: 40, deltas: { trust: 10 } })
    expect(pos.positive).toBe(true)
    expect(pos.appliedGravity).toBe(26)
    expect(pos.row.deltas.trust).toBe(6.5)
    const neg = weightRelationshipEvent({ subjectId: "a", objectId: "b", kind: "insult", gravity: 40, deltas: { resentment: 10 } })
    expect(neg.appliedGravity).toBe(40)
    expect(neg.row.deltas.resentment).toBe(10)
  })
  it("perform is one Performance check read as a band", () => {
    expect(perform(sheet(), fixed(20)).band).toBe("moving")
    expect(perform(sheet(), fixed(1)).band).toBe("flat")
  })
})
