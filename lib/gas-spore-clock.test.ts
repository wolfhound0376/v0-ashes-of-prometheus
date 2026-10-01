import { describe, expect, it } from "vitest"
import {
  absMinutes, advanceGasSporeInfections, countdownLines, formatInfectionBlock, formatSpan, loadInfectionBlock,
  maturedLine, rollSpec, sproutFrom, sproutLine, sproutsMature, stepLines, stepsDue, type InfectionState,
} from "./gas-spore-clock"
import { infectionFor, parseDeathBurst } from "./death-burst"

const BURST = parseDeathBurst(
  "Each creature within 20 feet of it must succeed on a DC 15 Constitution saving throw or take 10 (3d6) poison damage and become infected with a disease on a failed save. Creatures immune to the poisoned condition are immune to this disease. Spores invade an infected creature's system, killing the creature in a number of hours equal to 1d12 + the creature's Constitution score, unless the disease is removed. In half that time, the creature becomes poisoned for the rest of the duration.",
)!

// Kenta, infected at Day 3 22:00: 1d12 7 + CON 14 = 21 hours.
// Poisoned at Day 4 08:30, dead at Day 4 19:00.
const KENTA: InfectionState = infectionFor({
  burst: BURST, creature: "Kenta", characterId: "c1", conScore: 14, d12: 7,
  now: { day: 3, minutesOfDay: 22 * 60 },
})!
const at = (day: number, h: number, m = 0) => ({ day, minutesOfDay: h * 60 + m })

describe("stepsDue", () => {
  it("owes nothing before halfway", () => {
    expect(stepsDue(KENTA, at(4, 8, 29), true)).toEqual({ cure: false, poison: false, die: false })
  })
  it("poisons at exactly halfway", () => {
    expect(stepsDue(KENTA, at(4, 8, 30), true)).toEqual({ cure: false, poison: true, die: false })
  })
  it("does not poison twice", () => {
    expect(stepsDue({ ...KENTA, poisoned_applied: true }, at(4, 12), true).poison).toBe(false)
  })
  it("kills at exactly the deadline", () => {
    expect(stepsDue({ ...KENTA, poisoned_applied: true }, at(4, 19), true)).toEqual({ cure: false, poison: false, die: true })
    expect(stepsDue({ ...KENTA, poisoned_applied: true }, at(4, 18, 59), true).die).toBe(false)
  })
  it("applies both when one jump (a long rest) passes both moments", () => {
    expect(stepsDue(KENTA, at(5, 6), true)).toEqual({ cure: false, poison: true, die: true })
  })
  it("stops the clock when the disease has been removed from the sheet", () => {
    expect(stepsDue(KENTA, at(5, 6), false)).toEqual({ cure: true, poison: false, die: false })
  })
  it("never touches a finished record", () => {
    expect(stepsDue({ ...KENTA, died: true }, at(9, 0), true)).toEqual({ cure: false, poison: false, die: false })
    expect(stepsDue({ ...KENTA, cured: true }, at(9, 0), true)).toEqual({ cure: false, poison: false, die: false })
  })
  it("leaves an undated infection to Malachar rather than dating it now", () => {
    const undated = infectionFor({ burst: BURST, creature: "Ront", characterId: null, conScore: 16, d12: 3, now: null })!
    expect(stepsDue(undated, at(9, 0), true)).toEqual({ cure: false, poison: false, die: false })
  })
})

