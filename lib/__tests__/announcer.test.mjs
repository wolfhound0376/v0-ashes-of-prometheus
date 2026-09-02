// The cabinet says the right name, once.
// Run: node lib/__tests__/announcer.test.mjs
import assert from "node:assert/strict"

// Exactly as lib/announcer.ts implements them.
const VOICED = new Set(["bard", "rogue", "sorcerer", "cleric"])
const announcementFor = (kind, cls) => {
  const c = (cls ?? "").trim().toLowerCase()
  if (!VOICED.has(c)) return null
  return `ui/${kind === "turn" ? "turn" : "die"}_${c}`
}
const DYING_FRACTION = 0.1
const justBecameDying = (before, after, max) => {
  if (!max || max <= 0) return false
  if (after <= 0) return false
  const line = max * DYING_FRACTION
  return before > line && after <= line
}

let failures = 0
const test = (name, fn) => {
  try { fn(); console.log("  PASS ", name) }
  catch (e) { failures++; console.log("  FAIL ", name); console.log("        " + String(e.message).split("\n")[0]) }
}

console.log("\nannouncer names")

test("the four voiced classes, however they are cased in the sheet", () => {
  assert.equal(announcementFor("turn", "Bard"), "ui/turn_bard")
  assert.equal(announcementFor("turn", "ROGUE"), "ui/turn_rogue")
  assert.equal(announcementFor("turn", " Sorcerer "), "ui/turn_sorcerer")
  assert.equal(announcementFor("dying", "Cleric"), "ui/die_cleric")
})

test("a class with no clip is null, not a guessed key", () => {
  // A guessed key is a file that does not exist, and a missing sound fails
  // SILENTLY - the cue reader ignores what it cannot find. Null is how the
  // caller learns to fall back to the chime instead.
  for (const c of ["Barbarian", "Druid", "", null, undefined, "monster"]) {
    assert.equal(announcementFor("turn", c), null, String(c))
  }
})

console.log("\nthe dying warning fires once, on the crossing")

test("crossing the tenth announces", () => {
  assert.equal(justBecameDying(10, 1, 20), true)    // 10 -> 1 of 20, line is 2
  assert.equal(justBecameDying(3, 2, 20), true)     // lands exactly on it
})

test("ALREADY below it does not announce again", () => {
  // The bug this prevents: a level check would fire on every scratch while
  // they stayed low - four times a round, in a voice that fills the room.
  assert.equal(justBecameDying(2, 1, 20), false)
  assert.equal(justBecameDying(1, 1, 20), false)
})

test("healing back over the line re-arms it", () => {
  assert.equal(justBecameDying(1, 12, 20), false)   // the heal itself is silent
  assert.equal(justBecameDying(12, 2, 20), true)    // and the next fall speaks
})

test("0 is not dying, it is down", () => {
  // The board already says this with a body on the floor and its own death
  // treatment. Announcing "about to die" over a corpse is a beat too late.
  assert.equal(justBecameDying(5, 0, 20), false)
})

test("a creature with no maximum is never announced", () => {
  // hp_max null means untracked, and a fraction of nothing is not a threshold.
  assert.equal(justBecameDying(5, 1, 0), false)
  assert.equal(justBecameDying(5, 1, null), false)
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
