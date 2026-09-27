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
  craftMenu,
  recipeTools,
  toolForCrafter,
  craftAdvantage,
  craftSpec,
  craftModifier,
  keptD20,
  craftMaterialsGp,
  payFromPurse,
  settleCraftRoll,
  craftCategoryOf,
  purseGp,
  toolKey,
  faceRng,
  hitDieFace,
  levelUpPatch,
  withPendingChoices,
  PENDING_LEVEL_SOURCE,
  decideCampAction,
  decideTraining,
  parseTrainingArgs,
  settleTraining,
  teacherProficiency,
  TRAIN_HOURS_PER_ACTION,
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
  xpShares,
  rationsOnHand,
  spendRations,
  dawnRecharges,
  parseCraftOptions,
  twoCopiesAllowed,
  settleTake10,
  CRAFT_TAKE10_ACTIONS,
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
    expect(CAMP_ACTIONS).toHaveLength(15) // 14 from Sam's list + train (§17)
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

  it("shares XP across the seated players and the actor, never NPCs (Sam, 2026-09-27)", () => {
    const rows = [
      { id: "fifi", is_player: true, in_party: true },
      { id: "kenta", is_player: true, in_party: true },
      { id: "samson", character_type: "player", in_party: true },
      { id: "scott", is_player: true, in_party: true },
      { id: "bastet", is_player: true, in_party: false },
      { id: "jimjar", is_player: false, character_type: "npc", in_party: true },
      { id: "gone", is_player: true, in_party: true, archived_at: "2026-09-01" },
    ]
    // Four seated players split 100 → 25 each; the NPC and the archived row get nothing.
    expect(xpShares(100, rows, "fifi")).toEqual([
      { id: "fifi", xp: 25 }, { id: "kenta", xp: 25 }, { id: "samson", xp: 25 }, { id: "scott", xp: 25 },
    ])
    // An unseated player who lands the blow joins the share.
    expect(xpShares(100, rows, "bastet").map((s) => s.id).sort()).toEqual(["bastet", "fifi", "kenta", "samson", "scott"])
    expect(xpShares(100, rows, "bastet")[0].xp).toBe(20)
    // Rounded down; nobody seated means the actor keeps it all.
    expect(xpShares(10, rows, "fifi")[0].xp).toBe(2)
    expect(xpShares(50, [], "fifi")).toEqual([{ id: "fifi", xp: 50 }])
    expect(xpShares(0, rows, "fifi")).toEqual([])
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
    expect(parseCampActions(text)).toEqual([{ who: "Kenta", action: "forage", args: [] }, { who: "Scott", action: "play music", args: [] }])
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

  it("levelling and crafting spend like any action; trade needs a merchant", () => {
    expect(decideCampAction({ ...base, action: "level up" })).toMatchObject({ action: "level_up", spend: true, remaining: 1, check: null })
    expect(decideCampAction({ ...base, action: "craft" })).toMatchObject({ action: "artifice", spend: true, remaining: 1 })
    expect(decideCampAction({ ...base, action: "brew" })).toMatchObject({ action: "brew", spend: true })
    expect(decideCampAction({ ...base, action: "trade" }).note).toMatch(/no merchant/)
    expect(decideCampAction({ ...base, action: "trade", merchantPresent: true }).spend).toBe(true)
  })

  it("the purpose links a roll to its action and marks it settled", () => {
    expect(campPurpose("forage")).toBe("camp:forage")
    expect(parseCampPurpose("camp:forage")).toEqual({ action: "forage", settled: false, arg: null })
    expect(parseCampPurpose("camp:forage:done")).toEqual({ action: "forage", settled: true, arg: null })
    expect(parseCampPurpose("camp:perform:inspired")).toEqual({ action: "perform", settled: true, arg: null })
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
    expect(block).not.toMatch(/Not yet:/)
    expect(block).toMatch(/\[CAMP_ACTION: <name> \| craft \| <catalog item>\]/)
    expect(block).toMatch(/\[CAMP_ACTION: <name> \| level up\]/)
    expect(block).toMatch(/SETTLED BY THE DICE/)
    expect(block).toMatch(/Rations now 23/)
    expect(formatCampBlock({ camping: false, supplies: 0, partySize: 4, budgets: [], visitor: null, results: ["Scott plays, and it falls flat."] })).toMatch(/falls flat/)
  })
})

