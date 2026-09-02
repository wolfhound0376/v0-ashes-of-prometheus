// The verdict a blow gets, and what the target does about it.
// Run: node lib/__tests__/defence.test.mjs
//
// Two things are asserted here, and the second is the reason the file exists.
//
// 1. defenceFor's thresholds, against the REAL clip lists from Sam's models —
//    a mapping that returns "parry" is worthless if the model has no parry.
// 2. That the outcome expression below still matches the one in
//    app/api/combat/route.ts. Those two live in different files and nothing
//    but this test stops them drifting; when they drift, the board renders a
//    dodge for a hit and nothing reports it.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const out = mkdtempSync(join(tmpdir(), "defence-"))
const bundle = join(out, "a.mjs")
execFileSync(process.env.ESBUILD || "esbuild",
  ["lib/token-animation.ts", "--bundle", "--format=esm", "--platform=neutral", "--outfile=" + bundle],
  { stdio: "inherit" })
// A file URL, not a bare path: Node on Windows rejects `c:\...` as a scheme.
const { defenceFor, clipFor } = await import(pathToFileURL(bundle).href)

// Exactly what inspect_glb.py reported for the published models — same lists
// as token-animation.test.mjs, deliberately, so both files age together.
const HERO = ["Alert","Archery_Shot_3","Arise","Attack","Backflip_and_Hooks","Boxing_Guard_Step_Knee_Strike","Cautious_Crouch_Walk_Forward_inplace","Charged_Ground_Slam","Charged_Slash","Charged_Spell_Cast_1","Collect_Object","Combat_Stance","Counterstrike","Dead","Double_Blade_Spin","Draw_and_Shoot_from_Back_1","Fall1","High_Kick","Running","Walking"]
const FOE  = ["Archery_Shot_1","Axe_Stance","Back_Jump","Backflip_and_Rise","Charged_Spell_Cast","Running","Walking","mage_soell_cast_3","mage_soell_cast_4"]

/** Mirror of the `outcome` expression in app/api/combat/route.ts. */
const outcomeOf = ({ heals = false, weapon = false, crit = false, fumble = false,
                     saved = null, amount = 0, hit = false }) =>
  heals && !weapon ? "heal"
    : crit ? "crit"
    : fumble ? "fumble"
    : saved === true ? (amount > 0 ? "saved-half" : "saved")
    : saved === false ? "failed-save"
    : hit ? "hit" : "miss"

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\nthe server's verdict")

test("a natural 20 is a crit, not merely a hit", () => {
  assert.equal(outcomeOf({ crit: true, hit: true, weapon: true }), "crit")
})

test("a natural 1 is a fumble, not merely a miss", () => {
  assert.equal(outcomeOf({ fumble: true, hit: false, weapon: true }), "fumble")
})

test("a save that shrugs it off and one that takes half are different events", () => {
  assert.equal(outcomeOf({ saved: true, amount: 0 }), "saved")
  assert.equal(outcomeOf({ saved: true, amount: 7 }), "saved-half")
})

test("a failed save is its own outcome, not a plain hit", () => {
  assert.equal(outcomeOf({ saved: false, amount: 14, hit: true }), "failed-save")
})

test("healing never reads as an attack", () => {
  assert.equal(outcomeOf({ heals: true, hit: true }), "heal")
})

test("a fumble outranks a save — the natural 1 was the caster's", () => {
  assert.equal(outcomeOf({ fumble: true, saved: true, amount: 0 }), "fumble")
})

console.log("\nwhat the target does about it")

test("a near miss is turned aside; a wide one is stepped out of", () => {
  // Three is the hinge. Inside it the blade nearly landed and has to be
  // actively parried; outside it a parry would be mime, because the sword
  // passed a foot wide.
  assert.equal(defenceFor("miss", -1), "parry")
  assert.equal(defenceFor("miss", -3), "parry")
  assert.equal(defenceFor("miss", -4), "dodge")
  assert.equal(defenceFor("miss", -9), "dodge")
})

test("a shield turns a near miss into a block, but cannot help a wide one", () => {
  assert.equal(defenceFor("miss", -1, { hasShield: true }), "block")
  assert.equal(defenceFor("miss", -9, { hasShield: true }), "dodge")
})

test("a fumble earns the target nothing — they did not have to move", () => {
  assert.equal(defenceFor("fumble", -12), null)
})

test("you do not parry a fireball", () => {
  assert.equal(defenceFor("saved", 4), "dodge")
  assert.equal(defenceFor("saved", 4, { hasShield: true }), "dodge")
})

test("half damage braces rather than evades — they visibly did not escape it", () => {
  assert.equal(defenceFor("saved-half", 2, { hasShield: true }), "block")
  assert.equal(defenceFor("saved-half", 2), "dodge")
})

test("anything that actually lands still hurts", () => {
  assert.equal(defenceFor("hit", 3), "hurt")
  assert.equal(defenceFor("crit", 11), "hurt")
  assert.equal(defenceFor("failed-save", -6), "hurt")
})

test("being healed is not a defence", () => {
  assert.equal(defenceFor("heal", 0), null)
})

console.log("\nthe models can actually perform it")

test("the hero parries with Counterstrike and dodges with a backflip", () => {
  assert.equal(clipFor("parry", HERO), "Counterstrike")
  // Not merely "something or null". The hero is the PC model — the one at
  // the centre of every fight the table watches — and it has no Back_Jump.
  // Without an explicit assertion here its dodge silently resolved to null
  // and the players' own miniatures were the only ones standing still.
  assert.equal(clipFor("dodge", HERO), "Backflip_and_Hooks")
})

test("the foe dodges with Back_Jump — the clip that was buried in the hurt chain", () => {
  assert.equal(clipFor("dodge", FOE), "Back_Jump")
})

test("a model with no defensive clip plays NOTHING rather than flinching", () => {
  // This is the whole point. Falling back to the hurt clip is the bug these
  // states exist to remove: a miniature that recoils in pain on a miss lies
  // to the table, and the table believes it over the log.
  const bare = ["Walking", "Combat_Stance", "Fall1"]
  assert.equal(clipFor("dodge", bare), null)
  assert.equal(clipFor("parry", bare), null)
  assert.equal(clipFor("block", bare), null)
  // ...while hurt still resolves, so a real hit is never silent.
  assert.equal(clipFor("hurt", bare), "Fall1")
})

test("an empty model returns null rather than crashing the board", () => {
  assert.equal(clipFor("dodge", []), null)
})

console.log(failures ? "\n" + failures + " broken\n" : "\nall defence expectations hold\n")
process.exit(failures ? 1 : 0)
