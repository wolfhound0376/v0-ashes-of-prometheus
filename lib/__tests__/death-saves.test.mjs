// SRD 5.1 "Dropping to 0 Hit Points", one assertion per sentence.
//
// Run:  node --test lib/__tests__/death-saves.test.mjs
// Bundles lib/death-saves.ts with esbuild first, the way the other tests here
// do, then imports the bundle through a file URL (Windows rejects a bare
// absolute path as an ESM specifier).
import { test } from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, "..", "death-saves.ts")
const out = join(mkdtempSync(join(tmpdir(), "death-saves-")), "death-saves.mjs")
const esbuild = process.env.ESBUILD ?? "npx esbuild"
execSync(`${esbuild} "${src}" --format=esm --platform=neutral --outfile="${out}"`, { stdio: "pipe" })
writeFileSync(out, (await import("node:fs")).readFileSync(out, "utf8"))
const ds = await import(pathToFileURL(out).href)

const fresh = { successes: 0, failures: 0 }

test("a hit that leaves hit points is just a hit", () => {
  const r = ds.takeDamage({ label: "Kenta", hp: 8, max: 8, amount: 3, saves: fresh, vitality: "up" })
  assert.equal(r.hp, 5)
  assert.equal(r.vitality, "up")
  assert.equal(r.note, null)
})

test("reduced to 0 with less than max remaining: unconscious and dying, saves reset", () => {
  // Kenta at 7 of 8 takes 14: 7 remaining, less than 8. Unconscious, not dead.
  const r = ds.takeDamage({ label: "Kenta", hp: 7, max: 8, amount: 14, saves: { successes: 2, failures: 1 }, vitality: "up" })
  assert.equal(r.hp, 0)
  assert.equal(r.vitality, "dying")
  assert.deepEqual(r.saves, fresh)
  assert.match(r.note, /goes down/)
})

test("massive damage: remaining damage equal to max kills outright", () => {
  const r = ds.takeDamage({ label: "Kenta", hp: 7, max: 8, amount: 15, saves: fresh, vitality: "up" })
  assert.equal(r.vitality, "dead")
  assert.match(r.note, /killed outright/)
})

test("damage at 0 costs one failure, a critical costs two", () => {
  const one = ds.takeDamage({ label: "Kenta", hp: 0, max: 8, amount: 4, saves: fresh, vitality: "dying" })
  assert.deepEqual(one.saves, { successes: 0, failures: 1 })
  assert.equal(one.vitality, "dying")
  const two = ds.takeDamage({ label: "Kenta", hp: 0, max: 8, amount: 4, crit: true, saves: fresh, vitality: "dying" })
  assert.deepEqual(two.saves, { successes: 0, failures: 2 })
})

test("a third failure from damage is death", () => {
  const r = ds.takeDamage({ label: "Kenta", hp: 0, max: 8, amount: 1, saves: { successes: 0, failures: 2 }, vitality: "dying" })
  assert.equal(r.vitality, "dead")
  assert.match(r.note, /dies/)
})

test("a stable character who takes damage is dying again", () => {
  const r = ds.takeDamage({ label: "Kenta", hp: 0, max: 8, amount: 1, saves: { successes: 3, failures: 0 }, vitality: "stable" })
  assert.equal(r.vitality, "dying")
  assert.match(r.note, /no longer stable/)
})

test("the dead take no more damage and no more saves", () => {
  const r = ds.takeDamage({ label: "Kenta", hp: 0, max: 8, amount: 9, saves: { successes: 0, failures: 3 }, vitality: "dead" })
  assert.equal(r.vitality, "dead")
  assert.equal(r.note, null)
})

test("death save: 10 or higher succeeds, below fails", () => {
  assert.deepEqual(ds.rollDeathSave({ label: "K", roll: 10, saves: fresh }).saves, { successes: 1, failures: 0 })
  assert.deepEqual(ds.rollDeathSave({ label: "K", roll: 9, saves: fresh }).saves, { successes: 0, failures: 1 })
})

test("death save: a 1 is two failures, a 20 is 1 hit point and up", () => {
  const one = ds.rollDeathSave({ label: "K", roll: 1, saves: fresh })
  assert.deepEqual(one.saves, { successes: 0, failures: 2 })
  assert.equal(one.vitality, "dying")
  const twenty = ds.rollDeathSave({ label: "K", roll: 20, saves: { successes: 1, failures: 2 } })
  assert.equal(twenty.hp, 1)
  assert.equal(twenty.vitality, "up")
  assert.deepEqual(twenty.saves, fresh)
})

test("three successes: stable and still unconscious; three failures: dead", () => {
  const stable = ds.rollDeathSave({ label: "K", roll: 15, saves: { successes: 2, failures: 1 } })
  assert.equal(stable.vitality, "stable")
  assert.equal(stable.hp, 0)
  const dead = ds.rollDeathSave({ label: "K", roll: 1, saves: { successes: 2, failures: 1 } })
  assert.equal(dead.vitality, "dead")
})

test("healing from 0 wakes you and resets the saves; healing the dead does nothing", () => {
  const up = ds.heal({ hp: 0, max: 8, amount: 3, vitality: "dying", saves: { successes: 1, failures: 2 } })
  assert.equal(up.hp, 3)
  assert.equal(up.vitality, "up")
  assert.deepEqual(up.saves, fresh)
  const dead = ds.heal({ hp: 0, max: 8, amount: 3, vitality: "dead", saves: fresh })
  assert.equal(dead.hp, 0)
  assert.equal(dead.vitality, "dead")
})

test("conditions carry exactly the SRD word for the state, and nothing else changes", () => {
  assert.deepEqual(ds.conditionsFor(["Poisoned"], "dying"), ["Poisoned", "Unconscious"])
  assert.deepEqual(ds.conditionsFor(["Poisoned", "Unconscious"], "stable"), ["Poisoned", "Unconscious", "Stable"])
  assert.deepEqual(ds.conditionsFor(["unconscious", "Stable", "Blessed"], "up"), ["Blessed"])
  assert.deepEqual(ds.conditionsFor(["Unconscious"], "dead"), ["Dead"])
})

test("vitality is read back from hit points and the words", () => {
  assert.equal(ds.vitalityOf(5, []), "up")
  assert.equal(ds.vitalityOf(0, []), "dying")
  assert.equal(ds.vitalityOf(0, ["Stable"]), "stable")
  assert.equal(ds.vitalityOf(0, ["Dead"]), "dead")
  assert.equal(ds.vitalityOf(null, []), "up")
})

test("normaliseSaves tolerates garbage and clamps to 0..3", () => {
  assert.deepEqual(ds.normaliseSaves(null), fresh)
  assert.deepEqual(ds.normaliseSaves({ successes: "2", failures: 9 }), { successes: 2, failures: 3 })
})
