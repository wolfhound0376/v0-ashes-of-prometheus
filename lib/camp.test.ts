import { describe, expect, it } from "vitest"
import type { Rng, SheetSlice } from "./game-context"
import {
  CAMP_ACTIONS,
  CAMP_ACTIONS_FULL,
  CAMP_ACTIONS_PARTIAL,
  CAMP_ACTION_RULES,
  CAMP_VISITOR_ROWS,
  CAMP_VISITOR_TABLES,
  DEFAULT_ENCOUNTER_TABLE,
  PALLIATION,
  affordableRest,
  attune,
  bardUpgrade,
  campRest,
  campPurpose,
  craftProgress,
  decideCampAction,
  normaliseCampAction,
  parseCampActions,
  parseCampPurpose,
  settleForage,
  settlePerform,
  CAMP_ACTION_STRIP_RE,
  formatCampBlock,
  isCamping,
  storedVisitor,
  decipher,
  dmScene,
  forage,
  fullRestRations,
  hunt,
  identifyItem,
  levelForXp,
  levelUp,
  levelUpAllowedHere,
  makeCampBudget,
  partialRestRations,
  passiveCampEncounter,
  perform,
  resolveWatch,
  shortRest,
  spendCampAction,
  trade,
  weightRelationshipEvent,
  xpToNext,
  type EncounterTableRow,
  type LevelUpSheet,
  type ShortRester,
} from "./camp"
import { parseTimeEvents } from "./time-tracking"

// ---------------------------------------------------------------------------
// Seeded dice. Same seed, same stream, every run — the module never touches
// Math.random, so a test can name the face it wants.
// ---------------------------------------------------------------------------

/** A float that makes `1 + floor(rng() * sides)` come up `face`. */
const d = (face: number, sides: number) => (face - 1) / sides + 0.001

/** Plays back exact floats in order and refuses to be over-drawn. */
function script(...values: number[]): Rng {
  let i = 0
  return () => {
    if (i >= values.length) throw new Error("scripted rng exhausted")
    return values[i++]
  }
}

const sheet = (over: Partial<SheetSlice> & { name: string }): SheetSlice => ({
  id: over.name.toLowerCase(),
  level: 1,
  str_score: 10,
  dex_score: 10,
  con_score: 10,
  int_score: 10,
  wis_score: 10,
  cha_score: 10,
  ...over,
})

// A slice of `encounter_table_rows` as loaded 2026-08-21 (OotA-Enc ch.2).
const rows: EncounterTableRow[] = [
  { table_key: "underdark_random", roll_min: 1, roll_max: 13, result: "No encounter", detail: { rolls: [] } },
  { table_key: "underdark_random", roll_min: 14, roll_max: 15, result: "Terrain", detail: { rolls: ["underdark_terrain"] } },
  { table_key: "underdark_random", roll_min: 16, roll_max: 17, result: "One or more creatures", detail: { rolls: ["underdark_creature"] } },
  { table_key: "underdark_random", roll_min: 18, roll_max: 20, result: "Terrain featuring one or more creatures", detail: { rolls: ["underdark_terrain", "underdark_creature"] } },
  { table_key: "underdark_terrain", roll_min: 14, roll_max: 14, result: "Shelter", detail: {} },
  { table_key: "underdark_creature", roll_min: 1, roll_max: 2, result: "Ambushers", detail: { note: "reroll this result if the characters are resting", rolls: ["underdark_ambush"] } },
  { table_key: "underdark_creature", roll_min: 3, roll_max: 3, result: "Carrion crawler", detail: { bestiary: "Carrion Crawler" } },
  { table_key: "underdark_creature", roll_min: 17, roll_max: 17, result: "Society of Brilliance", detail: {} },
  { table_key: "underdark_creature", roll_min: 19, roll_max: 20, result: "Traders", detail: {} },
  { table_key: "underdark_ambush", roll_min: 1, roll_max: 2, result: "1 chuul lurking in a pool of water", detail: { count: 1, bestiary: "Chuul" } },
]

// ---------------------------------------------------------------------------
// §2 the budget
// ---------------------------------------------------------------------------

describe("rations decide the rest", () => {
  it("a full rest costs 20, 30 for six to eight, 40 past eight; a partial rest is half", () => {
    expect([1, 4, 5].map(fullRestRations)).toEqual([20, 20, 20])
    expect([6, 7, 8].map(fullRestRations)).toEqual([30, 30, 30])
    expect(fullRestRations(9)).toBe(40)
    expect(partialRestRations(4)).toBe(10)
    expect(partialRestRations(7)).toBe(15)
  })

  it("buys the best rest the rations allow, and none when they cannot buy a partial one", () => {
    expect(affordableRest(25, 4)).toMatchObject({ kind: "full", cost: 20, suppliesAfter: 5 })
    expect(affordableRest(19, 4)).toMatchObject({ kind: "partial", cost: 10, suppliesAfter: 9 })
    expect(affordableRest(0, 4)).toMatchObject({ kind: null, cost: 0, suppliesAfter: 0 })
    expect(affordableRest(19, 4).flags).toEqual([])
    expect(affordableRest(30, 7)).toMatchObject({ kind: "full", cost: 30, flags: [] })
    expect(affordableRest(16, 7)).toMatchObject({ kind: "partial", cost: 15 })
  })
})