// ---------------------------------------------------------------------------
// §15 levelling at camp
// ---------------------------------------------------------------------------

describe("levelling at camp", () => {
  const kentaSheet: LevelUpSheet = {
    id: "kenta", name: "Kenta", class: "Sorcerer", level: 1, xp: 300, hp_max: 8, con_score: 15,
    hit_dice_remaining: 1, sheet_hit_dice: "1d6",
    sheet_spellcasting: { pact: false, ability: "Charisma", slots: { "1": { max: 2, used: 1 } } },
  }
  const features = [{ name: "Spellcasting", desc: "Cast prepared Sorcerer spells.", source: "Sorcerer 1" }]

  it("the table's face is the roll: faceRng feeds it to levelUp exactly once", () => {
    const out = levelUp(kentaSheet, { method: "roll", rng: faceRng(5, 6) })
    expect(out.hp).toMatchObject({ die: 6, face: 5, con: 2, gained: 7, method: "roll" })
    const rng = faceRng(3, 6)
    rng()
    expect(() => rng()).toThrow(/one face/)
  })

  it("reads a face only when it is a legal face of the Hit Die", () => {
    expect(hitDieFace([4], 6)).toBe(4)
    expect(hitDieFace([7], 6)).toBeNull()
    expect(hitDieFace([0], 6)).toBeNull()
    expect(hitDieFace("4", 6)).toBeNull()
    expect(hitDieFace([], 6)).toBeNull()
  })

  it("pending choices become one feature entry on the sheet, never two for the same level", () => {
    const choices = [{ kind: "asi" as const, text: "Ability Score Improvement.", source: "SRD" }, { kind: "spells" as const, text: "Spells known.", source: "SRD" }]
    const once = withPendingChoices(features, 4, choices)
    expect(once).toHaveLength(2)
    expect(once[1]).toEqual({ name: "Level 4 — choices to make", desc: "Ability Score Improvement. Spells known.", source: PENDING_LEVEL_SOURCE })
    expect(withPendingChoices(once, 4, choices)).toHaveLength(2)
    expect(withPendingChoices(null, 2, [])).toEqual([])
  })

  it("the patch writes what the SRD fixes, lifts current hp by the same amount, and keeps the sheet's other features", () => {
    const out = levelUp(kentaSheet, { method: "average" })
    const patch = levelUpPatch(out, { hp_current: 5, sheet_features: features })
    expect(patch).toMatchObject({
      level: 2, hp_max: 14, hp_current: 11, proficiency_bonus: 2, sheet_hit_dice: "2d6", hit_dice_remaining: 2, xp_to_next: 900,
      sheet_spellcasting: { pact: false, ability: "Charisma", slots: { "1": { max: 3, used: 1 } } },
    })
    const f = patch!.sheet_features as { name: string; source: string }[]
    expect(f[0]).toEqual(features[0])
    expect(f[1].name).toBe("Level 2 — choices to make")
    expect(levelUpPatch(levelUp({ ...kentaSheet, xp: 0 }, { method: "average" }), { hp_current: 5, sheet_features: features })).toBeNull()
    const noDice = levelUpPatch(levelUp({ ...kentaSheet, hit_dice_remaining: null }, { method: "average" }), { hp_current: 5, sheet_features: [] })
    expect(noDice).not.toHaveProperty("hit_dice_remaining")
  })
})

// ---------------------------------------------------------------------------
// §16 the crafting menu
// ---------------------------------------------------------------------------

