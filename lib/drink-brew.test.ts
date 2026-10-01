import { describe, it, expect } from "vitest"
import {
  drinkBrew, DRINK_EFFECTS, RIDERS, TIER_ROUNDS, HEAL_DICE, HARM_DICE, SAVE_DC,
} from "@/lib/drink-brew"
import { TASTE_SAVE_DC } from "@/lib/eat-it-and-see"

const blob = (over: Record<string, unknown> = {}) => ({
  effects: ["restore-health"], potency: 2, impurity: 0, rune: null, base: "water", ...over,
})

describe("refusals", () => {
  it("refuses a row with no brew blob", () => {
    expect(drinkBrew(null)).toMatchObject({ ok: false, reason: "not_a_brew" })
    expect(drinkBrew("potion")).toMatchObject({ ok: false, reason: "not_a_brew" })
  })
  it("refuses a potency that is not a tier", () => {
    expect(drinkBrew(blob({ potency: 4 }))).toMatchObject({ ok: false, reason: "not_a_brew" })
    expect(drinkBrew(blob({ potency: 0 }))).toMatchObject({ ok: false, reason: "not_a_brew" })
    expect(drinkBrew(blob({ potency: "II" }))).toMatchObject({ ok: false, reason: "not_a_brew" })
  })
  it("refuses a brew carrying no effects", () => {
    expect(drinkBrew(blob({ effects: [] }))).toMatchObject({ ok: false, reason: "no_effects" })
    expect(drinkBrew(blob({ effects: [1, 2] }))).toMatchObject({ ok: false, reason: "no_effects" })
  })
})

describe("potency scales magnitude and duration", () => {
  it("heals on the SRD ladder at tiers I and II", () => {
    expect((drinkBrew(blob({ potency: 1 })) as any).heal).toBe("2d4+2")
    expect((drinkBrew(blob({ potency: 2 })) as any).heal).toBe("4d4+4")
  })
  it("stops tier III short of the SRD superior potion on purpose", () => {
    // 8d4+8 is three workweeks of XGE downtime crafting. One good roll at a
    // camp bench must not match it, or the crafting rules stop mattering.
    expect(HEAL_DICE[3]).toBe("6d4+6")
    expect(HEAL_DICE[3]).not.toBe("8d4+8")
  })
  it("lengthens durations a decade per tier", () => {
    const at = (t: number) => (drinkBrew(blob({ effects: ["soft-step"], potency: t })) as any)
      .effects.find((e: any) => e.kind === "condition").rounds
    expect(at(1)).toBe(TIER_ROUNDS[1])
    expect(at(2)).toBe(TIER_ROUNDS[2])
    expect(at(3)).toBe(TIER_ROUNDS[3])
    expect(TIER_ROUNDS[2]).toBe(TIER_ROUNDS[1] * 10)
  })
  it("scales harmful dice too", () => {
    const harm = (t: number) => (drinkBrew(blob({ effects: ["rot"], potency: t })) as any).harm
    expect(harm(1)).toEqual({ dice: HARM_DICE[1], type: "necrotic" })
    expect(harm(3)).toEqual({ dice: HARM_DICE[3], type: "necrotic" })
  })
})

describe("a brew can heal and harm the same drinker", () => {
  // ripplebark + edible-mushrooms genuinely shares restore-health AND rot.
  const r = () => drinkBrew(blob({ effects: ["restore-health", "rot"], potency: 2 })) as any

  it("reports both", () => {
    expect(r().heal).toBe("4d4+4")
    expect(r().harm).toEqual({ dice: "2d6", type: "necrotic" })
  })
  it("names the healing first, because the route applies it first", () => {
    // Applied the other way a drinker at 1 hp drops before the healing lands,
    // which turns an interesting potion into a coin flip on unconsciousness.
    const s: string = r().summary
    expect(s.indexOf("heals")).toBeLessThan(s.indexOf("necrotic"))
  })
})

describe("impurity riders — spec §5", () => {
  it("adds nothing at impurity 0", () => {
    const d = drinkBrew(blob({ impurity: 0 })) as any
    expect(d.rider).toBeNull()
    expect(d.conditions).toEqual([])
  })
  it("lays Residue, Tainted and Corrupted at 1, 2 and 3", () => {
    for (const [n, name] of [[1, "Residue"], [2, "Tainted"], [3, "Corrupted"]] as const) {
      const d = drinkBrew(blob({ impurity: n })) as any
      expect(d.rider.condition).toBe(name)
      expect(d.conditions).toContain(name)
    }
  })
  it("NEVER stops the potion working — the load-bearing rule", () => {
    const clean = drinkBrew(blob({ impurity: 0 })) as any
    const filthy = drinkBrew(blob({ impurity: 3 })) as any
    expect(filthy.heal).toBe(clean.heal)
    expect(filthy.potency).toBe(clean.potency)
  })
  it("clamps a nonsense impurity rather than inventing a fourth rider", () => {
    expect((drinkBrew(blob({ impurity: 9 })) as any).rider.condition).toBe("Corrupted")
    expect((drinkBrew(blob({ impurity: -4 })) as any).rider).toBeNull()
    expect(RIDERS[4]).toBeUndefined()
  })
  it("leaves the DM to pick which residue, rather than choosing for them", () => {
    expect(RIDERS[1].text).toMatch(/DM picks/)
  })
})

