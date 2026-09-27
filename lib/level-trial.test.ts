import { describe, expect, it } from "vitest"
import spells from "./data/spells.json"
import { adjustFavor, discoverSpells, trialStatus, type SpellRow } from "./level-trial"

const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length] }

describe("trialStatus", () => {
  it("XP and the trial must both be met", () => {
    const kenta = { id: "k", name: "Kenta", class: "Sorcerer", level: 1, xp: 300, practiceSinceLevel: 1 }
    expect(trialStatus(kenta)).toMatchObject({ kind: "practice", ready: false, trial: { have: 1, need: 2 } })
    expect(trialStatus({ ...kenta, practiceSinceLevel: 2 }).ready).toBe(true)
    expect(trialStatus({ ...kenta, xp: 299, practiceSinceLevel: 2 }).ready).toBe(false)
  })
  it("a wizard needs one text deciphered", () => {
    const w = { id: "w", name: "Vex", class: "Wizard", level: 3, xp: 2700 }
    expect(trialStatus(w).ready).toBe(false)
    expect(trialStatus({ ...w, decipheredSinceLevel: 1 }).ready).toBe(true)
  })
  it("a cleric's favor is named for the god on the sheet", () => {
    const s = { id: "s", name: "Samson", class: "Cleric", level: 1, xp: 300, favor: 1, sheet_personality: { faith: "Lathander" } }
    expect(trialStatus(s).trial).toMatchObject({ label: "Favor of Lathander", have: 1, need: 2, done: false })
    expect(trialStatus({ ...s, favorTarget: 1 }).ready).toBe(true) // the DM may set the target
  })
  it("a warlock below zero is owed a curse; a cleric is not", () => {
    expect(trialStatus({ id: "x", name: "X", class: "Warlock", level: 2, favor: -1 }).cursePending).toBe(true)
    expect(trialStatus({ id: "y", name: "Y", class: "Cleric", level: 2, favor: -1 }).cursePending).toBe(false)
  })
  it("a rogue needs only the XP, and says the mapping is proposed", () => {
    const f = trialStatus({ id: "f", name: "Fifi", class: "Rogue", level: 1, xp: 300 })
    expect(f).toMatchObject({ kind: "none", trial: null, ready: true })
    expect(f.flags.join(" ")).toMatch(/PROPOSED/)
  })
})

describe("discoverSpells", () => {
  const rows = spells as unknown as SpellRow[]
  it("offers three sorcerer spells the character lacks, none UA, none too high", () => {
    const r = discoverSpells({ cls: "Sorcerer", nextLevel: 2, known: ["Disguise Self", "Fog Cloud"], spells: rows, rng: seq(0.1, 0.5, 0.9) })
    expect(r.offered).toHaveLength(3)
    for (const s of r.offered) {
      expect(s.classes).toContain("Sorcerer")
      expect(s.level).toBe(1)
      expect(s.name).not.toMatch(/UA|Disguise Self|Fog Cloud/)
    }
  })
  it("subclass spells are likelier", () => {
    let hits = 0
    for (let i = 0; i < 400; i++) {
      const r = discoverSpells({ cls: "Sorcerer", subclass: "Draconic Sorcery", nextLevel: 3, known: [], spells: rows, rng: Math.random, count: 1 })
      if (["Chromatic Orb", "Alter Self", "Command", "Dragon's Breath"].includes(r.offered[0].name)) hits++
    }
    // 4 affinity spells of ~70 at weight 3 → ~16% vs ~6% unweighted
    expect(hits / 400).toBeGreaterThan(0.1)
  })
})

it("favor moves by the DM's hand and says why", () => {
  const r = adjustFavor({ id: "x", name: "Xan", class: "Warlock", favor: 0, patron: "the Fiend" }, -1, "refused the bargain")
  expect(r).toMatchObject({ favor: -1, cursePending: true })
  expect(r.note).toMatch(/the Fiend falls to -1 — refused the bargain/)
})
