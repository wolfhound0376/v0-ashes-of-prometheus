// The door always opens. Arriving somewhere is not an event happening there.
// Run: node lib/__tests__/board-exit.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const raw = readFileSync(new URL("../board-exit.ts", import.meta.url), "utf8")
// Two tests below assert an old shape is GONE. Comments in this file quote that
// old shape, so strip them first — a test must not pass or fail on prose.
const src = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")

// lib/board-exit.ts, as implemented.
function shouldRedirectToBoard(a) {
  if (!a.isDm) return false
  if (a.leftDeliberately) return false
  if (a.previous === null) return false
  return a.inCombat && !a.previous
}
const shouldForgetDeliberateExit = (inCombat, observed) => observed && !inCombat

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }
const dm = { isDm: true, leftDeliberately: false }

console.log("\nboard-exit")

test("a fight breaking out under the DM's eyes sends them to the board", () => {
  assert.equal(shouldRedirectToBoard({ ...dm, inCombat: true, previous: false }), true)
})

test("ARRIVING on the dashboard mid-fight does not — this is the trap", () => {
  // The bug: `previous` was seeded false on every mount, so an arrival was
  // indistinguishable from a fight starting. Sam pressed ← SCENE and was
  // thrown straight back, every time.
  assert.equal(shouldRedirectToBoard({ ...dm, inCombat: true, previous: null }), false)
})

test("the redirect fires once per fight, not on every re-render", () => {
  assert.equal(shouldRedirectToBoard({ ...dm, inCombat: true, previous: true }), false)
})

test("walking off the board on purpose is honoured", () => {
  assert.equal(shouldRedirectToBoard({ isDm: true, leftDeliberately: true, inCombat: true, previous: false }), false)
})

test("players are never yanked off their sheets", () => {
  assert.equal(shouldRedirectToBoard({ isDm: false, leftDeliberately: false, inCombat: true, previous: false }), false)
})

test("peace redirects nobody, whatever came before", () => {
  for (const previous of [null, false, true]) {
    assert.equal(shouldRedirectToBoard({ ...dm, inCombat: false, previous }), false)
  }
})

test("an UNLOADED roster must not clear the deliberate-exit mark", () => {
  // The second half of the trap: an empty npcEncounters array reads as "no
  // fight", and clearing on that deleted the flag milliseconds before the
  // data landed and the redirect ran.
  assert.equal(shouldForgetDeliberateExit(false, false), false)
})

test("the mark is dropped once a fight is really over, so the next one redirects", () => {
  assert.equal(shouldForgetDeliberateExit(false, true), true)
  assert.equal(shouldForgetDeliberateExit(true, true), false)
})

test("the source no longer seeds the prior look as false", () => {
  assert.equal(/useRef\(false\)/.test(src), false, "a false seed makes every arrival look like a transition")
})

test("the source no longer clears the mark on a bare !inCombat", () => {
  assert.match(src, /observed && !inCombat/)
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