describe("an effect the engine cannot mechanise is never silent", () => {
  it("hands an unknown slug to the DM by name", () => {
    const d = drinkBrew(blob({ effects: ["restore-health", "glow-in-the-dark"] })) as any
    expect(d.unknownEffects).toEqual(["glow-in-the-dark"])
    expect(d.effects.some((e: any) => e.kind === "dm" && e.text.includes("glow-in-the-dark"))).toBe(true)
  })
  it("still applies the effects it does know alongside it", () => {
    const d = drinkBrew(blob({ effects: ["restore-health", "glow-in-the-dark"] })) as any
    expect(d.heal).toBe("4d4+4")
  })
  it("gives every known effect a dm line too, so a condition word is never bare", () => {
    const d = drinkBrew(blob({ effects: ["soft-step"] })) as any
    expect(d.effects.filter((e: any) => e.kind === "dm")).toHaveLength(1)
    expect(d.unknownEffects).toEqual([])
  })
})

describe("the effect table", () => {
  it("covers all 22 grid effects", () => {
    expect(Object.keys(DRINK_EFFECTS)).toHaveLength(22)
  })
  it("gives every row dm text — a condition word alone tells Malachar nothing", () => {
    for (const [slug, spec] of Object.entries(DRINK_EFFECTS)) {
      expect(spec.dm, slug).toBeTruthy()
      expect(spec.dm.length, slug).toBeGreaterThan(20)
    }
  })
  it("keeps inner-light double-edged, which is the point of it", () => {
    expect(DRINK_EFFECTS["inner-light"].dm).toMatch(/disadvantage on Stealth/i)
  })
  it("puts a save only on the genuinely hostile effects", () => {
    const withSave = Object.entries(DRINK_EFFECTS).filter(([, s]) => s.save).map(([k]) => k)
    expect(withSave.sort()).toEqual(["confuse", "seize", "sicken"])
  })
  it("uses SRD condition words where SRD has one", () => {
    expect(DRINK_EFFECTS.sicken.condition).toBe("Poisoned")
    expect(DRINK_EFFECTS.seize.condition).toBe("Restrained")
  })
})

describe("exhaustion", () => {
  it("long-march lifts a level", () => {
    expect((drinkBrew(blob({ effects: ["long-march"] })) as any).exhaustionDelta).toBe(-1)
  })
  it("is zero for a brew that does not carry it", () => {
    expect((drinkBrew(blob()) as any).exhaustionDelta).toBe(0)
  })
})

describe("the dose is honest about being homebrew", () => {
  it("carries a flag the route can surface to the DM", () => {
    expect((drinkBrew(blob()) as any).flags.join(" ")).toMatch(/HOMEBREW/)
  })
})

describe("effects do only what the grid doc says they do", () => {
  it("sicken lays the poisoned condition and deals NO damage", () => {
    // numbing-venom is the row that deals poison damage. An earlier draft of
    // the table gave sicken both, which is a rule nobody wrote.
    const d = drinkBrew({ effects: ["sicken"], potency: 2, impurity: 0 }) as any
    expect(d.harm).toBeNull()
    expect(d.conditions).toContain("Poisoned")
  })
  it("numbing-venom is the one that bites", () => {
    const d = drinkBrew({ effects: ["numbing-venom"], potency: 2, impurity: 0 }) as any
    expect(d.harm).toEqual({ dice: "2d6", type: "poison" })
  })
})

describe("the save DC scales with potency — Sam's ruling 2026-09-30", () => {
  it("is harder to shrug off a stronger brew", () => {
    const dc = (t: number) => (drinkBrew({ effects: ["sicken"], potency: t, impurity: 0 }) as any).saveDc
    expect(dc(1)).toBe(10)
    expect(dc(2)).toBe(12)
    expect(dc(3)).toBe(14)
  })
  it("anchors tier I to the tasting DC rather than copying the number", () => {
    // Sam ruled DC 10 for "column 1 happens to you". A brew doing the same
    // thing to the same throat is the same event, so the two must move
    // together if he ever changes it.
    expect(SAVE_DC[1]).toBe(TASTE_SAVE_DC)
  })
  it("stays inside the published poison band", () => {
    // SRD: basic poison DC 10, serpent venom 11, drow poison 13, wyvern 15.
    expect(SAVE_DC[3]).toBeGreaterThan(13)
    expect(SAVE_DC[3]).toBeLessThan(15)
  })
})