describe("camp action budget", () => {
  it("a full rest grants two actions, a partial one, no rest none", () => {
    expect(makeCampBudget("full")).toBe(CAMP_ACTIONS_FULL)
    expect(makeCampBudget("partial")).toBe(CAMP_ACTIONS_PARTIAL)
    expect(makeCampBudget(null)).toBe(0)
    const first = spendCampAction(makeCampBudget("full"), "forage")
    expect(first).toMatchObject({ ok: true, remaining: 1 })
    expect(spendCampAction(first.remaining, "level_up")).toMatchObject({ ok: true, remaining: 0 })
  })

  it("an action past the budget is refused and the budget is untouched", () => {
    const third = spendCampAction(0, "pray")
    expect(third.ok).toBe(false)
    expect(third.remaining).toBe(0)
    expect(third.note).toMatch(/No camp action left/)
  })

  it("the bard's success lifts a partial rest to the full budget, once, and never a full rest", () => {
    expect(bardUpgrade(0, "partial", true)).toBe(1)
    expect(bardUpgrade(1, "partial", true)).toBe(2)
    expect(bardUpgrade(1, "partial", false)).toBe(1)
    expect(bardUpgrade(1, "partial", true, true)).toBe(1)
    expect(bardUpgrade(2, "full", true)).toBe(2)
  })

  it("sleep is never an action, watch and tend are no longer actions, and every action names its rule", () => {
    expect(spendCampAction(2, "sleep").ok).toBe(false)
    expect(spendCampAction(2, "watch").ok).toBe(false)
    expect(spendCampAction(2, "tend").ok).toBe(false)
    expect(spendCampAction(2, "sleep").remaining).toBe(2)
    for (const a of CAMP_ACTIONS) expect(CAMP_ACTION_RULES[a].source).toBeTruthy()
    expect(CAMP_ACTIONS).toHaveLength(14)
  })
})

describe("the passive roll", () => {
  it("a safe node gets no visitor; on a d40, 1–34 no one, 35–36 brigands, 39 a merchant who opens trade", () => {
    expect(passiveCampEncounter({ metadata: { safe: true } }, script())).toMatchObject({ visitor: null, hostile: false, merchantPresent: false, flags: [] })
    const quiet = passiveCampEncounter({ metadata: {} }, script(d(34, 40)))
    expect(quiet).toMatchObject({ visitor: null, hostile: false, merchantPresent: false, flags: [] })
    expect(quiet.watch.chain[0]).toMatchObject({ tableKey: "camp_visitors", die: 40, roll: 34 })
    const brigands = passiveCampEncounter({ metadata: {} }, script(d(35, 40)))
    expect(brigands).toMatchObject({ visitor: "brigands", hostile: true, who: null, disposition: null })
    expect(brigands.flags.some((f) => /DM picks the stat block/.test(f))).toBe(true)
    expect(passiveCampEncounter({ metadata: {} }, script(d(38, 40))).visitor).toBe("villains")
    const merchant = passiveCampEncounter({ metadata: {} }, script(d(39, 40)))
    expect(merchant).toMatchObject({ visitor: "merchant", merchantPresent: true, hostile: false })
    expect(trade({ name: "Kenta" }, merchant).ok).toBe(true)
    expect(trade({ name: "Kenta" }, brigands).ok).toBe(false)
  })

  it("a wandering person is one of Sam's seven, with a disposition, and a divine one leans good or evil", () => {
    // 40 → person; d7 7 → hag or witch; d20 20 → divine; d2 1 → good.
    const divine = passiveCampEncounter({ metadata: {} }, script(d(40, 40), d(7, 7), d(20, 20), d(1, 2)))
    expect(divine).toMatchObject({ visitor: "person", who: "hag or witch", disposition: "divine", alignment: "good", hostile: false })
    expect(divine.watch.chain.map((c) => [c.tableKey, c.die])).toEqual([["camp_visitors", 40], ["camp_visitor_kind", 7], ["camp_visitor_person", 20], ["camp_visitor_divine", 2]])
    expect(divine.note).toMatch(/hag or witch, who is something divine in disguise, \(good\)/)
    const malicious = passiveCampEncounter({ metadata: {} }, script(d(40, 40), d(3, 7), d(5, 20)))
    expect(malicious).toMatchObject({ who: "human", disposition: "malicious", alignment: null })
    const neutral = passiveCampEncounter({ metadata: {} }, script(d(40, 40), d(4, 7), d(19, 20)))
    expect(neutral).toMatchObject({ who: "kuo-toa", disposition: "neutral", alignment: null })
    expect(neutral.flags).toEqual(["The seven kinds of wandering person are equal odds — Sam gave no weights."])
    // Every table covers every face of its die exactly once, so the rows can move to the database as they are.
    for (const t of CAMP_VISITOR_TABLES) {
      for (let face = 1; face <= (t.die as number); face++) {
        expect(CAMP_VISITOR_ROWS.filter((r) => r.table_key === t.table_key && face >= r.roll_min && face <= r.roll_max), `${t.table_key} face ${face}`).toHaveLength(1)
      }
    }
  })
})