describe("the crafting menu", () => {
  // The four recipes the SRD ties to a tool, as the catalog rows will carry them.
  const herb = { tools: "Herbalism Kit", source: "SRD 5.1 Equipment: Tools — Herbalism Kit" }
  const poison = { tools: "Poisoner's Kit", source: "SRD 5.1 Equipment: Tools — Poisoner's Kit" }
  const recipes = [
    { id: "i1", slug: "potion-of-healing", name: "Potion of Healing", value: 50, properties: { craft: herb } },
    { id: "i2", slug: "antitoxin", name: "Antitoxin (vial)", value: 50, properties: { craft: herb } },
    { id: "i3", slug: "basic-poison-vial", name: "Basic Poison (vial)", value: 100, properties: { craft: poison } },
    { id: "i4", slug: "drow-poison", name: "Drow poison", value: 200, properties: { craft: { ...poison, materials: [{ slug: "spider-venom-gland", qty: 1 }] } } },
    { id: "i5", slug: "rope", name: "Rope", value: 1, properties: { srd: true } },
    { id: "i6", slug: "mystery", name: "Mystery", value: 10, properties: { craft: { tools: "Navigator's Tools" } } },
  ]

  it("reads tools loosely and sorts them onto Sam's three tabs", () => {
    expect(toolKey("Tinker's Tools (Artificer Kit)")).toBe("tinkers tools")
    expect(toolKey("Poisoner’s Kit")).toBe("poisoners kit")
    expect(craftCategoryOf({ tools: "Herbalism Kit" })).toBe("alchemy")
    expect(craftCategoryOf({ tools: "Building Hammer" })).toBe("construct")
    expect(craftCategoryOf({ tools: "Tinker's Tools (Artificer Kit)" })).toBe("artifice")
    expect(craftCategoryOf({ tools: "Navigator's Tools" })).toBeNull()
    expect(craftCategoryOf({ tools: "Navigator's Tools", category: "artifice" })).toBe("artifice")
  })

  it("the coin purse counts in gold, SRD rates", () => {
    expect(purseGp({ pp: 1, gp: 2, ep: 2, sp: 5, cp: 50 })).toBe(14)
    expect(purseGp(null)).toBe(0)
  })

  it("lights an option only with proficiency, the tool in the pack, the materials and the gold", () => {
    const menu = craftMenu({
      recipes,
      proficiencies: ["Herbalism Kit", "Thieves' Tools"],
      carried: [{ name: "Herbalism Kit", quantity: 1, slug: "herbalism-kit" }],
      currency: { gp: 30 },
    })
    expect(menu.construct).toEqual([])
    expect(menu.artifice).toEqual([])
    const byName = Object.fromEntries(menu.alchemy.map((o) => [o.name, o]))
    expect(byName["Potion of Healing"]).toMatchObject({ available: true, missing: [], materialsGp: 25, category: "alchemy" })
    expect(byName["Antitoxin (vial)"].available).toBe(true)
    expect(byName["Basic Poison (vial)"]).toMatchObject({ available: false })
    expect(byName["Basic Poison (vial)"].missing).toEqual([
      "Not proficient with Poisoner's Kit.",
      "No Poisoner's Kit carried.",
      "Needs 50 gp of materials (30 gp in the purse).",
    ])
    expect(byName["Drow poison"].missing).toContain("Needs 1 spider venom gland (0 carried).")
    // Lit first, then by name; unknown tools and non-recipes never appear.
    expect(menu.alchemy.map((o) => o.name)).toEqual(["Antitoxin (vial)", "Potion of Healing", "Basic Poison (vial)", "Drow poison"])
  })

  it("a proficient poisoner with kit, gland and gold sees drow poison lit; a facility is required only when named", () => {
    const menu = craftMenu({
      recipes: [recipes[3], { ...recipes[2], properties: { craft: { ...poison, requires: "Alchemy lab" } } }],
      proficiencies: ["Poisoner's Kit"],
      carried: [{ name: "Poisoner's Kit", quantity: 1 }, { name: "Spider Venom Gland", quantity: 2, slug: "spider-venom-gland" }],
      currency: { gp: 150 },
    })
    expect(menu.alchemy.find((o) => o.slug === "drow-poison")).toMatchObject({ available: true, materialsGp: 100 })
    expect(menu.alchemy.find((o) => o.slug === "basic-poison-vial")?.missing).toEqual(["Needs a Alchemy lab nearby."])
  })
})

// §17 TRAIN — the teaching path (docs/claude_Earned_Proficiency.md path C)
// ---------------------------------------------------------------------------

