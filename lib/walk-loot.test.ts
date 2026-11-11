import { describe, expect, it } from "vitest"
import { POCKETS, PRISONERS, pocketEntries, scavengedRoll } from "./walk-loot"

describe("what is in the pockets (OotA ch.1)", () => {
  it("gives the named characters what the book says they carry", () => {
    // the rank-and-file guards are rolled per guard (rollPockets, walk-loot.pockets.test.ts), not a fixed list
    expect(pocketEntries("drow-guard-male")).toEqual([])
    expect(pocketEntries("ilvara").map((e) => e.slug)).toEqual(["ilvara-chest-key"])
    expect(pocketEntries("shoor").map((e) => e.slug)).toEqual(["wand-of-viscid-globs"])
    expect(pocketEntries("asha")).toEqual([])
  })

  it("rolls each prisoner once on Scavenged Possessions, the same way every time", () => {
    for (const p of PRISONERS) {
      const a = scavengedRoll(p), b = scavengedRoll(p)
      expect(a).toEqual(b)
      expect(a.days).toBeGreaterThanOrEqual(1); expect(a.days).toBeLessThanOrEqual(10)
      expect(a.d20).toBeGreaterThanOrEqual(1); expect(a.d20).toBeLessThanOrEqual(20)
      expect(a.total).toBe(a.days + a.d20)
      if (a.total <= 9) expect(a.entry).toBeNull()
      else expect(a.entry?.qty).toBe(1)
    }
  })

  it("only ever hands out the book's eight results, from the catalogue", () => {
    const allowed = new Set(["gold-coin", "small-spider", "silk-rope", "carnelian-gem", "rusted-iron-bar", "flint-shard", "hand-crossbow-bolt-drow-poison"])
    for (let i = 0; i < 500; i++) {
      const e = scavengedRoll(`test-prisoner-${i}`).entry
      if (e) expect(allowed.has(e.slug)).toBe(true)
    }
  })

  it("maps totals to the book's bands", () => {
    // spot-check across many seeds: every band reachable, and 28+ is the single poisoned bolt
    const seen = new Map<string, number>()
    for (let i = 0; i < 4000; i++) {
      const r = scavengedRoll(`band-${i}`), k = r.entry?.slug ?? "nothing"
      seen.set(k, Math.max(seen.get(k) ?? 0, r.total))
      if (r.total >= 28) expect(r.entry?.slug).toBe("hand-crossbow-bolt-drow-poison")
      if (r.total >= 10 && r.total <= 12) expect(r.entry?.slug).toBe("gold-coin")
    }
    expect(seen.size).toBe(8)
  })

  it("keeps the named characters' pockets in POCKETS", () => {
    expect(Object.keys(POCKETS)).toEqual(expect.arrayContaining(["ilvara", "shoor"]))
  })
})

import { BODY_KIT, CREATURE_PARTS, RUIN_ON, ruinOn, rollWear } from "./walk-loot"

