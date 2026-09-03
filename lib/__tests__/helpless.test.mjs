// Conditions and the attack roll against them, SRD Appendix PH-A.
//
// Run:  node --test lib/__tests__/helpless.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, "..", "helpless.ts")
const out = join(mkdtempSync(join(tmpdir(), "helpless-")), "helpless.mjs")
const esbuild = process.env.ESBUILD ?? "npx esbuild"
execSync(`${esbuild} "${src}" --format=esm --platform=neutral --outfile="${out}"`, { stdio: "pipe" })
const h = await import(pathToFileURL(out).href)

test("nothing on the target: a plain roll", () => {
  const c = h.attackAgainst(["Poisoned", "Blessed"], 5)
  assert.deepEqual([c.advantage, c.disadvantage, c.autoCrit, c.note], [false, false, false, null])
})

test("unconscious: advantage, and a critical from within 5 ft", () => {
  const near = h.attackAgainst(["Unconscious"], 5)
  assert.equal(near.advantage, true)
  assert.equal(near.autoCrit, true)
  assert.match(near.note, /advantage — unconscious; critical/)
  const far = h.attackAgainst(["unconscious"], 30)
  assert.equal(far.advantage, true)
  assert.equal(far.autoCrit, false)
})

test("paralyzed is the same as unconscious; stunned, restrained, petrified, blinded give advantage only", () => {
  assert.equal(h.attackAgainst(["Paralyzed"], 5).autoCrit, true)
  for (const c of ["Stunned", "Restrained", "Petrified", "Blinded"]) {
    const r = h.attackAgainst([c], 5)
    assert.equal(r.advantage, true, c)
    assert.equal(r.autoCrit, false, c)
  }
})

test("prone: advantage up close, disadvantage from range", () => {
  assert.equal(h.attackAgainst(["Prone"], 5).advantage, true)
  const far = h.attackAgainst(["Prone"], 20)
  assert.equal(far.advantage, false)
  assert.equal(far.disadvantage, true)
})

test("invisible: disadvantage; with an advantage source they cancel", () => {
  assert.equal(h.attackAgainst(["Invisible"], 5).disadvantage, true)
  const both = h.attackAgainst(["Invisible", "Stunned"], 5)
  assert.equal(both.advantage, false)
  assert.equal(both.disadvantage, false)
  assert.match(both.note, /cancel/)
})

test("rollD20 throws two dice under advantage and keeps the higher; the lower under disadvantage", () => {
  const seq = (...v) => { let i = 0; return () => v[i++] }
  assert.deepEqual(h.rollD20({ advantage: true, disadvantage: false }, seq(4, 17)), { roll: 17, dice: [4, 17] })
  assert.deepEqual(h.rollD20({ advantage: false, disadvantage: true }, seq(4, 17)), { roll: 4, dice: [4, 17] })
  assert.deepEqual(h.rollD20({ advantage: false, disadvantage: false }, seq(9)), { roll: 9, dice: [9] })
  assert.equal(h.showDice({ roll: 17, dice: [4, 17] }), "17 (4, 17)")
  assert.equal(h.showDice({ roll: 9, dice: [9] }), "9")
})
