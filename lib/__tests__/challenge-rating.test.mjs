// A fraction is a threat too.
// Run: node lib/__tests__/challenge-rating.test.mjs
import assert from "node:assert/strict"

// parseChallengeRating exactly as lib/challenge-rating.ts implements it.
const parseChallengeRating = (cr) => {
  if (typeof cr === "number") return Number.isFinite(cr) ? cr : 0
  if (typeof cr !== "string") return 0
  const text = cr.trim()
  if (!text) return 0
  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(text)
  if (fraction) {
    const denominator = Number(fraction[2])
    return denominator === 0 ? 0 : Number(fraction[1]) / denominator
  }
  const value = Number(text)
  return Number.isFinite(value) ? value : 0
}
const isCombatant = (cr) => parseChallengeRating(cr) > 0

let failures = 0
const test = (name, fn) => {
  try { fn(); console.log("  PASS ", name) }
  catch (e) { failures++; console.log("  FAIL ", name); console.log("        " + String(e.message).split("\n")[0]) }
}

console.log("\nchallenge rating")

// The forms that actually exist in npc_encounters today.
test("whole numbers", () => {
  assert.equal(parseChallengeRating("0"), 0)
  assert.equal(parseChallengeRating("1"), 1)
  assert.equal(parseChallengeRating("8"), 8)
  assert.equal(parseChallengeRating("21"), 21)
})

test("decimals", () => {
  assert.equal(parseChallengeRating("0.5"), 0.5)
})

// The regression. seed_bestiary_act1.sql writes these verbatim, and the old
// test - (cr ?? 0) > 0 - saw NaN and called them harmless.
test("fractions are the whole CR 0-to-1 band", () => {
  assert.equal(parseChallengeRating("1/8"), 0.125)
  assert.equal(parseChallengeRating("1/4"), 0.25)
  assert.equal(parseChallengeRating("1/2"), 0.5)
  assert.equal(parseChallengeRating(" 1 / 4 "), 0.25)
})

test("a fractional-CR creature starts the music", () => {
  assert.equal(isCombatant("1/4"), true, "Asha Vandree must count as a fight")
  assert.equal(isCombatant("1/8"), true)
  assert.equal(isCombatant("0.5"), true)
  assert.equal(isCombatant("8"), true)
})

// CR 0 is the campaign's marker for ally / neutral / scenery. It must keep
// meaning "not a fight", or every friendly NPC starts combat music.
test("zero and nonsense stay peaceful", () => {
  assert.equal(isCombatant("0"), false, "Buppido is not a fight")
  assert.equal(isCombatant(0), false)
  assert.equal(isCombatant(null), false)
  assert.equal(isCombatant(undefined), false)
  assert.equal(isCombatant(""), false)
  assert.equal(isCombatant("  "), false)
  assert.equal(isCombatant("unknown"), false)
  assert.equal(isCombatant("1/0"), false, "no division by zero")
})

test("numbers pass through", () => {
  assert.equal(parseChallengeRating(3), 3)
  assert.equal(parseChallengeRating(NaN), 0)
  assert.equal(parseChallengeRating(Infinity), 0)
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
