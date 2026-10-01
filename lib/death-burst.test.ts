import { describe, expect, it } from "vitest"
import {
  GAS_SPORE_INFECTION, addMinutes, burstCells, deathBurstFor, formatClock, immuneToDamage, immuneToPoisoned,
  infectionFlagKey, infectionFor, infectionLine, parseDeathBurst,
} from "./death-burst"

// The live bestiary row's traits, exactly as stored (slug gas-spore).
const DEATH_BURST = {
  name: "Death Burst",
  desc: "The gas spore explodes when it drops to 0 hit points. Each creature within 20 feet of it must succeed on a DC 15 Constitution saving throw or take 10 (3d6) poison damage and become infected with a disease on a failed save. Creatures immune to the poisoned condition are immune to this disease. Spores invade an infected creature's system, killing the creature in a number of hours equal to 1d12 + the creature's Constitution score, unless the disease is removed. In half that time, the creature becomes poisoned for the rest of the duration. After the creature dies, it sprouts 2d4 Tiny gas spores that grow to full size in 7 days.",
}
const TRAITS = [
  DEATH_BURST,
  { name: "Eerie Resemblance", desc: "The gas spore resembles a beholder." },
]

describe("parseDeathBurst", () => {
  it("reads every number off the gas spore's own text", () => {
    expect(parseDeathBurst(DEATH_BURST.desc)).toEqual({
      radiusFt: 20, dc: 15, ability: "CON", dice: "3d6", damageType: "poison",
      disease: { hoursDice: "1d12", poisonedAtHalf: true, poisonImmuneAreImmune: true },
    })
  })
  it("is null when the rule is missing a number rather than guessing one", () => {
    expect(parseDeathBurst("The creature explodes. Everyone nearby takes damage.")).toBeNull()
    expect(parseDeathBurst(null)).toBeNull()
  })
})

describe("deathBurstFor", () => {
  it("finds the trait on the gas spore", () => {
    expect(deathBurstFor("gas-spore", TRAITS)?.dc).toBe(15)
  })
  it("is only the gas spore's", () => {
    expect(deathBurstFor("magmin", TRAITS)).toBeNull()
    expect(deathBurstFor(null, TRAITS)).toBeNull()
  })
  it("needs the trait to exist", () => {
    expect(deathBurstFor("gas-spore", [TRAITS[1]])).toBeNull()
    expect(deathBurstFor("gas-spore", null)).toBeNull()
  })
})

describe("burstCells", () => {
  const has = (cells: { x: number; y: number }[], x: number, y: number) => cells.some((c) => c.x === x && c.y === y)
  it("reaches 20 ft (4 squares) straight out and no further", () => {
    const cells = burstCells({ x: 10, y: 10 }, 20, 2)
    expect(has(cells, 14, 10)).toBe(true)
    expect(has(cells, 15, 10)).toBe(false)
    expect(has(cells, 10, 6)).toBe(true)
  })
  it("includes the spore's own square, so a creature on top is caught", () => {
    expect(has(burstCells({ x: 3, y: 3 }, 20), 3, 3)).toBe(true)
  })
  it("adds a Huge body's reach", () => {
    expect(has(burstCells({ x: 10, y: 10 }, 20, 3), 15, 10)).toBe(true)
  })
})

describe("immuneToPoisoned", () => {
  it("reads the bestiary's free text", () => {
    expect(immuneToPoisoned("blinded, deafened, frightened, paralyzed, poisoned, prone")).toBe(true)
    expect(immuneToPoisoned("charmed")).toBe(false)
    expect(immuneToPoisoned(null)).toBe(false)
    expect(immuneToPoisoned(["Poisoned"])).toBe(true)
  })
})

describe("infectionFor", () => {
  const burst = parseDeathBurst(DEATH_BURST.desc)!
  it("is 1d12 + CON score hours, poisoned at half, dated on the campaign clock", () => {
    const r = infectionFor({
      burst, creature: "Kenta", characterId: "c1", conScore: 14, d12: 7,
      now: { day: 3, minutesOfDay: 22 * 60 },
    })!
    expect(r.condition).toBe(GAS_SPORE_INFECTION)
    expect(r.hours).toBe(21)
    expect(r.poisoned_after_hours).toBe(10.5)
    expect(r.poisoned_at).toEqual({ day: 4, minutesOfDay: 8 * 60 + 30 })
    expect(r.dies_at).toEqual({ day: 4, minutesOfDay: 19 * 60 })
    expect(infectionLine(r)).toBe(
      "Kenta is infected: Gas Spore Infection (1d12 7 + CON 14 = 21 hours). Poisoned from Day 4, 08:30; dies at Day 4, 19:00 unless the disease is removed.",
    )
  })
  it("still records the hours when there is no clock to date them by", () => {
    const r = infectionFor({ burst, creature: "Ront", characterId: null, conScore: 16, d12: 1, now: null })!
    expect(r.dies_at).toBeNull()
    expect(infectionLine(r)).toContain("dies after 17 hours")
  })
  it("is null for a burst that carries no disease", () => {
    expect(infectionFor({ burst: { ...burst, disease: null }, creature: "x", characterId: null, conScore: 10, d12: 1, now: null })).toBeNull()
  })
})

describe("clock helpers", () => {
  it("carries across midnight", () => {
    expect(addMinutes({ day: 1, minutesOfDay: 1430 }, 20)).toEqual({ day: 2, minutesOfDay: 10 })
    expect(formatClock({ day: 2, minutesOfDay: 65 })).toBe("Day 2, 01:05")
  })
  it("keys a flag per character, or per NPC name", () => {
    expect(infectionFlagKey({ characterId: "abc", label: "Kenta" })).toBe("gas-spore-infection:abc")
    expect(infectionFlagKey({ characterId: null, label: "Ront " })).toBe("gas-spore-infection:npc:ront")
  })
})

describe("immuneToDamage", () => {
  it("reads the gas spore's own line", () => {
    expect(immuneToDamage("poison", "poison")).toBe(true)
  })
  it("finds poison in a list", () => {
    expect(immuneToDamage("necrotic, poison", "poison")).toBe(true)
    expect(immuneToDamage("fire, poison", "poison")).toBe(true)
  })
  it("reads only the unconditional part of an SRD line", () => {
    const line = "cold, poison; bludgeoning, piercing, and slashing from nonmagical attacks that aren't silvered"
    expect(immuneToDamage(line, "poison")).toBe(true)
    expect(immuneToDamage(line, "piercing")).toBe(false)
  })
  it("is false for nothing, for another type, and for a word inside a word", () => {
    expect(immuneToDamage(null, "poison")).toBe(false)
    expect(immuneToDamage("fire", "poison")).toBe(false)
    expect(immuneToDamage("poisonous", "poison")).toBe(false)
  })
})
