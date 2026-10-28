import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { BOSS_RULES, bossIndex, bossState, bossCrossedBloodied, bossTitle, bossFill } from "./boss-fight.mjs"

// The party's Deadly budget the way moodFor computes it: SRD "Deadly" per character at level 1 is 100 XP.
const DEADLY_L1 = 100

describe("who is the boss (the test moodFor used for the music, now in one copy)", () => {
  it("a flagged block is the boss whatever the numbers", () => {
    // Shoor (1800) beside four guards (50 each): flagged, and he carries most of it anyway
    expect(bossIndex([{ xp: 50 }, { xp: 1800, boss: true }, { xp: 50 }], DEADLY_L1 * 4)).toBe(1)
    // flagged but poor: still the boss — the block said so
    expect(bossIndex([{ xp: 50, boss: true }, { xp: 450 }], DEADLY_L1 * 4)).toBe(0)
  })

  it("two flagged: the richer one wears the bar", () => {
    expect(bossIndex([{ xp: 1800, boss: true }, { xp: 3900, boss: true }], 400)).toBe(1)
  })

  it("unflagged: the top foe is the boss only when it is most of the fight AND deadly on its own", () => {
    // one quaggoth (450) against four level-1 heroes (budget 400): 100% of the fight, over the budget → boss
    expect(bossIndex([{ xp: 450 }], DEADLY_L1 * 4)).toBe(0)
    // a quaggoth with two guards: 450 of 550 = 82% and over budget → still the boss
    expect(bossIndex([{ xp: 50 }, { xp: 450 }, { xp: 50 }], DEADLY_L1 * 4)).toBe(1)
    // a giant spider (200) alone: all of the fight, but under the budget → no boss, an ordinary fight
    expect(bossIndex([{ xp: 200 }], DEADLY_L1 * 4)).toBe(-1)
    // four guards: nobody is most of it → no boss
    expect(bossIndex([{ xp: 50 }, { xp: 50 }, { xp: 50 }, { xp: 50 }], DEADLY_L1 * 4)).toBe(-1)
    // two quaggoths: 50% each, under the 60% share → no boss (two heavies are "overwhelming", not a boss)
    expect(bossIndex([{ xp: 450 }, { xp: 450 }], DEADLY_L1 * 4)).toBe(-1)
  })

  it("no foes, no XP, no budget: no boss", () => {
    expect(bossIndex([], 400)).toBe(-1)
    expect(bossIndex([{ xp: 0 }], 400)).toBe(-1)
    expect(bossIndex([{ xp: 450 }], 0)).toBe(-1)
    expect(bossIndex([{ xp: 450 }], NaN)).toBe(-1)
  })
})

describe("bloodied: the DM's word at half, not a condition", () => {
  it("is half", () => expect(BOSS_RULES.bloodiedAt).toBe(0.5))

  it("states", () => {
    expect(bossState(71, 71)).toBe("fresh")
    expect(bossState(36, 71)).toBe("fresh")      // 36 > 35.5
    expect(bossState(35, 71)).toBe("bloodied")   // 35 <= 35.5
    expect(bossState(1, 71)).toBe("bloodied")
    expect(bossState(0, 71)).toBe("down")
    expect(bossState(-4, 71)).toBe("down")
    expect(bossState(10, 0)).toBe("down")
  })

  it("the beat fires on the ONE blow that crosses half, and never on the kill", () => {
    expect(bossCrossedBloodied(40, 30, 71)).toBe(true)
    expect(bossCrossedBloodied(30, 20, 71)).toBe(false)   // already bloodied
    expect(bossCrossedBloodied(71, 60, 71)).toBe(false)   // still fresh
    expect(bossCrossedBloodied(40, 0, 71)).toBe(false)    // the kill is its own beat
    expect(bossCrossedBloodied(36, 35, 71)).toBe(true)    // exactly onto the line counts
  })

  it("the bar's fill is clamped", () => {
    expect(bossFill(71, 71)).toBe(1)
    expect(bossFill(0, 71)).toBe(0)
    expect(bossFill(-9, 71)).toBe(0)
    expect(bossFill(90, 71)).toBe(1)
    expect(bossFill(35.5, 71)).toBe(0.5)
    expect(bossFill(10, 0)).toBe(0)
  })
})

describe("the title on the bar: the block's own words, nothing invented", () => {
  it("name and the block's epithet", () => {
    expect(bossTitle({ name: "Ilvara Mizzrym", epithet: "Priestess of Lolth" })).toEqual({ name: "Ilvara Mizzrym", epithet: "Priestess of Lolth" })
  })
  it("a bestiary creature with no epithet shows its challenge rating (row data)", () => {
    expect(bossTitle({ name: "Hook horror", cr: "3" })).toEqual({ name: "Hook horror", epithet: "Challenge 3" })
    expect(bossTitle({ name: "Giant spider", cr: 1 })).toEqual({ name: "Giant spider", epithet: "Challenge 1" })
  })
  it("neither: one line only — no made-up second line", () => {
    expect(bossTitle({ name: "Quaggoth" })).toEqual({ name: "Quaggoth", epithet: "" })
    expect(bossTitle({ name: "Quaggoth", cr: "" })).toEqual({ name: "Quaggoth", epithet: "" })
    expect(bossTitle(null)).toEqual({ name: "?", epithet: "" })
  })
})

describe("the paste into the painted map", () => {
  it("every exported name is namespaced so the paste cannot collide with the page's own", () => {
    const src = readFileSync(new URL("./boss-fight.mjs", import.meta.url), "utf8")
    const names = [...src.matchAll(/^export (?:const|function) (\w+)/gm)].map(m => m[1])
    expect(names.length).toBeGreaterThan(0)
    for (const n of names) expect(n).toMatch(/^(BOSS_|boss)/)
  })
  it("the template carries the placeholder build_walk.py fills", () => {
    // booleans, not toContain: a failure must not print the 1 MB template into the report
    const t = readFileSync(new URL("../scripts/velkynvelve-walk/template.html", import.meta.url), "utf8")
    expect(t.includes("/*__BOSS__*/")).toBe(true)
    const b = readFileSync(new URL("../scripts/velkynvelve-walk/build_walk.py", import.meta.url), "utf8")
    expect(b.includes("'/*__BOSS__*/'")).toBe(true)
    expect(b.includes("boss_rules(ROOT)")).toBe(true)
  })
})