describe("the named drow's stat-block gear, and what survives the fight", () => {
  it("gives each named drow the gear their stat block fights with", () => {
    expect(BODY_KIT.asha.map((e) => e.slug)).toEqual(["mace", "chain-shirt"])
    expect(BODY_KIT.shoor.map((e) => e.slug)).toEqual(["shortsword", "hand-crossbow", "studded-leather-armor", "shield"])
    expect(BODY_KIT.jorlan).toEqual(BODY_KIT.shoor)
    expect(BODY_KIT.ilvara.map((e) => e.slug)).toEqual(["scourge", "scale-mail"])
  })

  it("ruins a piece on a d20 at or under its number and keeps the rest", () => {
    const seq = [0.0, 0.99]   // d20 1 (ruined), then d20 20 (kept)
    let i = 0
    const out = rollWear([{ slug: "mace", qty: 1 }, { slug: "chain-shirt", qty: 1 }], () => seq[i++])
    expect(out.ruined).toEqual([{ slug: "mace", roll: 1 }])
    expect(out.kept).toEqual([{ slug: "chain-shirt", qty: 1 }])
  })

  it("rolls each unit of a stack on its own", () => {
    const rolls = [ruinOn("silk-rope") - 1, ruinOn("silk-rope") + 5].map((r) => (r - 1) / 20 + 0.001)
    let i = 0
    const out = rollWear([{ slug: "silk-rope", qty: 2, note: "a coil" }], () => rolls[i++])
    expect(out.kept).toEqual([{ slug: "silk-rope", qty: 1, note: "a coil" }])
    expect(out.ruined).toHaveLength(1)
  })

  it("an unclassified thing keeps the old base: about one in ten (1-2 on a d20)", () => {
    expect(RUIN_ON).toBe(2)
    expect(ruinOn("quaggoth-pelt")).toBe(RUIN_ON)
    let ruined = 0
    for (let n = 0; n < 4000; n++) ruined += rollWear([{ slug: "quaggoth-pelt", qty: 1 }]).ruined.length
    expect(ruined / 4000).toBeGreaterThan(0.07); expect(ruined / 4000).toBeLessThan(0.13)
  })

  // Sam, 2026-11-10: "much Harsher salvage rolls, passive roll for variety of weapons and items"
  it("has its own ruin number for each kind of thing, much harsher than the old 1-2", () => {
    expect(ruinOn("chain-shirt")).toBe(17)            // armour: 15% survive
    expect(ruinOn("shield")).toBe(17)
    expect(ruinOn("hand-crossbow")).toBe(14)          // strung: 30%
    expect(ruinOn("light-crossbow")).toBe(14)
    expect(ruinOn("shortbow")).toBe(14)
    expect(ruinOn("potion-of-healing")).toBe(12)      // glass: 40%
    expect(ruinOn("shortsword")).toBe(11)             // blades: 45%
    expect(ruinOn("scimitar")).toBe(11)
    expect(ruinOn("scourge")).toBe(11)
    expect(ruinOn("bolts-20")).toBe(10)               // ammunition: 50%
    expect(ruinOn("crossbow-bolt")).toBe(10)
    expect(ruinOn("dagger")).toBe(8)                  // sturdy: 60%
    expect(ruinOn("mace")).toBe(8)
    expect(ruinOn("silk-rope")).toBe(8)               // soft goods: 60%
    expect(ruinOn("common-clothes")).toBe(8)
    expect(ruinOn("grappling-hook")).toBe(6)          // hard kit: 70%
    expect(ruinOn("thieves-tools")).toBe(6)
  })
  it("never ruins keys, coins, or named and magic things", () => {
    for (const slug of ["slave-pen-key", "ilvara-chest-key", "iron-key", "gold-coin", "scarab-of-protection", "wand-of-viscid-globs", "ring-of-mind-shielding", "shield-plus-1", "dawnbringer"]) {
      expect(ruinOn(slug)).toBe(0)
      expect(ruinOn(slug, "acid")).toBe(0)
      expect(rollWear([{ slug, qty: 1 }], () => 0).kept).toEqual([{ slug, qty: 1 }])   // even on a 1
    }
  })
  it("leaves a rank-and-file guard's hand crossbow about three times in ten", () => {
    let kept = 0
    for (let n = 0; n < 6000; n++) kept += rollWear([{ slug: "hand-crossbow", qty: 1 }]).kept.length
    expect(kept / 6000).toBeGreaterThan(0.26); expect(kept / 6000).toBeLessThan(0.34)
  })

  it("is worse by what made the kill (Sam, 2026-10-27)", () => {
    expect(ruinOn("common-clothes", "fire")).toBe(16)
    expect(ruinOn("quaggoth-pelt", "fire")).toBe(16)
    expect(ruinOn("giant-spider-silk", "fire")).toBe(16)
    expect(ruinOn("shortsword", "fire")).toBe(11)               // a blade does not burn: its own number, no worse
    // armour is already ruined on 17 or less whatever killed its owner (PHB Selling Treasure)
    expect(ruinOn("chain-shirt", "acid")).toBe(ARMOUR_RUIN_ON)
    expect(ruinOn("studded-leather-armor", "acid")).toBe(ARMOUR_RUIN_ON)
    expect(ruinOn("dagger", "acid")).toBe(17)
    expect(ruinOn("common-clothes", "acid")).toBe(8)            // acid does nothing extra to cloth
    expect(ruinOn("potion-of-healing", "cold")).toBe(16)
    expect(ruinOn("drow-poison", "cold")).toBe(16)
    expect(ruinOn("shortsword", "cold")).toBe(11)
    expect(ruinOn("shortsword", "slashing")).toBe(11)
    expect(ruinOn("shortsword", null)).toBe(11)
  })

  it("passes the kill type through the roll", () => {
    const twelve = () => 11 / 20 + 0.001                        // every d20 shows 12
    expect(rollWear([{ slug: "common-clothes", qty: 2 }], twelve, "fire").kept).toEqual([])
    expect(rollWear([{ slug: "common-clothes", qty: 2 }], twelve, "piercing").kept).toEqual([{ slug: "common-clothes", qty: 2 }])
  })

  it("gives the carcasses their catalogue harvest parts, and they ride in BODY_KIT", () => {
    expect(CREATURE_PARTS.quaggoth.map((e) => e.slug)).toEqual(["quaggoth-pelt"])
    expect(CREATURE_PARTS["giant-spider"].map((e) => e.slug)).toEqual(["spider-venom-gland", "giant-spider-silk", "spider-meat"])
    expect(CREATURE_PARTS["gray-ooze"].map((e) => e.slug)).toEqual(["gray-ooze-residue"])
    expect(CREATURE_PARTS["hook-horror"].map((e) => e.slug)).toEqual(["hook-horror-claw"])
    for (const k of Object.keys(CREATURE_PARTS)) expect(BODY_KIT[k]).toBe(CREATURE_PARTS[k])
  })
})

