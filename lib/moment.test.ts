import { describe, expect, it } from "vitest"
import { buildMoment, knownNames, momentBrief, nameForSlug, type CardLite, type WalkRow } from "./moment"

const cards: CardLite[] = [
  { key: "malachar", name: "Malachar", aliases: [], agenda: { wants: "the party broken" } },
  { key: "eldeth", name: "Eldeth Feldrun", aliases: ["Eldeth"], sprite_slug: "eldeth", agenda: { wants: "home to Gauntlgrym" } },
  { key: "buppido", name: "Buppido", aliases: [], sprite_slug: "buppido", agenda: { secret: "he is the killer" } },
  { key: "jorlan", name: "Jorlan Duskryn", aliases: ["Jorlan"], agenda: {} },
]
const KENTA = "51e4202d-b4d5-4658-a9c1-6102713e77f1"
const FIFI = "d00aa5b8-ced1-477d-9ec8-0861cca55498"

// Shaped like the live walk_world rows of 2026-11-23.
const rows: WalkRow[] = [{
  plate: "battle-pen-gate",
  state: {
    battle: { label: "the breakout at the pen gate", plate: "battle-pen-gate", foes: ["drow-guard-female"], allies: ["eldeth"], over: null },
    company: ["eldeth", "buppido", "topsy", "pet-spider"],
    companyAt: { eldeth: "battle-pen-gate", buppido: "10", topsy: "battle-pen-gate", "pet-spider": "battle-pen-gate" },
  },
  heroes: { kenta: { cid: KENTA, plate: "battle-pen-gate" }, freia: { cid: FIFI, plate: "10" } },
}]

describe("THE MOMENT", () => {
  it("knows the hero's plate, the fight on it, and who is actually with them", () => {
    const m = buildMoment({ rows, characterId: KENTA, cards })
    expect(m.plate).toBe("battle-pen-gate")
    expect(m.fight?.label).toBe("the breakout at the pen gate")
    expect(m.fight?.allies).toEqual(["Eldeth Feldrun"])
    expect(m.present).toEqual(["Eldeth Feldrun", "Topsy", "pet spider"])
    expect(m.present).not.toContain("Buppido") // he is on another plate
  })

  it("does not hand a hero a fight on another plate", () => {
    const m = buildMoment({ rows, characterId: FIFI, cards })
    expect(m.plate).toBe("10")
    expect(m.fight).toBeNull()
    expect(m.present).toEqual(["Buppido"])
  })

  it("an ended fight is no fight", () => {
    const ended = [{ ...rows[0], state: { ...rows[0].state, battle: { ...(rows[0].state!.battle as object), over: 1 } } }]
    expect(buildMoment({ rows: ended, characterId: KENTA, cards }).fight).toBeNull()
  })

  it("the NPC being talked to authors the options; otherwise Malachar does", () => {
    expect(buildMoment({ rows, characterId: FIFI, cards, talkingTo: "Buppido" }).author).toMatchObject({ name: "Buppido", secret: "he is the killer" })
    expect(buildMoment({ rows, characterId: KENTA, cards, talkingTo: "Eldeth" }).author.name).toBe("Eldeth Feldrun")
    expect(buildMoment({ rows, characterId: KENTA, cards }).author.name).toBe("Malachar")
    expect(buildMoment({ rows, characterId: KENTA, cards, talkingTo: "a drow guard" }).author.name).toBe("Malachar")
  })

  it("a waiting roll leads the brief", () => {
    const m = buildMoment({ rows, characterId: KENTA, cards, roll: { skill: "Stealth", purpose: "slip past the gate" } })
    expect(momentBrief(m)).toMatch(/A ROLL IS WAITING for this hero: Stealth \(slip past the gate\)/)
    expect(momentBrief(m)).toMatch(/A FIGHT IS ON/)
  })

  it("an unknown hero gets an empty moment, never a guess", () => {
    const m = buildMoment({ rows, characterId: "00000000-0000-0000-0000-000000000000", cards })
    expect(m.plate).toBeNull()
    expect(m.present).toEqual([])
  })

  it("names: slugs become people, and first names count", () => {
    expect(nameForSlug("eldeth", cards)).toBe("Eldeth Feldrun")
    expect(nameForSlug("pet-spider", cards)).toBe("pet spider")
    expect(knownNames(cards)).toEqual(expect.arrayContaining(["Jorlan", "Jorlan Duskryn", "Eldeth"]))
  })
})
