import { describe, expect, it } from "vitest"
import { foesOf, passiveFromSenses, resolveStance, stanceOptions } from "./stance"
import type { SheetSlice } from "../game-context"

const senses = { Orog: "darkvision 60 ft., passive Perception 10", Grick: "darkvision 60 ft., passive Perception 12" }
const orogs = [
  { table_key: "underdark_random", result: "Creature", detail: { rolls: ["underdark_creature"] } },
  { table_key: "underdark_creature", result: "Ambushers", detail: { rolls: ["underdark_ambush"] } },
  { table_key: "underdark_ambush", result: "1d4 orogs perching on ledges", detail: { bestiary: "Orog" } },
]
const raiders = [{ table_key: "underdark_creature", result: "Raiders", detail: {} }]
const society = [{ table_key: "underdark_creature", result: "Society of Brilliance", detail: {} }]
const crawler = [{ table_key: "underdark_creature", result: "Carrion crawler", detail: { bestiary: "Carrion Crawler" } }]
const hero = (name: string, dex: number): SheetSlice => ({ id: name, name, level: 3, str_score: 10, dex_score: dex, con_score: 10, int_score: 10, wis_score: 10, cha_score: 10, proficiency_bonus: 2, sheet_skill_proficiencies: {} })
const fixed = (d20: number) => () => (d20 - 1) / 20 + 0.001
const keys = (o: { key: string }[]) => o.map((x) => x.key)

describe("the encounter box (Sam, 2026-11-12)", () => {
  it("reads passive Perception from the stat block's senses line, and nothing when it is silent", () => {
    expect(passiveFromSenses("blindsight 30 ft., passive Perception 8")).toBe(8)
    expect(passiveFromSenses("darkvision 60 ft.")).toBeNull()
    expect(passiveFromSenses(null)).toBeNull()
  })
  it("a row that only sends you on is not a creature; ambushers are hostile and do not parley", () => {
    const f = foesOf(orogs, senses)
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ bestiary: "Orog", passive: 10, manner: "hostile", talks: false })
    expect(f[0].line).toContain("ambush")
  })
  it("manner comes only from the book: raiders hostile, the Society peaceable, the unlinked unknown", () => {
    expect(foesOf(raiders, {})[0]).toMatchObject({ manner: "hostile", talks: true, passive: null })
    expect(foesOf(society, {})[0]).toMatchObject({ manner: "peaceable", talks: true })
    expect(foesOf(crawler, {})[0]).toMatchObject({ manner: null, talks: false, line: null, passive: null })
    expect(foesOf([{ table_key: "underdark_terrain", result: "Rockfall", detail: {} }], {})).toEqual([])
  })
  it("saw them first: slip past and ambush; slip past only at a slow pace and only with a known stat block", () => {
    const foes = foesOf(orogs, senses)
    const normal = stanceOptions({ first: "party", foes, pace: "normal" })
    expect(keys(normal)).toEqual(["slip_past", "ambush"])
    expect(normal[0].available).toBe(false)
    expect(normal[0].blocked).toContain("slow pace")
    const slow = stanceOptions({ first: "party", foes, pace: "slow" })
    expect(slow[0].available).toBe(true)
    expect(slow[0].check).toContain("passive Perception 10")
    const unlinked = stanceOptions({ first: "party", foes: foesOf(raiders, {}), pace: "slow" })
    expect(keys(unlinked)).toEqual(["talk", "slip_past", "ambush"])
    expect(unlinked[1].available).toBe(false)
    expect(unlinked[1].blocked).toContain("stat block")
  })
  it("they saw the party first: fight, and talk only with those who talk", () => {
    expect(keys(stanceOptions({ first: "them", foes: foesOf(orogs, senses), pace: "slow" }))).toEqual(["fight"])
    expect(keys(stanceOptions({ first: "them", foes: foesOf(raiders, {}), pace: "normal" }))).toEqual(["talk", "fight"])
    expect(stanceOptions({ first: "party", foes: [], pace: "slow" })).toEqual([])
  })
  it("ambush surprises them; standing to fight after they saw you surprises the party", () => {
    const foes = foesOf(orogs, senses)
    const a = resolveStance("ambush", { meeting: { first: "party", surprised: null }, foes, pace: "normal", party: [] }, fixed(10))!
    expect(a).toMatchObject({ outcome: "fight", surprised: "them" })
    const f = resolveStance("fight", { meeting: { first: "them", surprised: "party" }, foes, pace: "normal", party: [] }, fixed(10))!
    expect(f).toMatchObject({ outcome: "fight", surprised: "party" })
    expect(f.text).toContain("Disadvantage on Initiative")
  })
  it("slip past is a group check: half or more must beat their passive Perception", () => {
    const foes = foesOf(orogs, senses) // passive 10
    const party = [hero("Fifi", 16), hero("Kenta", 8)] // +3 and -1
    const m = { first: "party" as const, surprised: null }
    const pass = resolveStance("slip_past", { meeting: m, foes, pace: "slow", party }, fixed(8))! // 11 and 7: one of two
    expect(pass).toMatchObject({ outcome: "passed", dc: 10, surprised: null })
    expect(pass.checks.map((c) => c.success)).toEqual([true, false])
    const fail = resolveStance("slip_past", { meeting: m, foes, pace: "slow", party }, fixed(5))! // 8 and 4
    expect(fail).toMatchObject({ outcome: "spotted", surprised: null })
  })
  it("refuses a choice that is not open: wrong pace, wrong side, or unknown key", () => {
    const foes = foesOf(orogs, senses)
    const m = { first: "party" as const, surprised: null }
    expect(resolveStance("slip_past", { meeting: m, foes, pace: "normal", party: [hero("Fifi", 16)] }, fixed(20))).toBeNull()
    expect(resolveStance("fight", { meeting: m, foes, pace: "slow", party: [] }, fixed(10))).toBeNull()
    expect(resolveStance("talk", { meeting: m, foes, pace: "slow", party: [] }, fixed(10))).toBeNull()
    expect(resolveStance("run", { meeting: m, foes, pace: "slow", party: [] }, fixed(10))).toBeNull()
  })
  it("once spotted while sneaking, what is left is to talk or fight, and nobody is surprised", () => {
    const foes = foesOf(raiders, {})
    expect(keys(stanceOptions({ first: "party", foes, pace: "slow", spotted: true }))).toEqual(["talk", "fight"])
    const f = resolveStance("fight", { meeting: { first: "party", surprised: null }, foes, pace: "slow", party: [], spotted: true }, fixed(10))!
    expect(f).toMatchObject({ outcome: "fight", surprised: null })
    expect(resolveStance("talk", { meeting: { first: "them", surprised: "party" }, foes, pace: "normal", party: [] }, fixed(10))).toMatchObject({ outcome: "parley" })
  })
})
