// Stabilizing a creature: DC 10 Wisdom (Medicine).
//
// Run:  node --test lib/__tests__/stabilize.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, "..", "stabilize.ts")
const out = join(mkdtempSync(join(tmpdir(), "stabilize-")), "stabilize.mjs")
const esbuild = process.env.ESBUILD ?? "npx esbuild"
execSync(`${esbuild} "${src}" --format=esm --platform=neutral --outfile="${out}"`, { stdio: "pipe" })
const s = await import(pathToFileURL(out).href)

test("Medicine is read off the sheet whatever its case", () => {
  assert.equal(s.medicineProficiency({ Medicine: "proficient", Insight: "proficient" }), "proficient")
  assert.equal(s.medicineProficiency({ medicine: "expertise" }), "expertise")
  assert.equal(s.medicineProficiency({ stealth: "expertise" }), "none")
  assert.equal(s.medicineProficiency(null), "none")
})

test("the bonus is WIS plus proficiency once, or twice for expertise", () => {
  // Samson: WIS +3, proficiency +2, Medicine proficient -> +5.
  assert.equal(s.medicineBonus({ wisMod: 3, proficiencyBonus: 2, proficiency: "proficient" }), 5)
  assert.equal(s.medicineBonus({ wisMod: 3, proficiencyBonus: 2, proficiency: "expertise" }), 7)
  assert.equal(s.medicineBonus({ wisMod: -1, proficiencyBonus: 2, proficiency: "none" }), -1)
  assert.equal(s.medicineBonus({ wisMod: null, proficiencyBonus: null, proficiency: "none" }), 0)
})

test("DC 10: total of 10 stabilizes, 9 does not", () => {
  assert.deepEqual(s.stabilizeCheck({ roll: 5, bonus: 5 }), { total: 10, success: true })
  assert.deepEqual(s.stabilizeCheck({ roll: 4, bonus: 5 }), { total: 9, success: false })
  assert.equal(s.STABILIZE_DC, 10)
})

test("it is aimed as a helpful touch within 5 ft, and costs no slot", () => {
  assert.equal(s.STABILIZE_ENTRY.rangeFt, 5)
  assert.equal(s.STABILIZE_ENTRY.helpful, true)
  assert.equal(s.STABILIZE_ENTRY.target, "creature")
  assert.equal(s.STABILIZE_ENTRY.level, 0)
})