describe("stepLines", () => {
  it("says what happened, in order", () => {
    expect(stepLines("Kenta", { cure: false, poison: true, die: true })).toEqual([
      "Halfway: the spores in Kenta take hold, and Kenta is poisoned until the disease is removed.",
      "Kenta dies of the Gas Spore Infection.",
    ])
    expect(stepLines("Kenta", { cure: true, poison: false, die: false })).toEqual([
      "Kenta's Gas Spore Infection is gone; the spores' clock stops.",
    ])
  })
  it("compares moments across midnight", () => {
    expect(absMinutes(at(5, 0)) - absMinutes(at(4, 23, 30))).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// The writer, against a tiny in-memory stand-in for the Supabase client: just
// enough of from/select/eq/like/is/limit/maybeSingle/update/insert to watch
// what advanceGasSporeInfections writes.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>
function fakeDb(tables: Record<string, Row[]>) {
  return {
    tables,
    from(name: string) {
      const rows = (tables[name] ??= [])
      const filters: ((r: Row) => boolean)[] = []
      let patch: Row | null = null
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q },
        is: (k: string, v: unknown) => { filters.push((r) => (r[k] ?? null) === v); return q },
        like: (k: string, p: string) => { filters.push((r) => String(r[k]).startsWith(p.replace(/%$/, ""))); return q },
        limit: () => q,
        update: (p: Row) => { patch = p; return q },
        insert: (r: Row) => { rows.push(r); return Promise.resolve({ error: null }) },
        maybeSingle: () => Promise.resolve({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null }),
        then: (ok: (v: { data: Row[]; error: null }) => unknown) => {
          const hit = rows.filter((r) => filters.every((f) => f(r)))
          if (patch) hit.forEach((r) => Object.assign(r, patch))
          return Promise.resolve({ data: hit, error: null }).then(ok)
        },
      }
      return q
    },
  }
}

const flagRow = (rec: InfectionState) => ({ campaign_id: "ashes-of-prometheus", key: "gas-spore-infection:c1", value: rec, note: null })

describe("advanceGasSporeInfections", () => {
  it("poisons at halfway, then kills at the deadline, once each", async () => {
    const db = fakeDb({
      world_flags: [flagRow(KENTA)],
      characters: [{ id: "c1", conditions: ["Gas Spore Infection"], hp_current: 9 }],
      vtt_tokens: [{ id: "t1", character_id: "c1", hp_current: 9 }],
      dialogue: [],
    })
    await advanceGasSporeInfections(db, at(4, 9))
    expect(db.tables.characters[0].conditions).toEqual(["Gas Spore Infection", "Poisoned"])
    expect(db.tables.characters[0].hp_current).toBe(9)
    expect((db.tables.world_flags[0].value as InfectionState).poisoned_applied).toBe(true)

    await advanceGasSporeInfections(db, at(4, 10)) // nothing new owed
    expect(db.tables.dialogue).toHaveLength(1)

    await advanceGasSporeInfections(db, at(4, 19))
    expect(db.tables.characters[0].conditions).toEqual(["Gas Spore Infection", "Poisoned", "Dead"])
    expect(db.tables.characters[0].hp_current).toBe(0)
    expect(db.tables.vtt_tokens[0].hp_current).toBe(0)
    expect((db.tables.world_flags[0].value as InfectionState).died).toBe(true)
    expect(db.tables.dialogue.map((d) => d.text)).toEqual([
      "Halfway: the spores in Kenta take hold, and Kenta is poisoned until the disease is removed.",
      "Kenta dies of the Gas Spore Infection.",
    ])
    expect(db.tables.dialogue.every((d) => d.speaker === "System" && d.channel === "dm")).toBe(true)

    await advanceGasSporeInfections(db, at(6, 0)) // dead stays dead, quietly
    expect(db.tables.dialogue).toHaveLength(2)
  })

  it("stops the clock, and touches nothing else, when the disease was removed", async () => {
    const db = fakeDb({
      world_flags: [flagRow(KENTA)],
      characters: [{ id: "c1", conditions: ["Prone"], hp_current: 9 }],
      dialogue: [],
    })
    await advanceGasSporeInfections(db, at(5, 0))
    expect(db.tables.characters[0]).toEqual({ id: "c1", conditions: ["Prone"], hp_current: 9 })
    expect((db.tables.world_flags[0].value as InfectionState).cured).toBe(true)
    expect(db.tables.dialogue[0].text).toBe("Kenta's Gas Spore Infection is gone; the spores' clock stops.")
  })

  it("kills an NPC by its encounter row and its token, never a player's token of the same name", async () => {
    const ront = { ...KENTA, creature: "Ront", character_id: null }
    const db = fakeDb({
      world_flags: [{ ...flagRow(ront), key: "gas-spore-infection:npc:ront" }],
      npc_encounters: [{ name: "Ront", conditions: ["Gas Spore Infection"], hp_current: 30 }],
      vtt_tokens: [
        { id: "t1", label: "Ront", character_id: null, hp_current: 30 },
        { id: "t2", label: "Ront", character_id: "pc", hp_current: 12 },
      ],
      dialogue: [],
    })
    await advanceGasSporeInfections(db, at(5, 0))
    expect(db.tables.npc_encounters[0]).toMatchObject({ hp_current: 0, conditions: ["Gas Spore Infection", "Poisoned", "Dead"] })
    expect(db.tables.vtt_tokens.map((t) => t.hp_current)).toEqual([0, 12])
  })
})

describe("the countdown for Malachar", () => {
  it("counts down to halfway and to the deadline", () => {
    expect(countdownLines([KENTA], at(4, 6))).toEqual([
      "- Kenta: Gas Spore Infection — dies in 13h unless the disease is removed; poisoned in 2h 30m.",
    ])
  })
  it("says when the poison has already taken hold", () => {
    expect(countdownLines([{ ...KENTA, poisoned_applied: true }], at(4, 18, 15))).toEqual([
      "- Kenta: Gas Spore Infection — dies in 45m unless the disease is removed; already poisoned.",
    ])
  })
  it("leaves out the dead and the cured", () => {
    expect(countdownLines([{ ...KENTA, died: true }, { ...KENTA, cured: true }], at(4, 6))).toEqual([])
    expect(formatInfectionBlock([{ ...KENTA, died: true }], at(4, 6))).toBe("")
  })
  it("keeps an undated infection's hours without inventing a start", () => {
    const undated = infectionFor({ burst: BURST, creature: "Ront", characterId: null, conScore: 16, d12: 3, now: null })!
    expect(countdownLines([undated], at(4, 6))[0]).toContain("19 hours from infection (1d12 3 + CON 16); start time unknown")
  })
  it("tells Malachar not to double what the system applies, and how a cure is written", () => {
    const block = formatInfectionBlock([KENTA], at(4, 6))
    expect(block).toContain("DM's eyes only")
    expect(block).toContain("do NOT emit [CONDITION_ADD]")
    expect(block).toContain("[CONDITION_REMOVE: <name> | Gas Spore Infection]")
  })
  it("reads the flags and builds nothing when nobody is infected", async () => {
    expect(await loadInfectionBlock(fakeDb({ world_flags: [] }), at(4, 6))).toBe("")
    expect(await loadInfectionBlock(fakeDb({ world_flags: [flagRow(KENTA)] }), at(4, 6))).toContain("dies in 13h")
  })
  it("formats spans", () => {
    expect([formatSpan(0), formatSpan(45), formatSpan(120), formatSpan(390)]).toEqual(["0m", "45m", "2h", "6h 30m"])
  })
})

// ---------------------------------------------------------------------------
// The body sprouts: "After the creature dies, it sprouts 2d4 Tiny gas spores
// that grow to full size in 7 days."
// ---------------------------------------------------------------------------
const SPROUTING: InfectionState = { ...KENTA, sprouts: { dice: "2d4", days: 7 } }
/** A die that always lands on its top face minus nothing: rng 0.99 → max. */
const high = () => 0.99
const low = () => 0

describe("sprouting", () => {
  it("rolls the dice the trait names", () => {
    expect(rollSpec("2d4", high)).toBe(8)
    expect(rollSpec("2d4", low)).toBe(2)
    expect(rollSpec("nonsense", high)).toBe(0)
  })
  it("dates full size 7 days after the death", () => {
    expect(sproutFrom(SPROUTING, at(4, 19), high)).toEqual({ count: 8, dice: "2d4", matures_at: at(11, 19) })
    expect(sproutFrom(KENTA, at(4, 19), high)).toBeNull() // a record with no sprouts sprouts nothing
  })
  it("is grown exactly at the mark, never before, never for undated ones", () => {
    const s = sproutFrom(SPROUTING, at(4, 19), high)!
    expect(sproutsMature(s, at(11, 18, 59))).toBe(false)
    expect(sproutsMature(s, at(11, 19))).toBe(true)
    expect(sproutsMature({ ...s, matured: true }, at(20, 0))).toBe(false)
    expect(sproutsMature({ ...s, matures_at: null }, at(20, 0))).toBe(false)
  })
  it("says it plainly", () => {
    const s = sproutFrom(SPROUTING, at(4, 19), high)!
    expect(sproutLine("Kenta", s, 7)).toBe("8 Tiny gas spores (2d4 8) sprout from Kenta's body; they will be full-grown gas spores by Day 11, 19:00.")
    expect(maturedLine("Kenta", s)).toBe("The 8 gas spores that sprouted from Kenta's body are full-grown.")
  })

  it("sprouts when the disease kills, then grows them up a week later, once", async () => {
    const db = fakeDb({
      world_flags: [flagRow(SPROUTING)],
      characters: [{ id: "c1", conditions: ["Gas Spore Infection", "Poisoned"], hp_current: 9 }],
      vtt_tokens: [{ id: "t1", character_id: "c1", hp_current: 9 }],
      dialogue: [],
    })
    await advanceGasSporeInfections(db, at(4, 20), high)
    const rec = () => db.tables.world_flags[0].value as InfectionState
    expect(rec().died).toBe(true)
    expect(rec().sprouted).toEqual({ count: 8, dice: "2d4", matures_at: at(11, 19) })
    expect(db.tables.dialogue.map((d) => d.text).slice(-1)[0]).toBe(
      "8 Tiny gas spores (2d4 8) sprout from Kenta's body; they will be full-grown gas spores by Day 11, 19:00.",
    )
    // The countdown carries them while they grow.
    expect(countdownLines([rec()], at(8, 19))).toEqual([
      "- 8 Tiny gas spores growing from Kenta's body — full-grown gas spores in 3d.",
    ])

    await advanceGasSporeInfections(db, at(9, 0), high) // still growing: nothing said
    const said = db.tables.dialogue.length
    await advanceGasSporeInfections(db, at(11, 19), high)
    expect(rec().sprouted?.matured).toBe(true)
    expect(db.tables.dialogue.slice(said).map((d) => d.text)).toEqual(["The 8 gas spores that sprouted from Kenta's body are full-grown."])
    await advanceGasSporeInfections(db, at(20, 0), high) // grown is grown: quiet
    expect(db.tables.dialogue).toHaveLength(said + 1)
    expect(countdownLines([rec()], at(20, 0))).toEqual([])
  })

  it("sprouts from a body killed by something else, from the moment the clock sees it", async () => {
    const db = fakeDb({
      world_flags: [flagRow(SPROUTING)],
      characters: [{ id: "c1", conditions: ["Gas Spore Infection", "Dead"], hp_current: 0 }],
      dialogue: [],
    })
    await advanceGasSporeInfections(db, at(4, 2), low)
    const rec = db.tables.world_flags[0].value as InfectionState
    expect(rec.died).toBe(true)
    expect(rec.sprouted).toEqual({ count: 2, dice: "2d4", matures_at: at(11, 2) })
    expect(db.tables.dialogue.map((d) => d.text)).toEqual([
      "Kenta died with the spores still in them.",
      "2 Tiny gas spores (2d4 2) sprout from Kenta's body; they will be full-grown gas spores by Day 11, 02:00.",
    ])
  })

  it("does not sprout a body that was cured first", async () => {
    const db = fakeDb({
      world_flags: [flagRow(SPROUTING)],
      characters: [{ id: "c1", conditions: ["Dead"], hp_current: 0 }],
      dialogue: [],
    })
    await advanceGasSporeInfections(db, at(4, 2), high)
    const rec = db.tables.world_flags[0].value as InfectionState
    expect(rec.cured).toBe(true)
    expect(rec.sprouted).toBeUndefined()
  })

  it("grows them at once when one jump passes the whole week", async () => {
    const db = fakeDb({
      world_flags: [flagRow(SPROUTING)],
      characters: [{ id: "c1", conditions: ["Gas Spore Infection"], hp_current: 9 }],
      dialogue: [],
    })
    await advanceGasSporeInfections(db, at(15, 0), low)
    expect((db.tables.world_flags[0].value as InfectionState).sprouted?.matured).toBe(true)
    expect(db.tables.dialogue.map((d) => d.text).slice(-1)[0]).toBe("The 2 gas spores that sprouted from Kenta's body are full-grown.")
  })

  it("formats spans of days", () => {
    expect([formatSpan(1440), formatSpan(1440 * 3 + 120)]).toEqual(["1d", "3d 2h"])
  })
})
