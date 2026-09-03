// A reset that half-works in silence is worse than one that fails loudly.
// Run: node lib/__tests__/sandbox-reset.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// THE BUG THIS EXISTS FOR.
//
// The reset wrote `death_saves: null`. That column is NOT NULL in the schema,
// with a default of {successes: 0, failures: 0}, so Postgres rejected the
// WHOLE update - hit points, conditions, spell slots and temp HP all failed
// together on one bad field. The route then reported ok: true anyway, because
// the error went into `if (!error) sheets += 1` and nowhere else.
//
// Sam pressed Reset, watched every token heal, and found his characters still
// unconscious with their actions spent. The tokens said 01:58; the sheets
// still said 23:23, from two hours earlier.
//
// tsc cannot see any of this: the payload is a plain object literal and every
// field in it is a legal TypeScript value. So this reads the route.
const src = readFileSync(new URL("../../app/api/sandbox/route.ts", import.meta.url), "utf8")

const reset = /if \(action === "reset"\)[\s\S]*?\n  \}/.exec(src)
const body = reset ? reset[0] : ""

/**
 * The same source with comments removed.
 *
 * Assertions about what the code DOES must read this, never `body`. The first
 * version of the swallowing check matched the comment that quotes the old
 * line - a test failing on prose rather than on code, which is the second
 * time that has happened in this repo. Comments here deliberately quote the
 * bugs they prevent, so any "this pattern is gone" assertion has to look at
 * code alone.
 */
const code = body.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\nsandbox reset")

test("the reset handler is still findable", () => {
  assert.ok(body.length > 200, "the reset block could no longer be read - this whole file is now blind")
})

test("NOTHING IS EVER NULLED INTO death_saves", () => {
  // The exact bug. The column is NOT NULL; the fix is the zeroed object.
  assert.ok(!/death_saves:\s*null/.test(code), "death_saves is being set to null again - the column is NOT NULL")
})

test("the zeroed tally comes from the module that owns the shape", () => {
  // NO_SAVES already existed in lib/death-saves. Writing { successes: 0,
  // failures: 0 } by hand here would be a second definition of the same fact,
  // free to drift if a third die is ever added.
  assert.ok(/death_saves:\s*NO_SAVES/.test(body), "death_saves is no longer set from NO_SAVES")
  assert.ok(/import \{ NO_SAVES \} from "@\/lib\/death-saves"/.test(src), "NO_SAVES is no longer imported")
})

test("a refused write is REPORTED, never swallowed", () => {
  // `if (!error) sheets += 1` moved a counter nobody read while the response
  // still said ok: true. That silence is what cost a second rehearsal.
  assert.ok(/failures\.push\(/.test(body), "errors are no longer collected")
  assert.ok(!/if \(!error\) sheets \+= 1/.test(code), "the swallowing branch is back")
})

test("ok is FALSE when anything was refused", () => {
  // The caller has to be able to tell a reset that worked from one that only
  // looked like it did.
  assert.ok(/ok:\s*failures\.length === 0/.test(body), "the response reports ok: true regardless of failures")
})

test("the failures reach the caller, not just a counter", () => {
  assert.ok(/failures\.length \? \{ failures \}/.test(body), "the failure list is not sent back")
})

test("the action economy is cleared, not only the fight ended", () => {
  // Sam: "Reset doesn't reset actions or spells." A spent action is a field
  // on combat_state, not on the character sheet, so healing the sheet alone
  // leaves the tray reading ACTION USED on somebody at full health.
  assert.ok(/turn_state:\s*\{[^}]*action:\s*false/.test(body), "turn_state is no longer cleared")
  assert.ok(/moved_ft:\s*0/.test(body), "the movement budget is not given back")
})

test("spell slots come back", () => {
  // "Reset doesn't reset ... spells". Zeroing `used` rather than rebuilding
  // from `max`, because max is the character's own progression.
  assert.ok(/used:\s*0/.test(body), "spell slots are no longer refilled")
  assert.ok(!/max:\s*entry\.max\b/.test(code), "slots are being rebuilt from max rather than zeroing used")
})

test("hit points are restored on BOTH copies", () => {
  // vtt_tokens.hp_current is the board's authority in combat;
  // characters.hp_current is what every player-facing surface reads. Healing
  // one and not the other is what the screenshot showed.
  assert.ok(/from\("vtt_tokens"\)/.test(body), "tokens are no longer healed")
  assert.ok(/from\("characters"\)/.test(body), "character sheets are no longer healed")
  assert.ok(/hp_current:\s*t\.hp_max/.test(body), "the token is not restored to its own maximum")
  assert.ok(/hp_current:\s*c\.hp_max/.test(body), "the sheet is not restored to its own maximum")
})

test("hp_max is only ever written FROM THE BESTIARY", () => {
  // THE RULE CHANGED, and this test caught it changing — which is the point
  // of having written it.
  //
  // It used to be "hp_max is never written": the reset restores what the
  // fight spent, it does not decide how tough anything is. That was right,
  // and it meant a BAD SEED COULD NEVER CORRECT ITSELF. The Drow Elite
  // Warrior (CR 5, 71 hp) and the Priestess of Lolth (CR 8, 71 hp) were
  // hand-seeded onto the sandbox board at THIRTEEN — a plain drow's hit
  // points — and every reset faithfully restored them to thirteen.
  //
  // So the rule is narrowed, not dropped. hp_max may be written, but ONLY
  // from the catalogue: the bestiary decides how tough something is, and the
  // reset still does not.
  const writes = [...code.matchAll(/hp_max:\s*([^,\n}]+)/g)].map((m) => m[1].trim())
  for (const w of writes) {
    assert.ok(/species/.test(w),
      `hp_max is being written from "${w}" — it may only come from the bestiary`)
  }
  assert.ok(writes.length > 0, "hp_max is no longer repaired from the catalogue at all")
})

test("a token with no species keeps its own maximum", () => {
  // A player character has no bestiary row, and neither does Mage Hand. The
  // repair must skip them rather than nulling a maximum it cannot look up.
  assert.ok(/species != null && t\.hp_max !== species/.test(code),
    "the repair no longer checks that a species maximum exists before writing")
})

test("a null hp_max is skipped, not coerced", () => {
  // null is UNTRACKED, never dead. Writing a number into it invents a
  // creature's toughness - Shuushar on the sandbox board has exactly this.
  assert.ok(/hp_max == null\) continue/.test(body), "null hp_max is no longer skipped")
})

test("A RESET DISPELS WHAT IS STILL BEING CAST", () => {
  // Sam: "Reset, should also reset the mage hand." A summon is not a creature
  // to be healed - it is a spell still running, and it holds its caster's
  // concentration, so leaving it would quietly forbid the next one. Deleted
  // rather than restored, because that is what dismissing a spell IS.
  assert.ok(/\.not\("summon", "is", null\)/.test(code), "summons survive a reset again")
  assert.ok(/delete\(\{ count: "exact" \}\)[\s\S]{0,200}summon/.test(code),
    "the summon sweep no longer reports how many it dispelled")
})

test("the fence is still on every write", () => {
  // The reset must never be able to heal the live party mid-session.
  const writes = body.match(/\.update\(/g) ?? []
  assert.ok(writes.length >= 3, `expected at least three writes, found ${writes.length}`)
  assert.ok(/\.eq\("map_id", map\.id\)/.test(body), "the token write no longer filters on the sandbox map")
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