import { ARMOUR_RUIN_ON, onDutyKit, rollPurse, BODY_KIT as KIT, parseContainer } from "./walk-loot"

describe("loot by the book (PHB Selling Treasure, DMG Individual Treasure)", () => {
  it("ruins armour on 17 or less, a blade on 11 or less, and keeps the kill-type rules", () => {
    expect(ARMOUR_RUIN_ON).toBe(17)
    expect(ruinOn("chain-shirt")).toBe(ARMOUR_RUIN_ON)
    expect(ruinOn("shield", "fire")).toBe(ARMOUR_RUIN_ON)
    expect(ruinOn("shortsword")).toBe(11)
    expect(ruinOn("shortsword", "acid")).toBe(17)
  })
  it("leaves the rope and hook off a guard killed at his post, keeps them in the barracks", () => {
    const kit = KIT["drow-guard-male"]
    expect(onDutyKit("drow-guard-male", "10-900-400", kit)!.map((e) => e.slug)).not.toContain("silk-rope")
    expect(onDutyKit("drow-guard-male", "2-570-930", kit)!.map((e) => e.slug)).toContain("grappling-hook")
    expect(onDutyKit("asha", "6-1-1", KIT.asha)).toEqual(KIT.asha)
  })
  it("reads a body's place from its id", () => {
    expect(parseContainer("body:drow-guard-male:2-570-930")).toMatchObject({ kind: "body", slug: "drow-guard-male", which: "2-570-930" })
  })
  it("rolls a CR 0-4 purse of one coin type in the DMG's ranges", () => {
    for (let i = 0; i < 2000; i++) {
      const p = rollPurse(0.25)
      expect(p).toHaveLength(1)
      const [{ slug, qty }] = p
      const max = { "copper-coin": 30, "silver-coin": 24, "electrum-coin": 18, "gold-coin": 18, "platinum-coin": 6 }[slug]
      expect(max).toBeDefined(); expect(qty).toBeGreaterThanOrEqual(1); expect(qty).toBeLessThanOrEqual(max!)
    }
  })
  it("rolls a CR 5-10 purse on the higher table", () => {
    const seq = [0.0, ...Array(10).fill(0.99)]   // d100 = 1 → 4d6x100 cp + 1d6x10 ep, every die a 6
    let i = 0
    expect(rollPurse(5, () => seq[i++])).toEqual([{ slug: "copper-coin", qty: 2400, note: "in a coin purse" }, { slug: "electrum-coin", qty: 60, note: "in a coin purse" }])
  })
})