describe("§17 train — hours with a teacher, then the test", () => {
  // Sam, 2026-09-27: a trainer must have expertise. Eldeth is a master; Buppido merely knows the tunnels.
  const eldeth = { id: "t-eldeth", name: "Eldeth Feldrun", sheet_skill_proficiencies: { "Animal Handling": "expertise", Survival: "proficient" }, skills: null }
  const buppido = { id: "t-buppido", name: "Buppido", sheet_skill_proficiencies: {}, skills: "Stealth +4", dex_score: 15, proficiency_bonus: 2 }
  // SRD stat block: DEX 18 (+4), proficiency +3, Stealth +10 = 4 + 2×3 — the doubled bonus by any name.
  const eliteWarrior = { id: "t-elite", name: "Drow Elite Warrior", skills: "Perception +4, Stealth +10", dex_score: 18, wis_score: 13, proficiency_bonus: 3 }
  const base = {
    who: "Samson",
    camping: true,
    remaining: 2,
    skill: "animal_handling" as const,
    teacherName: "Eldeth",
    teacher: eldeth,
    studentProficiency: "none" as const,
    studentId: "s-samson",
    alreadyAwarded: false,
    hoursBanked: 0,
    threshold: 40,
    minDc: 12,
    isSpeaker: true,
    requestSkill: undefined,
    requestDc: undefined,
  }

  it("the tag carries the teacher and the skill after the action, in either order", () => {
    const tags = parseCampActions("[CAMP_ACTION: Samson | train | Eldeth | animal handling] and [CAMP_ACTION: Kenta | forage]")
    expect(tags).toEqual([
      { who: "Samson", action: "train", args: ["Eldeth", "animal handling"] },
      { who: "Kenta", action: "forage", args: [] },
    ])
    expect(parseTrainingArgs(["Eldeth", "animal handling"])).toEqual({ teacher: "Eldeth", skill: "animal_handling" })
    expect(parseTrainingArgs(["Sleight of Hand", "Jimjar"])).toEqual({ teacher: "Jimjar", skill: "sleight_of_hand" })
    expect(parseTrainingArgs(["Jimjar"])).toEqual({ teacher: "Jimjar", skill: null })
    expect(parseTrainingArgs([])).toEqual({ teacher: null, skill: null })
  })

  it("a teacher's level comes from their sheet map or their stat-block maths — nothing else counts", () => {
    expect(teacherProficiency(eldeth, "animal_handling")).toBe("expertise")
    expect(teacherProficiency(eldeth, "survival")).toBe("proficient")
    expect(teacherProficiency(buppido, "stealth")).toBe("proficient")
    expect(teacherProficiency(buppido, "animal_handling")).toBe("none")
    // Stealth +10 on DEX 18 with a +3 bonus is the doubled bonus; Perception +4 on WIS 13 is the plain one.
    expect(teacherProficiency(eliteWarrior, "stealth")).toBe("expertise")
    expect(teacherProficiency(eliteWarrior, "perception")).toBe("proficient")
    // Without the scores a stat-block line can prove proficiency, never mastery.
    expect(teacherProficiency({ id: "x", name: "Unknown", skills: "Stealth +10" }, "stealth")).toBe("proficient")
    expect(teacherProficiency({ id: "x", name: "Nobody" }, "arcana")).toBe("none")
    expect(teacherProficiency({ id: "x", name: "Expert", sheet_skill_proficiencies: { stealth: "expertise" } }, "stealth")).toBe("expertise")
  })

  it("an evening below the threshold banks hours and spends the action — Sam's rulings, no flags", () => {
    const d = decideTraining(base)
    expect(d).toMatchObject({ spend: true, remaining: 1, bank: TRAIN_HOURS_PER_ACTION, test: false, purpose: null, flags: [] })
    expect(TRAIN_HOURS_PER_ACTION).toBe(4)
    expect(d.note).toMatch(/evening of animal handling with Eldeth Feldrun/)
  })

  it("Sam, 2026-09-27: a trainer must have expertise — a merely proficient teacher is refused without spending", () => {
    expect(decideTraining({ ...base, skill: "survival", teacher: eldeth }).note).toMatch(/has survival but not the mastery to teach it/)
    expect(decideTraining({ ...base, skill: "stealth", teacher: buppido })).toMatchObject({ spend: false, remaining: 2 })
    expect(decideTraining({ ...base, skill: "stealth", teacher: eliteWarrior }).spend).toBe(true)
    expect(decideTraining({ ...base, skill: "perception", teacher: eliteWarrior }).spend).toBe(false)
  })

  it("refusals never spend: not camped, no skill, no teacher, unknown teacher, self, a teacher without the skill, no actions", () => {
    expect(decideTraining({ ...base, camping: false })).toMatchObject({ spend: false, remaining: 2 })
    expect(decideTraining({ ...base, skill: null }).note).toMatch(/name one of the 18 skills/)
    expect(decideTraining({ ...base, teacherName: null }).note).toMatch(/name the teacher/)
    expect(decideTraining({ ...base, teacher: null }).note).toMatch(/nobody called "Eldeth"/)
    expect(decideTraining({ ...base, teacher: { ...eldeth, id: "s-samson" } }).note).toMatch(/teach themself/)
    expect(decideTraining({ ...base, teacher: buppido }).note).toMatch(/Buppido does not have animal handling/)
    expect(decideTraining({ ...base, remaining: 0 })).toMatchObject({ spend: false, remaining: 0 })
  })

  it("a student who already has the skill, or already earned it, learns nothing", () => {
    expect(decideTraining({ ...base, studentProficiency: "proficient" }).note).toMatch(/already has animal handling/)
    expect(decideTraining({ ...base, studentProficiency: "expertise" }).spend).toBe(false)
    expect(decideTraining({ ...base, alreadyAwarded: true }).note).toMatch(/already earned/)
  })

  it("once the hours are banked the evening is the test, on the student's own dice at the rule's DC", () => {
    const ready = { ...base, hoursBanked: 40 }
    expect(decideTraining(ready).note).toMatch(/needs a animal handling roll at DC 12/)
    expect(decideTraining({ ...ready, requestSkill: "stealth", requestDc: 12 }).note).toMatch(/rolls animal handling, not stealth/)
    expect(decideTraining({ ...ready, requestSkill: "animal_handling", requestDc: 10 }).note).toMatch(/DC 12, not 10/)
    expect(decideTraining({ ...ready, requestSkill: "animal_handling", requestDc: 12, isSpeaker: false }).note).toMatch(/own player/)
    const d = decideTraining({ ...ready, requestSkill: "animal_handling", requestDc: 12 })
    expect(d).toMatchObject({ spend: true, remaining: 1, bank: null, test: true, purpose: "camp:train:t-eldeth" })
    // A bare [[1d20+1]] with no skill on it is still accepted, like forage.
    expect(decideTraining({ ...ready, requestSkill: null }).test).toBe(true)
    // Sam's threshold from the rules row, not the code.
    expect(decideTraining({ ...base, hoursBanked: 8, threshold: 8, requestSkill: "animal_handling", requestDc: 12 }).test).toBe(true)
  })

  it("the purpose round-trips with the teacher's id, settled or not", () => {
    expect(parseCampPurpose("camp:train:t-eldeth")).toEqual({ action: "train", settled: false, arg: "t-eldeth" })
    expect(parseCampPurpose("camp:train:t-eldeth:done")).toEqual({ action: "train", settled: true, arg: "t-eldeth" })
    expect(parseCampPurpose("camp:forage")).toEqual({ action: "forage", settled: false, arg: null })
    expect(parseCampPurpose("camp:forage:done")).toEqual({ action: "forage", settled: true, arg: null })
    expect(parseCampPurpose("camp:perform:inspired")).toEqual({ action: "perform", settled: true, arg: null })
  })

  it("the generic path never spends a train tag by accident", () => {
    expect(decideCampAction({ camping: true, who: "Samson", action: "train", remaining: 2, isSpeaker: true, requestSkill: undefined, merchantPresent: false }))
      .toMatchObject({ action: "train", spend: false, remaining: 2 })
  })

  it("the settled test is a fact, pass or fail, and the hours survive a failure", () => {
    expect(settleTraining("Samson", "animal_handling", "Eldeth", 14, 12, 12)).toMatch(/passed Eldeth's animal handling test/)
    expect(settleTraining("Samson", "animal_handling", "Eldeth", 11, 12, 12)).toMatch(/failed .* hours are not lost/)
    expect(settleTraining("Samson", "animal_handling", "Eldeth", 12, null, 12)).toMatch(/passed/)
  })
})


// ---------------------------------------------------------------------------
// §18 the crafting roll
// ---------------------------------------------------------------------------

describe("the crafting roll", () => {
  const herb = { tools: "Herbalism Kit" }
  const poison = { tools: "Poisoner's Kit" }

  it("DC and hours come from rarity, halved for consumables, one check per good hour", () => {
    expect(craftSpec({ rarity: "common", item_type: "consumable" }, poison).spec).toMatchObject({ dc: 12, hours: 1, checks: 1, abilities: ["int", "wis"] })
    expect(craftSpec({ rarity: "uncommon", item_type: "consumable" }, poison).spec).toMatchObject({ dc: 15, hours: 1, checks: 1 })
    expect(craftSpec({ rarity: "rare", item_type: "weapon" }, { tools: "Smith's Tools" }).spec).toMatchObject({ dc: 18, hours: 4, checks: 4, abilities: ["str", "dex"] })
    expect(craftSpec({ rarity: "very_rare", item_type: "consumable" }, poison).spec).toMatchObject({ dc: 21, hours: 3, checks: 3 })
    expect(craftSpec({ rarity: "legendary", item_type: "armor" }, { tools: "Smith's Tools" }).spec).toMatchObject({ dc: 24, checks: 8 })
  })

  it("a recipe's own printed DC and hours win (Fireburst Bomb: DC 12, 1 hour; Silence Bomb: DC 16, 8 hours)", () => {
    expect(craftSpec({ rarity: "rare", item_type: "consumable" }, { tools: "Alchemist's Supplies", dc: 16, hours: 8 }).spec).toMatchObject({ dc: 16, hours: 8, checks: 8 })
    expect(craftSpec({ rarity: "uncommon", item_type: "consumable" }, { tools: "Alchemist's Supplies", dc: 12, hours: 1 }).spec).toMatchObject({ dc: 12, checks: 1 })
  })

  it("says why when the sources give no way to roll it, and flags the readings", () => {
    expect(craftSpec({ rarity: "common", item_type: "gear" }, { tools: "Navigator's Tools" })).toMatchObject({ spec: null, reason: expect.stringMatching(/No crafting abilities/) })
    expect(craftSpec({ rarity: "artifact", item_type: "gear" }, poison).reason).toMatch(/Artifacts/)
    expect(craftSpec({ rarity: null, item_type: "gear" }, poison).spec?.flags[0]).toMatch(/crafted as common/)
    expect(craftSpec({ rarity: "common", item_type: "consumable" }, herb).spec?.flags[0]).toMatch(/Claude's reading/)
  })

  it("the modifier is the better of the tool's two abilities plus proficiency", () => {
    // Samson: INT 10, WIS 16, +2 → WIS +3 + 2.
    expect(craftModifier({ int_score: 10, wis_score: 16 }, ["int", "wis"], 2)).toEqual({ ability: "wis", modifier: 5 })
    expect(craftModifier({ str_score: 17, dex_score: 12 }, ["str", "dex"], 3)).toEqual({ ability: "str", modifier: 6 })
    expect(craftModifier({}, ["int", "wis"], 2)).toEqual({ ability: "int", modifier: 2 })
  })

  it("reads the table's kept d20, and refuses anything that is not one", () => {
    expect(keptD20({ total: 17, modifier: 5 })).toBe(12)
    expect(keptD20({ total: 30, modifier: 5 })).toBeNull()
    expect(keptD20(null)).toBeNull()
  })

  it("materials cost the recipe's printed price, or half the market value", () => {
    expect(craftMaterialsGp(50, herb)).toBe(25)
    expect(craftMaterialsGp(550, { tools: "Alchemist's Supplies", cost_gp: 300 })).toBe(300)
  })

  it("pays from the purse in gold first, and gives change when it must", () => {
    expect(payFromPurse({ gp: 50, sp: 3 }, 25)).toEqual({ cp: 0, sp: 3, ep: 0, gp: 25, pp: 0 })
    expect(payFromPurse({ pp: 1, gp: 0 }, 2.5)).toEqual({ cp: 0, sp: 5, ep: 0, gp: 7, pp: 0 })
    expect(payFromPurse({ gp: 10 }, 25)).toBeNull()
  })

  it("success banks the hour and finishes the item; failure wastes the hour but keeps the work", () => {
    const spec = { dc: 15, hours: 2, checks: 2, abilities: ["int", "wis"] as ["int", "wis"], flags: [] }
    const first = settleCraftRoll({ crafter: "Fifi", item: "Drow poison", face: 11, modifier: 5, spec, successes: 0, attempts: 0 })
    expect(first).toMatchObject({ success: true, total: 16, successes: 1, attempts: 1, done: false })
    expect(first.note).toMatch(/1 more hour/)
    const miss = settleCraftRoll({ crafter: "Fifi", item: "Drow poison", face: 3, modifier: 5, spec, successes: 1, attempts: 1 })
    expect(miss).toMatchObject({ success: false, successes: 1, attempts: 2, done: false })
    expect(miss.note).toMatch(/still holds/)
    const last = settleCraftRoll({ crafter: "Fifi", item: "Drow poison", face: 10, modifier: 5, spec, successes: 1, attempts: 2 })
    expect(last).toMatchObject({ success: true, successes: 2, done: true })
    expect(last.note).toMatch(/in their pack/)
  })

  it("the menu shows DC and hours, and an open project needs no second payment", () => {
    const recipes = [{ id: "i1", slug: "drow-poison", name: "Drow poison", value: 200, rarity: "uncommon", item_type: "consumable", properties: { craft: poison } }]
    const base = { recipes, proficiencies: ["Poisoner's Kit"], carried: [{ name: "Poisoner's Kit", quantity: 1 }], currency: { gp: 0 } }
    const fresh = craftMenu(base).alchemy[0]
    expect(fresh).toMatchObject({ dc: 15, checks: 1, progress: null, available: false })
    expect(fresh.missing).toEqual(["Needs 100 gp of materials (0 gp in the purse)."])
    const underway = craftMenu({ ...base, openProjects: [{ item_id: "i1", successes: 0 }] }).alchemy[0]
    expect(underway).toMatchObject({ available: true, progress: { successes: 0, checks: 1 }, missing: [] })
  })
})

describe("either tool, and Xanathar's tool-and-skill advantage", () => {
  const antitoxin = { tools: "Herbalism Kit", alt_tools: ["Alchemist's Supplies", "herbalism kit"] }

  it("a recipe's tools are the main one then the alternatives, without repeats", () => {
    expect(recipeTools(antitoxin)).toEqual(["Herbalism Kit", "Alchemist's Supplies"])
    expect(toolForCrafter(antitoxin, ["Thieves' Tools", "Alchemist's Supplies"])).toBe("Alchemist's Supplies")
    expect(toolForCrafter(antitoxin, ["Navigator's Tools"])).toBeNull()
  })

  it("an alchemist lights antitoxin with their own supplies, and Arcana gives advantage", () => {
    const menu = craftMenu({
      recipes: [{ id: "a", slug: "antitoxin", name: "Antitoxin (vial)", value: 50, rarity: "common", item_type: "consumable", properties: { craft: antitoxin } }],
      proficiencies: ["Alchemist's Supplies"],
      carried: [{ name: "Alchemist's Supplies", quantity: 1 }],
      currency: { gp: 25 },
      skills: { Arcana: "proficient" },
    }).alchemy[0]
    expect(menu).toMatchObject({ available: true, tool: "Alchemist's Supplies", tools: "Herbalism Kit or Alchemist's Supplies", advantage: "Arcana", dc: 12, checks: 1 })
  })

  it("with neither tool, the reason names both", () => {
    const menu = craftMenu({
      recipes: [{ id: "a", slug: "antitoxin", name: "Antitoxin (vial)", value: 50, rarity: "common", item_type: "consumable", properties: { craft: antitoxin } }],
      proficiencies: [], carried: [], currency: { gp: 25 },
    }).alchemy[0]
    expect(menu.missing).toEqual(["Not proficient with Herbalism Kit or Alchemist's Supplies.", "No Herbalism Kit or Alchemist's Supplies carried."])
    expect(menu.advantage).toBeNull()
  })

  it("advantage only where the book ties the craft to a skill, and only with that skill", () => {
    expect(craftAdvantage("Alchemist's Supplies", { arcana: "expertise" })).toBe("Arcana")
    expect(craftAdvantage("Alchemist's Supplies", { Nature: "proficient" })).toBeNull()
    expect(craftAdvantage("Poisoner's Kit", { Arcana: "proficient" })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Beads of nourishment count as rations (Sam, 2026-09-27)
// ---------------------------------------------------------------------------

describe("pack rations", () => {
  const packs = [
    { id: "fifi-beads", quantity: 3, per: 1 },
    { id: "kenta-beads", quantity: 2, per: 1 },
  ]
  it("counts the pool plus every bead carried", () => {
    expect(rationsOnHand(10, packs)).toBe(15)
    expect(rationsOnHand(null, [])).toBe(0)
  })
  it("spends the pool first, then beads, whole units", () => {
    expect(spendRations(12, packs, 10)).toEqual({ poolAfter: 2, packs: [], spent: 10 })
    expect(spendRations(8, packs, 10)).toEqual({ poolAfter: 0, packs: [{ id: "fifi-beads", quantity: 1 }], spent: 10 })
    expect(spendRations(0, packs, 4)).toEqual({
      poolAfter: 0, packs: [{ id: "fifi-beads", quantity: 0 }, { id: "kenta-beads", quantity: 1 }], spent: 4,
    })
  })
  it("never charges past what is on hand", () => {
    expect(spendRations(1, packs, 20).spent).toBe(6)
  })
})


describe("dawn recharge at the long rest (Sam, 2026-09-27)", () => {
  it("names items whose row says they recharge at dawn, and only those", () => {
    expect(dawnRecharges([
      { owner: "Kenta", name: "Wand of Winter", recharge: "1d6+1 at dawn" },
      { owner: "Fifi", name: "Wand of Smiles", description: "The wand regains all expended charges daily at dawn." },
      { owner: "Scott", name: "Ring of Three Wishes", description: "Cast wish; ring becomes nonmagical at 0 charges" },
    ])).toEqual([
      "Kenta's Wand of Winter regains 1d6+1 charges (dawn comes with the long rest).",
      "Fifi's Wand of Smiles regains its charges (dawn comes with the long rest).",
    ])
  })
})

describe("take 10 and two copies (Two-Parts; Sam, 2026-09-27)", () => {
  const poison = { tools: "Poisoner's Kit" }
  const bomb = { tools: "Alchemist's Supplies", dc: 12, hours: 1 }

  it("reads the options after the item", () => {
    expect(parseCraftOptions([])).toEqual({ take10: false, copies: 1 })
    expect(parseCraftOptions(["take 10"])).toEqual({ take10: true, copies: 1 })
    expect(parseCraftOptions(["Two copies", "Take 10"])).toEqual({ take10: true, copies: 2 })
    expect(parseCraftOptions(["x2"]).copies).toBe(2)
  })

  it("two copies of a consumable take the full time; not when the source prints the hours", () => {
    expect(twoCopiesAllowed({ item_type: "consumable" }, poison)).toBe(true)
    expect(twoCopiesAllowed({ item_type: "weapon" }, poison)).toBe(false)
    expect(twoCopiesAllowed({ item_type: "consumable" }, bomb)).toBe(false)
    expect(craftSpec({ rarity: "very_rare", item_type: "consumable" }, poison).spec?.checks).toBe(3)
    expect(craftSpec({ rarity: "very_rare", item_type: "consumable" }, poison, poison.tools, { copies: 2 }).spec?.checks).toBe(6)
  })

  it("taking 10 banks an hour with no roll, for two actions", () => {
    expect(CRAFT_TAKE10_ACTIONS).toBe(2)
    const spec = craftSpec({ rarity: "uncommon", item_type: "consumable" }, poison, poison.tools, { copies: 2 }).spec!
    const first = settleTake10({ crafter: "Fifi", item: "Drow poison", spec, successes: 0, attempts: 0, copies: 2 })
    expect(first).toMatchObject({ success: true, successes: 1, attempts: 1, done: false })
    const last = settleTake10({ crafter: "Fifi", item: "Drow poison", spec, successes: 1, attempts: 1, copies: 2 })
    expect(last.done).toBe(true)
    expect(last.note).toMatch(/2 Drow poisons/)
  })

  it("the menu offers two copies with both copies' materials, and an open project keeps its count", () => {
    const recipes = [{ id: "i1", slug: "drow-poison", name: "Drow poison", value: 200, rarity: "uncommon", item_type: "consumable", properties: { craft: poison } }]
    const base = { recipes, proficiencies: ["Poisoner's Kit"], carried: [{ name: "Poisoner's Kit", quantity: 1 }], currency: { gp: 150 } }
    const fresh = craftMenu(base).alchemy[0]
    expect(fresh.twoCopies).toEqual({ checks: 2, materialsGp: 200, available: false })
    expect(craftMenu({ ...base, currency: { gp: 200 } }).alchemy[0].twoCopies?.available).toBe(true)
    const underway = craftMenu({ ...base, openProjects: [{ item_id: "i1", successes: 1, copies: 2 }] }).alchemy[0]
    expect(underway.progress).toEqual({ successes: 1, checks: 2, copies: 2 })
    expect(underway.twoCopies).toBeNull()
  })
})
