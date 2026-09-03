// The pack speaks for ten spells and stays quiet about the rest.
// Run: node lib/__tests__/spell-sfx-pack.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// Read the generated module rather than re-declaring 73 slugs here: the point
// of generating it is that there is one copy, and a test with a second copy
// would pass while the real index rotted.
const src = readFileSync(new URL("../spell-sfx-pack.ts", import.meta.url), "utf8")
const INDEX = {}
for (const m of src.matchAll(/^  "([a-z0-9-]+)": "([a-z0-9-]+)",$/gm)) {
  if (m[1] !== m[2]) INDEX[m[1]] = m[2]     // skip the SOUNDS table's self-keys
}
const SOUNDS = new Set([...src.matchAll(/id: "([a-z0-9-]+)"/g)].map((m) => m[1]))
const slugify = (n) => n.trim().toLowerCase().replace(/['']/g, "").replace(/\s+/g, "-")
const packSoundFor = (n) => (n && INDEX[slugify(n)]) || null

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        "+String(e.message).split("\n")[0]) } }

console.log("\nspell sfx pack")

test("every indexed spell points at a sound that exists", () => {
  // A slug pointing at a missing id would fail SILENTLY - the player ignores
  // what it cannot fetch - so the spell would just lose its sound and nobody
  // would know which one.
  for (const [slug, id] of Object.entries(INDEX)) {
    assert.ok(SOUNDS.has(id), `${slug} -> ${id} is not a sound in the pack`)
  }
})

test("ten sounds, as shipped", () => {
  assert.equal(SOUNDS.size, 10)
})

test("Sleep has its own cue, not the arcane sparkle", () => {
  // It was in no index at all, so it fell through to the school release —
  // the same bright sound every wizard cantrip makes. Sam: "sleep should
  // have a sleep time sound ... not an electrical one."
  assert.equal(packSoundFor("Sleep"), "control-slumber-fall")
})

test("the spells the party actually casts resolve", () => {
  assert.equal(packSoundFor("Eldritch Blast"), "cast-wind-gust")
  assert.equal(packSoundFor("Misty Step"), "teleport-psychic-charge")
  assert.equal(packSoundFor("Magic Missile"), "cast-wind-gust")
  assert.equal(packSoundFor("Mage Hand"), "cantrip-soft-sparkle")
  assert.equal(packSoundFor("Thunderwave"), "cast-wind-gust")
})

test("spell names are matched however the sheet cases them", () => {
  assert.equal(packSoundFor("MISTY STEP"), "teleport-psychic-charge")
  assert.equal(packSoundFor("  misty step  "), "teleport-psychic-charge")
})

test("an uncovered spell returns null, NOT the pack's fallback", () => {
  // 34 of the book's 44 spells are not in the pack. Returning a fallback here
  // would silently replace every school sound in the game with one of nine -
  // the opposite of what a specificity layer is for. The pack declares its
  // own fallbackSound; this app deliberately ignores it, because this app has
  // another sound bank and the standalone player it was written for does not.
  for (const n of ["Fireball", "Cure Wounds", "Guiding Bolt", "Sacred Flame", "Fire Bolt"]) {
    assert.equal(packSoundFor(n), null, n)
  }
})

test("no spell name at all is null rather than a throw", () => {
  assert.equal(packSoundFor(null), null)
  assert.equal(packSoundFor(undefined), null)
  assert.equal(packSoundFor(""), null)
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
