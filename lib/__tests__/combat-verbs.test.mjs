// Every verb the route HANDLES must be a verb the route ACCEPTS.
// Run: node lib/__tests__/combat-verbs.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// THE BUG THIS EXISTS FOR — which happened TWICE, one PR apart.
//
// The Hide action shipped with a complete, tested handler that could never
// run: "hide" was in neither the DM-gate exemption nor the accepted-verb
// list, so every press died with a 403 at the top of the file. Nothing wrote,
// nothing narrated, and the handler's own careful refusal messages — written
// precisely so a failed hide would never be silent — were unreachable.
//
// While that fix was in flight, Mage Hand (#373) landed "summon" in the
// accepted list and not in the gate: the same bug, by a different author, in
// the same two lines. That is what moved the fix from "add the missing
// string" to "stop having two lists", and it is why this file asserts the
// SHAPE of the route rather than the presence of any one verb.
//
// Reading the source is the only way to catch it: the lists are string
// literals, and TypeScript is perfectly happy with a handler nobody can call.
const src = readFileSync(new URL("../../app/api/combat/route.ts", import.meta.url), "utf8")

const handled = [...src.matchAll(/action === "([a-z-]+)"/g)].map((m) => m[1])
const listLine = /const PLAYER_VERBS = \[([^\]]*)\]/.exec(src)
const dmListLine = /const DM_VERBS = \[([^\]]*)\]/.exec(src)
// The gate and the accepted-verb check must both be SPREADS of those consts,
// never fresh literals. This is the assertion that actually retires the bug:
// a literal here is a second list, and a second list is what drifted.
const gateIsDerived = /!PLAYER_VERBS\.includes\(action\) && !authorized\(req\)/.test(src)
const acceptIsDerived = /!\[\.\.\.DM_VERBS, \.\.\.PLAYER_VERBS\]\.includes\(action\)/.test(src)
const parse = (s) => [...s.matchAll(/"([a-z-]+)"/g)].map((m) => m[1])

const playerVerbs = parse(listLine[1])
const dmVerbs = parse(dmListLine[1])
const accepted = new Set([...playerVerbs, ...dmVerbs])

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        "+String(e.message).split("\n")[0]) } }

console.log("\ncombat verbs")

test("every handled action is an accepted action", () => {
  const orphans = [...new Set(handled)].filter((a) => !accepted.has(a))
  assert.deepEqual(orphans, [], `handler exists but the route rejects it: ${orphans.join(", ")}`)
})

// "end" is handled by FALL-THROUGH, not by a branch: everything after the
// `next` block runs only when the action is "end", because the verb list
// above has already excluded everything else. That is legitimate and it is
// also the fragile shape — the guard is the list, not an `if` — so it is
// named here rather than quietly skipped. A second fall-through verb should
// have to be added deliberately.
const FALL_THROUGH = ["end"]

test("every accepted action has a handler", () => {
  // The mirror image of the Hide bug: a verb in the list with nothing behind
  // it answers 200 and does nothing, which is worse than a 400.
  const empty = [...accepted].filter((a) => !handled.includes(a) && !FALL_THROUGH.includes(a))
  assert.deepEqual(empty, [], `accepted but unhandled: ${empty.join(", ")}`)
})

test("the fall-through verb really is last", () => {
  // If another branch were added BELOW the fall-through, "end" would stop
  // reaching its own code and fail silently - the same class of bug again.
  const lastBranch = src.lastIndexOf('action === "')
  const endComment = src.lastIndexOf("\n  // end")
  assert.ok(endComment > lastBranch, "a branch now sits below the end fall-through")
})

test("there is exactly ONE list of player verbs", () => {
  // The whole fix. Both checks read PLAYER_VERBS rather than restating it, so
  // a verb added to that array is accepted AND ungated in the same keystroke
  // and there is no second place left to forget.
  assert.ok(gateIsDerived, "the DM gate has a hand-written verb list again")
  assert.ok(acceptIsDerived, "the accepted-verb check has a hand-written list again")
})

test("no player verb is also a DM verb", () => {
  // Overlap would mean a verb whose gating depends on which check runs first.
  const both = playerVerbs.filter((v) => dmVerbs.includes(v))
  assert.deepEqual(both, [], `verb in both lists: ${both.join(", ")}`)
})

test("the two verbs this was reported for are reachable", () => {
  // hide: the report. summon: found in main while fixing it.
  for (const v of ["hide", "summon"]) {
    assert.ok(playerVerbs.includes(v), `${v} is not a player verb`)
    assert.ok(handled.includes(v), `${v} has no handler`)
  }
})

test("the 400 message is derived, not hand-written", () => {
  // The old message listed the verbs as a literal string and had already
  // drifted from the list it described. A message that lies about what the
  // endpoint accepts is how the next verb goes missing quietly.
  assert.ok(acceptIsDerived, "the accepted-verb check no longer spreads PLAYER_VERBS")
  assert.ok(/unknown action \$\{String\(action\)\}/.test(src), "message is not derived from the list")
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
