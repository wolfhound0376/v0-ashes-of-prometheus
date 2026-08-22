// The journal tag: parsed into a page, and never printed at the table.
// Run: node lib/__tests__/journal-tag.test.mjs
import assert from "node:assert/strict"

// The two regexes exactly as app/api/chat/route.ts uses them.
const JOURNAL_MATCH = /\[JOURNAL:\s*([^\]]*)\]/gi
const strip = (text) =>
  text
    .replace(/\[NPC_SPEECH:\s*[^\]]+\]/gi, "")
    .replace(/\[\/NPC_SPEECH\]/gi, "")
    .replace(/\[ITEM_AWARD:[^\]]+\]/gi, "")
    .replace(/\[DAMAGE:[^\]]+\]/gi, "")
    .replace(/\[CINEMATIC:[^\]]*\]/gi, "")
    .replace(/\[JOURNAL:[^\]]*\]/gi, "")
    .replace(/\[[A-Z][A-Z_]*:[^\]]*\]/g, "")
    .trim()

const page = (text) => {
  const tags = text.match(JOURNAL_MATCH) || []
  if (!tags.length) return null
  return tags[0].replace(/^\[JOURNAL:\s*/i, "").replace(/\]$/, "").trim()
}

let failures = 0
const test = (name, fn) => {
  try { fn(); console.log("  PASS ", name) }
  catch (e) { failures++; console.log("  FAIL ", name); console.log("        " + String(e.message).split("\n")[0]) }
}

console.log("\njournal tag")

test("a page is lifted out of the narration", () => {
  const raw = 'You scratch it down by the guttering light.\n[JOURNAL: Three guards. Shift changes on the fourth hour. Eldeth counts them too.]'
  assert.equal(page(raw), "Three guards. Shift changes on the fourth hour. Eldeth counts them too.")
})

test("the tag never reaches the player", () => {
  const raw = 'You write.\n[JOURNAL: Three guards.]\nMalachar watches, amused.'
  const shown = strip(raw)
  assert.ok(!shown.includes("JOURNAL"), "tag leaked: " + shown)
  assert.ok(shown.includes("Malachar watches"), "narration was damaged: " + shown)
})

test("a tag nobody remembered to list is still swept up", () => {
  // The whole point of the backstop.
  const shown = strip("She nods.\n[SOME_FUTURE_TAG: value | other]\nAnd waits.")
  assert.ok(!shown.includes("SOME_FUTURE_TAG"), "backstop missed it: " + shown)
})

test("the backstop does not eat dice or the roll banner", () => {
  const rolls = strip("Roll [[1d20+5]] — Insight.")
  assert.ok(rolls.includes("[[1d20+5]]"), "dice were eaten: " + rolls)
  const banner = strip("[Dice Roll] Samson rolled — Roll: 18")
  assert.ok(banner.includes("[Dice Roll]"), "roll banner was eaten: " + banner)
})

test("no journal tag means no page, not an empty one", () => {
  assert.equal(page("She says nothing. You say nothing back."), null)
})

test("an empty tag writes nothing", () => {
  assert.equal(page("[JOURNAL:   ]"), "")
})

test("two pages in one turn: the first is the one he meant", () => {
  assert.equal(page("[JOURNAL: first]\n[JOURNAL: second]"), "first")
})

test("a page may carry punctuation and quotes", () => {
  const raw = "[JOURNAL: She said \"three\". I believe her — that is the worrying part.]"
  assert.equal(page(raw), 'She said "three". I believe her — that is the worrying part.')
})

console.log(failures ? "\n" + failures + " expectation(s) broken\n" : "\nall journal expectations hold\n")
process.exit(failures ? 1 : 0)
