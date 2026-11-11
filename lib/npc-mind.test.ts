import { describe, expect, it } from "vitest"
import { cleanOffer, parseMindReply, type MindOffer } from "./npc-mind"

const offer: MindOffer = {
  actions: ["attack", "call_for_help", "retreat", "negotiate"],
  targets: ["kenta", "samson"],
  attacks: ["Scourge", "Ray of Sickness"],
  canOrder: true,
}

describe("the gate between the model and the map", () => {
  it("keeps a legal attack, its line and its order", () => {
    const c = parseMindReply(
      'Sure: {"action":"attack","target":"kenta","attack":"Ray of Sickness","line":"Kneel, worm.","order":{"kind":"focus","target":"samson"}}',
      offer,
    )
    expect(c).toEqual({ action: "attack", target: "kenta", attack: "Ray of Sickness", line: "Kneel, worm.", order: { kind: "focus", target: "samson" } })
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
    expect(cleanOffer({ actions: ["attack", "teleport", "retreat"], targets: [], attacks: ["Mace"] })).toEqual({ actions: ["retreat"], targets: [], attacks: ["Mace"], canOrder: false })
  })
})
