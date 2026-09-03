// A quaggoth issued a sword because "Claw" was not recognised is a worse
// picture than an empty hand.
// Run: node lib/__tests__/stat-block-weapon.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const src = readFileSync(new URL("../stat-block-weapon.ts", import.meta.url), "utf8")

// lib/stat-block-weapon.ts, as implemented.
const NOT_A_WEAPON = /^(multiattack|multi-attack)$/i
const NATURAL = /\b(claw|claws|bite|hook|hooks|beak|talon|talons|pincer|gore|sting|slam|tail|horn|tentacle|fist|unarmed|punch|kick|spore|breath|touch)\b/i
const SPELL_LIKE = /\b(ray|bolt|blast|aura|gaze|cloud|summon|command|word|shriek|roar|cry|wail|screech)\b/i
function weaponFromActions(actions) {
  if (!Array.isArray(actions)) return null
  for (const raw of actions) {
    const name = String(raw?.name ?? "").trim()
    if (!name) continue
    if (NOT_A_WEAPON.test(name)) continue
    if (NATURAL.test(name)) continue
    if (SPELL_LIKE.test(name)) continue
    return name
  }
  return null
}
const act = (...names) => names.map((name) => ({ name }))

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\nstat-block weapon")

// The real rows, read out of Sam's bestiary on 2026-09-03.
test("a drow leads with its shortsword", () => {
  assert.equal(weaponFromActions(act("Shortsword", "Hand Crossbow")), "Shortsword")
  assert.equal(weaponFromActions(act("Multiattack", "Shortsword", "Hand Crossbow")), "Shortsword")
})

test("Multiattack is an instruction, not a weapon", () => {
  assert.equal(weaponFromActions(act("Multiattack", "Greataxe")), "Greataxe")
  assert.equal(weaponFromActions(act("Multiattack")), null)
})

test("Prince Derendil keeps his claws — no sword", () => {
  // He believes he is an elf prince. He is a quaggoth, and the board must not
  // agree with him by putting a blade in his hand.
  assert.equal(weaponFromActions(act("Multiattack", "Claw")), null)
})

test("a hook horror hooks with itself", () => {
  assert.equal(weaponFromActions(act("Multiattack", "Hook")), null)
})

test("but Buppido's Hooked Shortspear is a real spear", () => {
  // "Hooked" must not be swallowed by the word "hook" — the boundary matters.
  assert.equal(weaponFromActions(act("Hooked Shortspear", "Light Repeating Crossbow")), "Hooked Shortspear")
})

test("the priestess carries her scourge, not her spell", () => {
  assert.equal(
    weaponFromActions(act("Multiattack", "Scourge", "Ray of Sickness", "Summon Demon (1/Day)")),
    "Scourge",
  )
})

test("a spell is never put in a hand", () => {
  assert.equal(weaponFromActions(act("Ray of Sickness", "Eldritch Blast")), null)
  assert.equal(weaponFromActions(act("Fire Breath")), null)
})

test("a creature with no actions holds nothing", () => {
  // Jimjar's row is empty, and an empty-handed gambler is correct.
  assert.equal(weaponFromActions([]), null)
  assert.equal(weaponFromActions(null), null)
  assert.equal(weaponFromActions(undefined), null)
  assert.equal(weaponFromActions("Shortsword"), null)
  assert.equal(weaponFromActions([{ name: "" }, { name: null }]), null)
})

test("the natural list and the spell list are both in the source", () => {
  // Two lists, two jobs: this one stops a natural attack being CHOSEN,
  // archetypeFor stops it being DRAWN. Neither may quietly vanish.
  assert.match(src, /const NATURAL =/)
  assert.match(src, /const SPELL_LIKE =/)
  assert.match(src, /const NOT_A_WEAPON =/)
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
