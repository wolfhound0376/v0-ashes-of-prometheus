import { describe, expect, it } from "vitest"
import { castLately, cleanOffer, mindNeedsModel, parseMindReply, type MindOffer } from "./npc-mind"

const offer: MindOffer = {
  actions: ["attack", "cast", "call_for_help", "retreat", "negotiate"],
  targets: ["kenta", "samson"],
  attacks: ["Scourge", "Ray of Sickness"],
  spells: [{ name: "Web", on: "hero" }, { name: "Cure Wounds", on: "ally" }, { name: "Conjure Animals", on: "self" }],
  allies: ["ilvara", "shoor"],
  canOrder: true,
}

describe("the gate between the model and the map", () => {
  it("keeps a legal attack, its line and its order", () => {
    const c = parseMindReply(
      'Sure: {"action":"attack","target":"kenta","attack":"Ray of Sickness","line":"Kneel, worm.","order":{"kind":"focus","target":"samson"}}',
      offer,
    )
    expect(c).toEqual({ action: "attack", target: "kenta", attack: "Ray of Sickness", spell: null, line: "Kneel, worm.", order: { kind: "focus", target: "samson" } })
  })
  it("throws away an action that was not offered", () => {
    expect(parseMindReply('{"action":"surrender","line":"Mercy"}', offer)).toBeNull()
    expect(parseMindReply('{"action":"fireball","target":"kenta"}', offer)).toBeNull()
  })
  it("throws away an attack on someone it was not offered", () => {
    expect(parseMindReply('{"action":"attack","target":"scott"}', offer)).toBeNull()
  })
  it("drops a weapon the block does not have, but keeps the attack", () => {
    expect(parseMindReply('{"action":"attack","target":"samson","attack":"Fireball"}', offer)?.attack).toBeNull()
  })
  it("gives orders only to a commander, and only legal ones", () => {
    expect(parseMindReply('{"action":"retreat","order":{"kind":"fall_back"}}', { ...offer, canOrder: false })?.order).toBeNull()
    expect(parseMindReply('{"action":"retreat","order":{"kind":"focus","target":"nobody"}}', offer)?.order).toBeNull()
    expect(parseMindReply('{"action":"retreat","order":{"kind":"fall_back"}}', offer)?.order).toEqual({ kind: "fall_back", target: null })
  })
  it("returns null for garbage", () => {
    expect(parseMindReply("I would rather not.", offer)).toBeNull()
    expect(parseMindReply("{not json}", offer)).toBeNull()
  })
  it("caps the bubble", () => {
    const long = Array.from({ length: 40 }, (_, i) => "w" + i).join(" ")
    expect(parseMindReply(JSON.stringify({ action: "negotiate", line: long }), offer)!.line!.split(" ").length).toBeLessThanOrEqual(18)
  })
  it("cleans the offer: unknown actions out, no attack without a target", () => {
    expect(cleanOffer({ actions: ["attack", "teleport", "retreat"], targets: [], attacks: ["Mace"] })).toEqual({ actions: ["retreat"], targets: [], attacks: ["Mace"], spells: [], allies: [], canOrder: false })
  })
  it("casts only an offered spell, on the side it is aimed at", () => {
    expect(parseMindReply('{"action":"cast","spell":"Web","target":"kenta","line":"Sleep, flies."}', offer)).toMatchObject({ action: "cast", spell: "Web", target: "kenta" })
    expect(parseMindReply('{"action":"cast","spell":"Web","target":"shoor"}', offer)).toBeNull()          // web aimed at her own
    expect(parseMindReply('{"action":"cast","spell":"Cure Wounds","target":"shoor"}', offer)).toMatchObject({ spell: "Cure Wounds", target: "shoor" })
    expect(parseMindReply('{"action":"cast","spell":"Cure Wounds","target":"kenta"}', offer)).toBeNull()  // healing the enemy
    expect(parseMindReply('{"action":"cast","spell":"Conjure Animals","target":"kenta"}', offer)).toMatchObject({ spell: "Conjure Animals", target: null })
    expect(parseMindReply('{"action":"cast","spell":"Fireball","target":"kenta"}', offer)).toBeNull()      // not in her book
  })
  it("offers no cast without a spell", () => {
    expect(cleanOffer({ actions: ["cast", "retreat"], targets: ["kenta"], spells: [] }).actions).toEqual(["retreat"])
  })
})

describe("mindNeedsModel: routine turns go to the map's algorithm, no model call", () => {
  const grunt: MindOffer = { actions: ["attack", "retreat"], targets: ["kenta"], attacks: ["Shortsword"], spells: [], allies: [], canOrder: false }
  const at = (o: Partial<Parameters<typeof mindNeedsModel>[0]>) => ({ npcName: "Jorlan Duskryn", round: 2, hp: 40, hpMax: 40, sideCount: 2, log: [], ...o })
  it("a healthy NPC with nothing to weigh, mid-fight: routine", () => {
    expect(mindNeedsModel(at({}), grunt)).toEqual({ model: false, why: "routine" })
  })
  it("the opening round thinks", () => expect(mindNeedsModel(at({ round: 1 }), grunt).why).toBe("opening"))
  it("bloodied thinks", () => expect(mindNeedsModel(at({ hp: 20 }), grunt).why).toBe("bloodied"))
  it("a commander left alone thinks", () => {
    expect(mindNeedsModel(at({ sideCount: 0 }), { ...grunt, actions: ["attack", "negotiate"] }).why).toBe("alone")
    expect(mindNeedsModel(at({ sideCount: 0 }), grunt).why).toBe("routine")
  })
  it("a commander re-reads the field on rounds 4, 7, 10", () => {
    const boss = { ...offer, spells: [] }
    expect(mindNeedsModel(at({ round: 4 }), boss).why).toBe("orders")
    expect(mindNeedsModel(at({ round: 5 }), boss).why).toBe("routine")
  })
  it("a caster weighs a spell, unless they just cast one", () => {
    const caster = { ...grunt, spells: [{ name: "Chill Touch", on: "hero" as const }] }
    expect(mindNeedsModel(at({}), caster).why).toBe("spell")
    expect(mindNeedsModel(at({ log: ["<b>Jorlan</b> casts <b>Chill Touch</b>."] }), caster).why).toBe("routine")
    expect(mindNeedsModel(at({ log: ["<b>Ilvara</b> casts <b>Web</b>."] }), caster).why).toBe("spell")
  })
  it("castLately reads the map's log through its HTML", () => {
    expect(castLately("Ilvara Mizzrym", ["x", "<b>Ilvara</b> casts <b>Web</b>: two are caught."])).toBe(true)
    expect(castLately("Ilvara Mizzrym", ["<b>Ilvara</b> hits Kenta."])).toBe(false)
  })
})
