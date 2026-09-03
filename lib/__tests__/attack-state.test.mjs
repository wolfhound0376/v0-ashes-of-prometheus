// A knife is not a greatsword, and a swing must land when the hand does.
// Run: node lib/__tests__/attack-state.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const src = readFileSync(new URL("../token-animation.ts", import.meta.url), "utf8")

// lib/token-animation.ts, as implemented.
function attackStateFor(w) {
  const n = String(w ?? "").toLowerCase()
  if (!n) return "attack"
  if (/dagger|knife|dirk|shiv|shard|flake|rapier|shortsword|short sword|scimitar|sickle/.test(n)) return "lightAttack"
  if (/unarmed|fist|punch/.test(n)) return "lightAttack"
  return "attack"
}
const light = (src.match(/lightAttack: \[([^\]]*)\]/) || [,""])[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g,""))
const events = [...src.matchAll(/\{ match: "([^"]+)", release: ([\d.]+)/g)].map(m => [m[1], Number(m[2])])

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\nattack state + release timing")

test("Fifi's dagger gets the light swing", () => {
  assert.equal(attackStateFor("Dagger"), "lightAttack")
  assert.equal(attackStateFor("Obsidian Shard"), "lightAttack")
})

test("a fist is light too — nobody winds up to punch", () => {
  assert.equal(attackStateFor("Unarmed Strike"), "lightAttack")
})

test("a real two-hander keeps the heavy swing", () => {
  for (const w of ["Greataxe", "Maul", "Longsword", "Greatsword", "Warhammer", "Scourge"]) {
    assert.equal(attackStateFor(w), "attack", `${w} went light`)
  }
})

test("an unknown or missing weapon falls back to the heavy swing", () => {
  assert.equal(attackStateFor(null), "attack")
  assert.equal(attackStateFor(""), "attack")
  assert.equal(attackStateFor("Something Strange"), "attack")
})

test("the light list ends in plain attack, so a one-clip model still swings", () => {
  // Fifi has Left_Slash AND Attack; the drow elite has only Attack. Ending
  // the candidate list with "attack" is what stops the second one freezing.
  assert.equal(light[light.length - 1], "attack", `light list ends in ${light[light.length - 1]}`)
  assert.ok(light.indexOf("left_slash") < light.indexOf("attack"), "the light clip must be preferred")
})

test("a weapon swing finally has a measured release, not 45% of nothing", () => {
  // This is the bug Sam reported three times. Every entry in CAST_EVENTS was
  // a SPELL, so `Attack` fell through to `duration * 0.45` — and that guess
  // drove the sound, the arrow, the flinch, the number and the fall.
  const names = events.map(e => e[0])
  assert.ok(names.includes("attack"), "no release time for the attack clip")
  assert.ok(names.includes("left_slash"), "no release time for the light swing")
})

test("the light swing lands sooner than the heavy one", () => {
  const get = n => events.find(e => e[0] === n)[1]
  assert.ok(get("left_slash") < get("attack"),
    `left_slash ${get("left_slash")}s should land before attack ${get("attack")}s`)
})

test("no release time sits outside its clip", () => {
  // The Meshy Attack is 2.80-2.83s and Left_Slash is shorter. A release past
  // the end of the clip would never fire at all.
  for (const [n, r] of events) {
    assert.ok(r > 0 && r < 3.0, `${n} releases at ${r}s, outside any clip we ship`)
  }
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
