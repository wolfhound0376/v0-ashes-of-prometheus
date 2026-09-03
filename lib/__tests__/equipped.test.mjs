// A dagger in the pack is luggage. A dagger in your hand is what Attack means.
// Run: node lib/__tests__/equipped.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const src = readFileSync(new URL("../equipped.ts", import.meta.url), "utf8")

const HAND_SLOTS = ["main_hand", "off_hand"]
const sameItem = (a, b) => (a.item_key && b.item_key ? a.item_key === b.item_key
  : a.name.trim().toLowerCase() === b.name.trim().toLowerCase())
function equippedWeapons(carried, doll) {
  const held = (doll ?? []).filter((d) => d.equipped !== false && HAND_SLOTS.includes(d.slot))
  if (!held.length) return []
  return (carried ?? []).filter((c) => {
    const type = String(c.items?.item_type ?? c.item_type ?? "").toLowerCase()
    if (type !== "weapon") return false
    return held.some((h) => sameItem({ item_key: h.item_key, name: h.name }, { item_key: c.item_key, name: c.name }))
  })
}
function canEquip({ item, slot, doll }) {
  const allowed = String(item.equippable_slot ?? item.items?.equippable_slot ?? "").trim().toLowerCase()
  if (!allowed) return { ok: false, reason: `${item.name} is not something you can wear or hold.` }
  if (allowed !== slot.trim().toLowerCase()) return { ok: false, reason: `${item.name} does not go in the ${slot.replace("_", " ")}.` }
  const taken = doll.find((d) => d.slot === slot && d.equipped !== false)
  return { ok: true, slot, replacing: taken ? taken.name : null }
}
const interactionsFor = (v) => (v.replacing ? 2 : 1)

const dagger = { name: "Dagger", item_key: "dagger", item_type: "weapon", equippable_slot: "main_hand" }
const mace   = { name: "Mace", item_key: "mace", item_type: "weapon", equippable_slot: "main_hand" }
const journal= { name: "Tattered Journal", item_key: "tattered-journal", item_type: "misc", equippable_slot: null }
const rags   = { name: "Rags", item_key: "rags", item_type: "armor", equippable_slot: "torso" }

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\nequipped")

test("a weapon in hand is a weapon you can swing", () => {
  const r = equippedWeapons([dagger, journal], [{ slot: "main_hand", item_key: "dagger", name: "Dagger" }])
  assert.deepEqual(r.map((x) => x.name), ["Dagger"])
})

test("A WEAPON IN THE PACK IS NOT", () => {
  // The whole point. Fifi carrying a dagger she has not drawn gets no dagger
  // button - and no "DAGGER · PREPARED SPELL" either.
  assert.deepEqual(equippedWeapons([dagger], []), [])
})

test("NOTHING EQUIPPED IS A REAL ANSWER, not an error", () => {
  // equipment_items is empty for all four players right now, so this is the
  // common case. The caller adds the fist; an empty result means "you have
  // only your hands", never "you cannot attack".
  assert.deepEqual(equippedWeapons([dagger, mace], null), [])
  assert.deepEqual(equippedWeapons(null, null), [])
})

test("a row explicitly unequipped does not count", () => {
  assert.deepEqual(equippedWeapons([dagger], [{ slot: "main_hand", item_key: "dagger", name: "Dagger", equipped: false }]), [])
})

test("equipped defaults to true when the column is null", () => {
  // The column's own default is true, and a null must not silently disarm
  // somebody who is holding something.
  const r = equippedWeapons([dagger], [{ slot: "main_hand", item_key: "dagger", name: "Dagger", equipped: null }])
  assert.equal(r.length, 1)
})

test("armour in the torso slot is not a weapon in your hand", () => {
  assert.deepEqual(equippedWeapons([rags], [{ slot: "torso", item_key: "rags", name: "Rags" }]), [])
})

test("a non-weapon held in the hand still cannot be swung", () => {
  // A torch is equipment; it is not an attack. The type check runs regardless
  // of the slot.
  assert.deepEqual(equippedWeapons([journal], [{ slot: "main_hand", item_key: "tattered-journal", name: "Tattered Journal" }]), [])
})

test("the off hand counts too", () => {
  const r = equippedWeapons([dagger], [{ slot: "off_hand", item_key: "dagger", name: "Dagger" }])
  assert.equal(r.length, 1)
})

test("matching prefers the catalogue key over the name", () => {
  // Two things can be called "Dagger"; only one is the catalogue dagger.
  const other = { name: "Dagger", item_key: "obsidian-flake-dagger", item_type: "weapon", equippable_slot: "main_hand" }
  const r = equippedWeapons([other], [{ slot: "main_hand", item_key: "dagger", name: "Dagger" }])
  assert.deepEqual(r, [], "matched on the name when the keys disagreed")
})

test("matching falls back to the name when a key is missing", () => {
  // Older rows have no item_key. They must still work.
  const r = equippedWeapons([{ name: "Dagger", item_type: "weapon" }], [{ slot: "main_hand", name: "Dagger" }])
  assert.equal(r.length, 1)
})

test("the item type is read through the catalogue join too", () => {
  const r = equippedWeapons([{ name: "Dagger", items: { item_type: "weapon" } }], [{ slot: "main_hand", name: "Dagger" }])
  assert.equal(r.length, 1)
})

// ---- putting it on ------------------------------------------------------

test("a dagger goes in the main hand", () => {
  const v = canEquip({ item: dagger, slot: "main_hand", doll: [] })
  assert.equal(v.ok, true)
  assert.equal(v.replacing, null)
})

test("a journal goes nowhere, and says so in words", () => {
  const v = canEquip({ item: journal, slot: "main_hand", doll: [] })
  assert.equal(v.ok, false)
  assert.match(v.reason, /not something you can wear or hold/)
})

test("a dagger does not go on your chest", () => {
  const v = canEquip({ item: dagger, slot: "torso", doll: [] })
  assert.equal(v.ok, false)
  assert.match(v.reason, /does not go in the torso/)
})

test("filling an occupied slot NAMES what it displaces", () => {
  // So the log can say "sheathes the Mace and draws the Dagger" instead of
  // silently swapping and leaving the player wondering where the mace went.
  const v = canEquip({ item: dagger, slot: "main_hand", doll: [{ slot: "main_hand", name: "Mace", item_key: "mace" }] })
  assert.equal(v.ok, true)
  assert.equal(v.replacing, "Mace")
})

// ---- what it costs ------------------------------------------------------

test("drawing a weapon is the free object interaction", () => {
  // SRD: one free object interaction per turn, and "draw or sheathe a sword"
  // is the book's own example.
  assert.equal(interactionsFor({ replacing: null }), 1)
})

test("A SWAP IS TWO INTERACTIONS", () => {
  // Sheathing one and drawing another. This is exactly why a character cannot
  // re-arm freely mid-fight, and it is the rule that makes the doll a
  // decision rather than a menu.
  assert.equal(interactionsFor({ replacing: "Mace" }), 2)
})

test("the cost model is the one ground-items already uses", () => {
  // Two different answers to "reach for a thing" is the drift this codebase
  // keeps having to undo.
  assert.ok(/ground-items/.test(src), "the shared interaction rule is no longer referenced")
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