describe("attune, identify, decipher, hunt, scenes", () => {
  const ring = { name: "Ring of Protection", attunement: true, cursed: true, description: "A plain band.", properties: { ac: 1, craft: { tools: "Jeweler's Tools" } } }

  it("attunement is one item per rest, three at a time, and a curse stays silent", () => {
    expect(attune({ name: "Fifi", attunedCount: 0, attunedThisRest: false }, ring)).toMatchObject({ ok: true, attunedCount: 1, curseRevealed: false })
    expect(attune({ name: "Fifi", attunedCount: 1, attunedThisRest: true }, ring).note).toMatch(/one per rest/)
    expect(attune({ name: "Fifi", attunedCount: 3, attunedThisRest: false }, ring).note).toMatch(/limit/)
    expect(attune({ name: "Fifi", attunedCount: 0, attunedThisRest: false }, { name: "Rope", attunement: false }).ok).toBe(false)
  })

  it("identifying reveals the properties and never the curse; a potion needs only a taste", () => {
    const out = identifyItem(ring)
    expect(out.revealed).toEqual({ name: "Ring of Protection", description: "A plain band.", attunement: true, properties: { ac: 1 } })
    expect("cursed" in out.revealed).toBe(false)
    expect(out.curseRevealed).toBe(false)
    expect(identifyItem({ name: "Potion of Healing", attunement: false, item_type: "potion" }).note).toMatch(/taste/)
  })

  it("decipher is INT (Arcana) vs the DM's DC, hunting is foraging by another name, and the rest is the DM's scene", () => {
    const kenta = sheet({ name: "Kenta", int_score: 14, proficiency_bonus: 2, sheet_skill_proficiencies: { Arcana: "proficient" } })
    expect(decipher(kenta, 15, script(d(11, 20))).check).toMatchObject({ skill: "arcana", total: 15, success: true })
    const h = hunt(kenta, script(d(20, 20), d(3, 6)))
    expect(h.supplies).toBe(3)
    expect(h.flags[0]).toMatch(/foraging rule/)
    expect(h.note).toMatch(/hunts/)
    const pray = dmScene("pray", kenta)
    expect(pray.source).toBe("Sam, 2026-09-26")
    expect(pray.flags[0]).toMatch(/no mechanical rule/)
  })
})

// ---------------------------------------------------------------------------
// §3 the watch
// ---------------------------------------------------------------------------

describe("the watch", () => {
  it("a safe node rolls nothing", () => {
    const out = resolveWatch({ name: "Sloobludop", metadata: { safe: true } }, rows, script())
    expect(out.rolled).toBe(false)
    expect(out.chain).toEqual([])
    expect(out.handoff).toBeNull()
  })

  it("rolls the default OotA table and 1–13 is no encounter", () => {
    const out = resolveWatch({ name: "a side passage", metadata: {} }, rows, script(d(7, 20)))
    expect(out.tableKey).toBe(DEFAULT_ENCOUNTER_TABLE)
    expect(out.chain.map((c) => [c.tableKey, c.roll])).toEqual([["underdark_random", 7]])
    expect(out.results).toEqual(["No encounter"])
    expect(out.creatures).toEqual([])
    expect(out.handoff).toBeNull()
  })

  it("follows the chain into the creature table, and the positive tail is not a fight", () => {
    // 16 → creatures; 17 on the creature table → Society of Brilliance.
    const out = resolveWatch({ metadata: {} }, rows, script(d(16, 20), d(17, 20)))
    expect(out.chain.map((c) => c.tableKey)).toEqual(["underdark_random", "underdark_creature"])
    expect(out.results).toEqual(["Society of Brilliance"])
    expect(out.creatures).toEqual([])
    expect(out.handoff).toBeNull()
  })

  it("a bestiary result hands off to the existing surprise path", () => {
    // 18 → terrain + creature; terrain 14 → Shelter; creature 3 → Carrion crawler.
    const out = resolveWatch({ metadata: {} }, rows, script(d(18, 20), d(14, 20), d(3, 20)))
    expect(out.results).toEqual(["Shelter", "Carrion crawler"])
    expect(out.creatures).toEqual(["Carrion Crawler"])
    expect(out.handoff).toBe("surprise")
    expect(out.flags).toEqual([])
  })

  it("a table with no rows loaded is a flag for the DM, never an invented result", () => {
    const out = resolveWatch({ metadata: { encounter_table: "surface_forest" } }, rows, script())
    expect(out.rolled).toBe(true)
    expect(out.results).toEqual([])
    expect(out.flags[0]).toMatch(/NO ROW/)
    expect(out.handoff).toBeNull()
  })

  it("resting rerolls the Ambushers row once, as the book says", () => {
    // 16 → creatures; creature 1 → Ambushers (reroll while resting); creature 19 → Traders.
    const out = resolveWatch({ metadata: {} }, rows, script(d(16, 20), d(1, 20), d(19, 20)), { resting: true })
    const creature = out.chain[1]
    expect(creature.rerolledFrom).toBe("Ambushers")
    expect(creature.roll).toBe(19)
    expect(out.results).toEqual(["Traders"])
    // Not resting: the Ambushers row stands and the ambush table is rolled.
    const awake = resolveWatch({ metadata: {} }, rows, script(d(16, 20), d(1, 20), d(2, 20)), { resting: false })
    expect(awake.creatures).toEqual(["Chuul"])
  })
})

