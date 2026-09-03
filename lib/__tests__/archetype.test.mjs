// What goes in the hand, and what must never go in the hand.
// Run: node lib/__tests__/archetype.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const src = readFileSync(new URL("../equipment.ts", import.meta.url), "utf8")

// lib/equipment.ts archetypeFor, as implemented. The tables are PARSED out of
// the source rather than retyped, so a rule that changes there fails here.
const body = src.slice(src.indexOf("export function archetypeFor"), src.indexOf("export const RARITY_TINT"))
const rules = [...body.matchAll(/if \(\/([^/]+)\/\.test\(n\)\) return "([a-z]+)"/g)].map((m) => [new RegExp(m[1]), m[2]])
function archetypeFor(name, itemType) {
  const n = name.toLowerCase()
  for (const [re, out] of rules) if (re.test(n)) return out
  if (itemType === "armor") return "shield"
  return "blade"
}

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\narchetypes")

test("the source still has rules to parse", () => {
  assert.ok(rules.length >= 10, `only ${rules.length} rules found — the parse broke`)
})

test("a body is never a prop", () => {
  for (const n of ["Unarmed Strike", "Claw", "Bite", "Hook", "Slam", "Gore", "Sting", "Tail", "Beak", "Talon", "Tentacle"]) {
    assert.equal(archetypeFor(n, "weapon"), "empty", `${n} became a prop`)
  }
})

test("a hook horror is not issued a sword", () => {
  // Its only action is "Hook". Before the list was widened this fell through
  // to the blade default at the bottom of the function.
  assert.equal(archetypeFor("Hook", "weapon"), "empty")
})

test("but Hooked Shortspear is still a spear", () => {
  assert.equal(archetypeFor("Hooked Shortspear", "weapon"), "spear")
})

test("short natural words do not swallow real weapons", () => {
  // "horn" inside "Thorn Whip", "gore" one letter from "Claymore".
  assert.notEqual(archetypeFor("Thorn Whip", "weapon"), "empty")
  assert.notEqual(archetypeFor("Claymore", "weapon"), "empty")
})

test("the drow's two weapons read as two different props", () => {
  // This is the whole point of the swap: the hand must be able to tell them
  // apart, or there is nothing to change into.
  assert.equal(archetypeFor("Hand Crossbow", "weapon"), "crossbow")
  assert.equal(archetypeFor("Shortsword", "weapon"), "blade")
  assert.notEqual(archetypeFor("Hand Crossbow", "weapon"), archetypeFor("Shortsword", "weapon"))
})

test("the rest of the Act-1 armoury lands where it should", () => {
  assert.equal(archetypeFor("Greataxe", "weapon"), "axe")
  assert.equal(archetypeFor("Scourge", "weapon"), "mace")
  assert.equal(archetypeFor("Longbow", "weapon"), "bow")
  assert.equal(archetypeFor("Dagger", "weapon"), "dagger")
  assert.equal(archetypeFor("Quarterstaff", "weapon"), "staff")
  assert.equal(archetypeFor("Javelin", "weapon"), "spear")
  assert.equal(archetypeFor("Shield", "armor"), "shield")
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
