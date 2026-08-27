// Clip resolution against the REAL clip lists from Sam's two models.
// Run: node lib/__tests__/token-animation.test.mjs
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const out = mkdtempSync(join(tmpdir(), "anim-"))
const bundle = join(out, "a.mjs")
execFileSync(process.env.ESBUILD || "esbuild",
  ["lib/token-animation.ts", "--bundle", "--format=esm", "--platform=neutral", "--outfile=" + bundle],
  { stdio: "inherit" })
const { clipFor } = await import(bundle)

// Exactly what inspect_glb.py reported for the published models.
const HERO = ["Alert","Archery_Shot_3","Arise","Attack","Backflip_and_Hooks","Boxing_Guard_Step_Knee_Strike","Cautious_Crouch_Walk_Forward_inplace","Charged_Ground_Slam","Charged_Slash","Charged_Spell_Cast_1","Collect_Object","Combat_Stance","Counterstrike","Dead","Double_Blade_Spin","Draw_and_Shoot_from_Back_1","Fall1","High_Kick","Running","Walking"]
const FOE  = ["Archery_Shot_1","Axe_Stance","Back_Jump","Backflip_and_Rise","Charged_Spell_Cast","Running","Walking","mage_soell_cast_3","mage_soell_cast_4"]
const WRAPPED = ["Armature|Combat_Stance|baselayer"]

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\ntoken animation clips")

test("the hero resolves every combat state to a real clip", () => {
  assert.equal(clipFor("idle", HERO), "Combat_Stance")
  assert.equal(clipFor("walk", HERO), "Walking")
  assert.equal(clipFor("attack", HERO), "Attack")
  assert.equal(clipFor("dead", HERO), "Dead")
  assert.equal(clipFor("hurt", HERO), "Fall1")
})

test("the foe has no Combat_Stance and falls back to its Axe_Stance", () => {
  assert.equal(clipFor("idle", FOE), "Axe_Stance")
})

test("the foe has no Attack clip, so attack falls through to a slash-alike", () => {
  const got = clipFor("attack", FOE)
  assert.ok(FOE.includes(got), "returned a clip that does not exist: " + got)
})

test("the misspelled 'mage_soell_cast' still resolves for casting", () => {
  const got = clipFor("cast", FOE)
  assert.ok(/soell_cast|Charged_Spell_Cast/.test(got), "cast did not resolve, got " + got)
})

test("Meshy's Armature|Clip|baselayer wrapper still matches", () => {
  assert.equal(clipFor("idle", WRAPPED), "Armature|Combat_Stance|baselayer")
})

test("a model with nothing useful still returns something, never null", () => {
  assert.equal(clipFor("attack", ["SomeRandomClip"]), "SomeRandomClip")
})

test("an empty model returns null rather than crashing the board", () => {
  assert.equal(clipFor("idle", []), null)
})

console.log(failures ? "\n" + failures + " broken\n" : "\nall clip expectations hold\n")
process.exit(failures ? 1 : 0)