// ---------------------------------------------------------------------------
// §2 forage
// ---------------------------------------------------------------------------

describe("forage", () => {
  const bastet = sheet({ name: "Bastet", level: 5, wis_score: 10, proficiency_bonus: 3, sheet_skill_proficiencies: { Survival: "proficient" } })

  it("a success yields 1d6 + WIS person-days; a miss yields none, and the yield is flagged as DMG", () => {
    // d20 12 + prof 3 = 15 vs DC 15 → success; d6 face 4; WIS +0.
    const hit = forage(bastet, script(d(12, 20), d(4, 6)))
    expect(hit.check.success).toBe(true)
    expect(hit.yieldDie).toBe(4)
    expect(hit.supplies).toBe(4)
    expect(hit.flags.some((f) => /DMG p\.111/.test(f))).toBe(true)
    const miss = forage(bastet, script(d(11, 20)))
    expect(miss.check.total).toBe(14)
    expect(miss.supplies).toBe(0)
    expect(miss.yieldDie).toBeNull()
  })

  it("slow pace is read as advantage and says so", () => {
    const out = forage(bastet, script(d(3, 20), d(15, 20), d(6, 6)), { slowPace: true })
    expect(out.check.mode).toBe("advantage")
    expect(out.check.roll).toBe(15)
    expect(out.supplies).toBe(6)
    expect(out.flags.some((f) => /needs Sam's yes/.test(f))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// §2 tend — the short rest
// ---------------------------------------------------------------------------

const rester = (over: Partial<ShortRester> & { name: string }): ShortRester => ({
  id: over.name.toLowerCase(),
  level: 1,
  class: "Fighter",
  sheet_hit_dice: "1d10",
  hp: 5,
  hpMax: 12,
  hitDiceRemaining: 1,
  con_score: 10,
  spend: 0,
  vitality: "up",
  ...over,
})

describe("short rest", () => {
  it("each Hit Die heals the face plus CON, never past the maximum, never more dice than are owned", () => {
    const bastet = rester({ name: "Bastet", level: 5, class: "Barbarian", sheet_hit_dice: "5d12", hp: 20, hpMax: 50, hitDiceRemaining: 3, con_score: 15, spend: 2 })
    const out = shortRest([bastet], script(d(5, 12), d(12, 12))).characters[0]
    expect(out.dice).toEqual([{ face: 5, healed: 7 }, { face: 12, healed: 14 }])
    expect(out.hp).toBe(41)
    expect(out.hitDiceRemaining).toBe(1)

    const nearFull = shortRest([{ ...bastet, hp: 45, spend: 1 }], script(d(12, 12))).characters[0]
    expect(nearFull.hp).toBe(50)
    expect(nearFull.dice[0].healed).toBe(5)

    const greedy = shortRest([{ ...bastet, hitDiceRemaining: 1, spend: 3 }], script(d(6, 12))).characters[0]
    expect(greedy.dice).toHaveLength(1)
    expect(greedy.hitDiceRemaining).toBe(0)
    expect(greedy.flags[0]).toMatch(/has 1; spending 1/)
  })

  it("Song of Rest adds the bard's die to everyone who spent a Hit Die, and the rest event records the bard", () => {
    const scott = rester({ name: "Scott", class: "Bard", sheet_hit_dice: "2d8", level: 2, hp: 3, hpMax: 15, hitDiceRemaining: 2, con_score: 13, spend: 1 })
    const kenta = rester({ name: "Kenta", class: "Sorcerer", sheet_hit_dice: "1d6", hp: 2, hpMax: 8, hitDiceRemaining: 1, con_score: 15, spend: 1 })
    const samson = rester({ name: "Samson", class: "Cleric", sheet_hit_dice: "1d8", hp: 9, hpMax: 9, spend: 0 })
    // Scott d8(4) + song d6(3); Kenta d6(2) + song d6(5); Samson spends nothing so no song die.
    const res = shortRest([scott, kenta, samson], script(d(4, 8), d(3, 6), d(2, 6), d(5, 6)), { bardId: "scott", bardName: "Scott", bardLevel: 2 })
    const [s, k, m] = res.characters
    expect(s.songOfRest).toEqual({ face: 3, healed: 3 })
    expect(s.hp).toBe(3 + 4 + 1 + 3)
    expect(k.songOfRest).toEqual({ face: 5, healed: 2 }) // d6(2)+CON 2 took him to 6; the song is capped at 8
    expect(k.hp).toBe(8)
    expect(m.songOfRest).toBeNull()
    expect(res.restEvent).toEqual({ rest_type: "short", bard_character_id: "scott", bard_spent_die: true })
    expect(res.minutes).toBe(60)

    // A 1st-level bard has no Song of Rest yet.
    const early = shortRest([kenta], script(d(2, 6)), { bardId: "scott", bardName: "Scott", bardLevel: 1 })
    expect(early.characters[0].songOfRest).toBeNull()
    expect(early.restEvent.bard_character_id).toBeNull()
    expect(early.characters[0].flags.some((f) => /starts at 2nd/.test(f))).toBe(true)
  })

  it("Pact Magic slots come back on a short rest; class-list slots do not", () => {
    const warlock = rester({ name: "Freía", class: "Warlock", sheet_hit_dice: "2d8", spellcasting: { pact: true, slots: { "1": { max: 2, used: 2 } } } })
    const sorcerer = rester({ name: "Kenta", class: "Sorcerer", sheet_hit_dice: "1d6", spellcasting: { pact: false, slots: { "1": { max: 2, used: 1 } } } })
    const res = shortRest([warlock, sorcerer], script())
    expect(res.characters[0].slots).toEqual({ "1": { max: 2, used: 0 } })
    expect(res.characters[0].pactSlotsRestored).toBe(2)
    expect(res.characters[1].slots).toBeNull()
    expect(res.characters[1].pactSlotsRestored).toBe(0)
  })

  it("a low die against a negative CON heals nothing rather than wounding", () => {
    const frail = rester({ name: "Frail", class: "Wizard", sheet_hit_dice: "1d6", hp: 4, hpMax: 6, con_score: 4, spend: 1 })
    const out = shortRest([frail], script(d(2, 6))).characters[0]
    expect(out.dice).toEqual([{ face: 2, healed: 0 }])
    expect(out.hp).toBe(4)
    expect(out.hitDiceRemaining).toBe(0)
  })

  it("the dying and the dead do not rest, and stable-at-0 is flagged rather than assumed", () => {
    const dying = shortRest([rester({ name: "Dying", vitality: "dying", hp: 0, spend: 1 })], script()).characters[0]
    expect(dying.rested).toBe(false)
    expect(dying.hitDiceRemaining).toBe(1)
    const dead = shortRest([rester({ name: "Dead", vitality: "dead", hp: 0, spend: 1 })], script()).characters[0]
    expect(dead.rested).toBe(false)
    const stable = shortRest([rester({ name: "Stable", vitality: "stable", hp: 0, spend: 1 })], script(d(6, 10))).characters[0]
    expect(stable.rested).toBe(true)
    expect(stable.hp).toBe(6)
    expect(stable.flags.some((f) => /stable at 0/.test(f))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// §5 talk
// ---------------------------------------------------------------------------

describe("talk", () => {
  it("positive scenes land at 65%, negatives in full, and the row is tagged camp:talk", () => {
    const warm = weightRelationshipEvent({
      subjectId: "a", objectId: "b", kind: "confession", gravity: 80, valence: "positive",
      deltas: { trust: 20, resentment: -10, glee: 99 } as never, note: "shared the last of the water",
    })
    expect(PALLIATION).toBe(0.65)
    expect(warm.gravity).toBe(52)
    expect(warm.deltas).toEqual({ trust: 13, resentment: -7 })
    expect(warm.source).toBe("camp:talk")
    expect(warm.note).toBe("shared the last of the water")

    const cold = weightRelationshipEvent({ subjectId: "a", objectId: "b", kind: "betrayal_recalled", gravity: 80, valence: "negative", deltas: { trust: -20, fear: 15 } })
    expect(cold.gravity).toBe(80)
    expect(cold.deltas).toEqual({ trust: -20, fear: 15 })
    expect(cold).toMatchObject({ subject_id: "a", object_id: "b", kind: "betrayal_recalled" })
  })
})

// ---------------------------------------------------------------------------
// §2 perform
// ---------------------------------------------------------------------------

describe("perform", () => {
  it("reads one Performance check as flat / warm / moving and sets no deltas", () => {
    const scott = sheet({ name: "Scott", cha_score: 15, proficiency_bonus: 2, sheet_skill_proficiencies: { Performance: "proficient" } })
    // CHA +2, prof +2: d20 5 → 9 flat; 6 → 10 warm; 11 → 15 moving.
    expect(perform(scott, script(d(5, 20))).band).toBe("flat")
    expect(perform(scott, script(d(6, 20))).band).toBe("warm")
    const moving = perform(scott, script(d(11, 20)))
    expect(moving.band).toBe("moving")
    expect(moving.deltas).toBeNull()
    expect(perform(scott, script(d(5, 20))).inspires).toBe(false)
    expect(perform(scott, script(d(6, 20))).inspires).toBe(true)
    expect(moving.flags).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// §6 craft
// ---------------------------------------------------------------------------

describe("craft", () => {
  const poison = {
    name: "Drow poison",
    value: 200,
    properties: { craft: { tools: "Alchemist's Supplies", materials: [{ slug: "spider-venom-gland", qty: 2 }], requires: "alchemy_lab" } },
  }
  const fifi = { name: "Fifi", tools: ["Thieves' Tools", "Alchemist's Supplies"] }
  const lab = { facilities: ["alchemy_lab"] }
  const glands = [{ slug: "spider-venom-gland", qty: 2 }]

  it("refuses anything without a recipe, the wrong tools, the wrong place, or missing materials", () => {
    expect(craftProgress({ name: "Zurkhwood", value: 0, properties: { note: "crafting material" } }, fifi, lab, glands, 0, 1)).toMatchObject({ craftable: false, reason: expect.stringMatching(/no craft recipe/) })
    expect(craftProgress(poison, { name: "Samson", tools: ["Calligrapher's Supplies"] }, lab, glands, 0, 1).reason).toMatch(/not proficient with Alchemist's Supplies/)
    expect(craftProgress(poison, fifi, { facilities: [] }, glands, 0, 1).reason).toMatch(/needs a alchemy_lab/)
    expect(craftProgress(poison, fifi, lab, [{ slug: "spider-venom-gland", qty: 1 }], 0, 1).reason).toMatch(/spider-venom-gland 1\/2/)
    expect(craftProgress({ ...poison, value: null }, fifi, lab, glands, 0, 1).reason).toMatch(/no market value/)
  })

  it("banks 5 gp a day against the market value and prices materials at half", () => {
    const day1 = craftProgress(poison, fifi, lab, glands, 0, 3)
    expect(day1).toMatchObject({ craftable: true, totalGp: 200, materialsGp: 100, progressGp: 15, daysWorked: 3, daysRemaining: 37, done: false })
    const last = craftProgress(poison, fifi, lab, glands, 195, 4)
    expect(last).toMatchObject({ progressGp: 200, daysRemaining: 0, done: true })
    expect(last.note).toMatch(/finishes the Drow poison/)
  })
})

// ---------------------------------------------------------------------------
// §4 levelling
// ---------------------------------------------------------------------------

const kenta: LevelUpSheet = {
  id: "kenta", name: "Kenta", class: "Sorcerer", level: 1, xp: 300, hp_max: 8, con_score: 15,
  hit_dice_remaining: 1, sheet_hit_dice: "1d6",
  sheet_spellcasting: { pact: false, ability: "Charisma", slots: { "1": { max: 2, used: 1 } } },
}

describe("level up", () => {
  it("refuses a multiclassed sheet, short XP, and a roll with no die", () => {
    const freia = { ...kenta, name: "Freía", class: "Rogue 3 / Warlock 2", level: 5, xp: 14000, sheet_hit_dice: "3d8+2d8" }
    expect(levelUp(freia, { method: "average" })).toMatchObject({ ok: false, note: expect.stringMatching(/multiclassed/) })
    expect(levelUp({ ...kenta, xp: 299 }, { method: "average" }).note).toMatch(/has 299 XP; level 2 needs 300/)
    expect(levelUp(kenta, { method: "roll" }).note).toMatch(/needs the die result/)
    expect(levelUp({ ...kenta, class: "Artificer", sheet_hit_dice: null }, { method: "average" }).note).toMatch(/no Hit Die/)
  })

  it("the fixed method writes level, hp, proficiency, Hit Dice, xp_to_next and the next slot row", () => {
    const out = levelUp(kenta, { method: "average" })
    expect(out.ok).toBe(true)
    expect(out.hp).toEqual({ die: 6, face: null, con: 2, gained: 6, method: "average" })
    expect(out.write).toEqual({
      level: 2,
      hp_max: 14,
      proficiency_bonus: 2,
      sheet_hit_dice: "2d6",
      hit_dice_remaining: 2,
      xp_to_next: 900,
      sheet_spellcasting: { pact: false, ability: "Charisma", slots: { "1": { max: 3, used: 1 } } },
    })
    expect(out.pendingChoices.map((p) => p.kind)).toEqual(["class_features", "spells"])
    expect(out.flags).toEqual([])
  })

  it("the roll method takes the die from the roller and never gains less than 1 hp", () => {
    const rolled = levelUp(kenta, { method: "roll", rng: script(d(5, 6)) })
    expect(rolled.hp).toMatchObject({ face: 5, gained: 7 })
    expect(rolled.write?.hp_max).toBe(15)

    const frail = levelUp({ ...kenta, class: "Wizard", con_score: 6 }, { method: "roll", rng: script(d(1, 6)) })
    expect(frail.hp).toMatchObject({ face: 1, con: -2, gained: 1 })
    expect(frail.write?.hp_max).toBe(9)
    expect(frail.flags.some((f) => /minimum 1 per level/.test(f))).toBe(true)
  })

  it("surfaces the ASI and subclass choices, one level at a time, only where the gate allows", () => {
    const rogue: LevelUpSheet = { ...kenta, name: "Fifi", class: "Rogue", sheet_hit_dice: "2d8", level: 2, xp: 2700, hit_dice_remaining: 2, sheet_spellcasting: null }
    const third = levelUp(rogue, { method: "average" })
    expect(third.write?.level).toBe(3)
    expect(third.pendingChoices.map((p) => p.kind)).toEqual(["subclass", "class_features"])
    expect(third.flags[0]).toMatch(/XP for level 4; taking one level at a time/)
    const fourth = levelUp({ ...rogue, level: 3, sheet_hit_dice: "3d8" }, { method: "average" })
    expect(fourth.pendingChoices.map((p) => p.kind)).toEqual(["asi", "class_features"])
    expect(fourth.write?.proficiency_bonus).toBe(2)

    expect(levelUpAllowedHere("camp", null)).toBe(true)
    expect(levelUpAllowedHere("exploration", { metadata: {} })).toBe(false)
    expect(levelUpAllowedHere("exploration", { metadata: { allows_level_up: true } })).toBe(true)

    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(6500)).toBe(5)
    expect(levelForXp(13999)).toBe(5)
    expect(xpToNext(1)).toBe(300)
    expect(xpToNext(5)).toBe(14000)
    expect(xpToNext(20)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// §13 the camp in the route
// ---------------------------------------------------------------------------

describe("camp in the route", () => {
  it("[TIME:make_camp] and [TIME:break_camp] parse at zero minutes, so the clock trigger accepts them", () => {
    expect(parseTimeEvents("They stop. [TIME:make_camp] Later. [TIME:break_camp]")).toEqual([
      { eventType: "make_camp", minutesAdvanced: 0 },
      { eventType: "break_camp", minutesAdvanced: 0 },
    ])
  })

  it("the party is camping when the latest camp-or-rest event is make_camp; a rest or break_camp ends it", () => {
    expect(isCamping(["make_camp"])).toBe(true)
    expect(isCamping(["long_rest", "make_camp"])).toBe(false)
    expect(isCamping(["short_rest"])).toBe(false)
    expect(isCamping(["break_camp", "make_camp"])).toBe(false)
    expect(isCamping([])).toBe(false)
  })

  it("full rations buy the long rest at Sam's price and nothing else is charged", () => {
    expect(campRest("full", 25, 4)).toMatchObject({ allowed: true, cost: 20, suppliesAfter: 5, hungerTicks: false, flags: [] })
    expect(campRest("full", 30, 7)).toMatchObject({ allowed: true, cost: 30, suppliesAfter: 0 })
    expect(campRest("partial", 25, 4)).toMatchObject({ allowed: true, cost: 10, suppliesAfter: 15 })
  })

  it("partial rations refuse a long rest without starving anyone, and still buy a short one", () => {
    const long = campRest("full", 12, 4)
    expect(long).toMatchObject({ allowed: false, affordable: "partial", cost: 0, suppliesAfter: 12, hungerTicks: false })
    expect(long.note).toMatch(/end the camp with a short rest/)
    expect(campRest("partial", 12, 4)).toMatchObject({ allowed: true, cost: 10, suppliesAfter: 2 })
  })

  it("no rations: no rest at all (Sam's ruling); a long night is hungry, an hour is not", () => {
    const long = campRest("full", 0, 4)
    expect(long).toMatchObject({ allowed: false, affordable: null, hungerTicks: true, cost: 0 })
    const short = campRest("partial", 9, 4)
    expect(short).toMatchObject({ allowed: false, hungerTicks: false })
    expect(long.flags).toEqual([])
    expect(short.flags).toEqual([])
  })

  it("the CAMP block tells Malachar what the rations buy, who has actions, and who came to the fire", () => {
    expect(formatCampBlock({ camping: false, supplies: 0, partySize: 4, budgets: [], visitor: null })).toBe("")
    const camped = formatCampBlock({ camping: true, supplies: 12, partySize: 4, budgets: [{ name: "Kenta", remaining: 1 }, { name: "Scott", remaining: 0 }], visitor: null })
    expect(camped).toMatch(/Rations on hand: 12/)
    expect(camped).toMatch(/only a PARTIAL rest/)
    expect(camped).toMatch(/Kenta 1, Scott 0/)
    expect(camped).toMatch(/\[TIME:break_camp\]/)

    const brigands = storedVisitor(passiveCampEncounter({ metadata: {} }, script(d(35, 40))))
    const told = formatCampBlock({ camping: false, supplies: 0, partySize: 4, budgets: [], visitor: brigands })
    expect(told).toMatch(/SOMEONE CAME TO THE FIRE/)
    expect(told).toMatch(/come to fight/)
    expect(told).toMatch(/NPC_ENCOUNTER/)
    expect(told).not.toMatch(/Rations on hand/)
    const nobody = storedVisitor(passiveCampEncounter({ metadata: {} }, script(d(10, 40))))
    expect(formatCampBlock({ camping: false, supplies: 0, partySize: 4, budgets: [], visitor: nobody })).toBe("")
  })
})

// ---------------------------------------------------------------------------
// §14 spending camp actions
// ---------------------------------------------------------------------------

describe("spending camp actions", () => {
  const base = { camping: true, who: "Kenta", remaining: 2, isSpeaker: true, requestSkill: undefined as string | null | undefined, merchantPresent: false }

  it("parses the tag, reads the menu loosely, and strips cleanly", () => {
    const text = "The fire catches. [CAMP_ACTION: Kenta | forage] Roll. [CAMP_ACTION:Scott|play music]"
    expect(parseCampActions(text)).toEqual([{ who: "Kenta", action: "forage" }, { who: "Scott", action: "play music" }])
    expect(normaliseCampAction("Level-up")).toBe("level_up")
    expect(normaliseCampAction("Foraging")).toBe("forage")
    expect(normaliseCampAction("entertain")).toBe("perform")
    expect(normaliseCampAction("sleep")).toBeNull()
    expect(text.replace(CAMP_ACTION_STRIP_RE, "")).toBe("The fire catches.  Roll. ")
  })

  it("a scene action spends one; a spent budget, no camp, or an unknown action spends nothing", () => {
    expect(decideCampAction({ ...base, action: "pray" })).toMatchObject({ action: "pray", spend: true, remaining: 1, check: null })
    expect(decideCampAction({ ...base, action: "pray", remaining: 0 })).toMatchObject({ spend: false, remaining: 0 })
    expect(decideCampAction({ ...base, action: "pray", camping: false }).note).toMatch(/not camped/)
    expect(decideCampAction({ ...base, action: "dance" }).note).toMatch(/not a camp action/)
  })

  it("forage spends only when the same reply asks the acting player for a compatible roll", () => {
    expect(decideCampAction({ ...base, action: "forage", requestSkill: "survival" })).toMatchObject({ spend: true, check: "survival", remaining: 1 })
    expect(decideCampAction({ ...base, action: "forage", requestSkill: null })).toMatchObject({ spend: true, check: "survival" })
    expect(decideCampAction({ ...base, action: "forage" }).note).toMatch(/needs a survival roll/)
    expect(decideCampAction({ ...base, action: "forage", requestSkill: "stealth" }).note).toMatch(/rolls survival, not stealth/)
    expect(decideCampAction({ ...base, action: "forage", requestSkill: "survival", isSpeaker: false }).note).toMatch(/own player/)
  })

  it("levelling and crafting are refused without spending; trade needs a merchant", () => {
    expect(decideCampAction({ ...base, action: "level up" })).toMatchObject({ spend: false, note: expect.stringMatching(/PR 4/) })
    expect(decideCampAction({ ...base, action: "craft" })).toMatchObject({ spend: false, note: expect.stringMatching(/recipes/) })
    expect(decideCampAction({ ...base, action: "brew" }).spend).toBe(false)
    expect(decideCampAction({ ...base, action: "trade" }).note).toMatch(/no merchant/)
    expect(decideCampAction({ ...base, action: "trade", merchantPresent: true }).spend).toBe(true)
  })

  it("the purpose links a roll to its action and marks it settled", () => {
    expect(campPurpose("forage")).toBe("camp:forage")
    expect(parseCampPurpose("camp:forage")).toEqual({ action: "forage", settled: false })
    expect(parseCampPurpose("camp:forage:done")).toEqual({ action: "forage", settled: true })
    expect(parseCampPurpose("camp:perform:inspired")).toEqual({ action: "perform", settled: true })
    expect(parseCampPurpose(null)).toBeNull()
    expect(parseCampPurpose("attack")).toBeNull()
  })

  it("forage settles from the committed total and the stored DC; the yield is 1d6 + WIS", () => {
    const hit = settleForage({ name: "Samson", wis_score: 16 }, { total: 15, dc: 15 }, script(d(4, 6)))
    expect(hit).toMatchObject({ success: true, supplies: 7, yieldDie: 4, dc: 15 })
    expect(hit.flags.some((f) => /DMG p\.111/.test(f))).toBe(true)
    expect(settleForage({ name: "Samson", wis_score: 16 }, { total: 14, dc: 15 }, script())).toMatchObject({ success: false, supplies: 0, yieldDie: null })
    const noDc = settleForage({ name: "Kenta", wis_score: 8 }, { total: 15, dc: null }, script(d(1, 6)))
    expect(noDc).toMatchObject({ success: true, dc: 15, supplies: 0 })
    expect(noDc.flags[0]).toMatch(/No DC/)
    expect(settleForage({ name: "Bastet", wis_score: 10 }, { total: 20, dc: 15 }, script(d(6, 6)), { hunt: true }).note).toMatch(/hunts and brings back 6 days/)
  })

  it("a warm performance lifts a partial rest once; never a full rest, never a flat one", () => {
    expect(settlePerform("Scott", 12, "partial", false)).toMatchObject({ band: "warm", inspires: true, lifts: true })
    expect(settlePerform("Scott", 12, "partial", true).lifts).toBe(false)
    expect(settlePerform("Scott", 12, "full", false).lifts).toBe(false)
    expect(settlePerform("Scott", 9, "partial", false)).toMatchObject({ band: "flat", lifts: false })
  })

  it("the CAMP block teaches the tag and carries what the dice settled", () => {
    const block = formatCampBlock({ camping: true, supplies: 20, partySize: 4, budgets: [{ name: "Kenta", remaining: 2 }], visitor: null, results: ["Kenta forages and brings back 3 days of food. Rations now 23."] })
    expect(block).toMatch(/\[CAMP_ACTION: <name> \| <action>\]/)
    expect(block).toMatch(/Not yet: level up, artifice, brew/)
    expect(block).toMatch(/SETTLED BY THE DICE/)
    expect(block).toMatch(/Rations now 23/)
    expect(formatCampBlock({ camping: false, supplies: 0, partySize: 4, budgets: [], visitor: null, results: ["Scott plays, and it falls flat."] })).toMatch(/falls flat/)
  })
})
