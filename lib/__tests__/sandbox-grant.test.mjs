// A lent spell is on the sheet while it is lent, and the sheet is what it was
// once it is returned. Run: ESBUILD=<path> node lib/__tests__/sandbox-grant.test.mjs
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

// Bundle the real module rather than mirroring it: the ledger rules are the
// thing under test, and a mirror of them would be a second copy to drift.
const out = mkdtempSync(join(tmpdir(), "grant-"))
const bundle = join(out, "a.mjs")
execFileSync(process.env.ESBUILD || "esbuild",
  ["lib/sandbox-grant.ts", "--bundle", "--format=esm", "--platform=neutral", "--outfile=" + bundle],
  { stdio: "pipe" })
const { grantSpell, revokeSpell, revokeAll, loanedSpells, LOAN_SLOTS } = await import(pathToFileURL(bundle).href)

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

// Levels as the spellbook has them; the route reads spellEntry(n).level.
const LEVEL = { "fire bolt": 0, fireball: 3, "lightning bolt": 3, "magic missile": 1, "misty step": 2 }
const levelOf = (n) => LEVEL[n.toLowerCase()] ?? 0

// Kenta-shaped: a level-3 sorcerer with first- and second-level slots.
const kenta = () => ({
  slots: { "1": { max: 4, used: 1 }, "2": { max: 2, used: 0 } },
  cantrips: ["Ray of Frost"],
  prepared: ["Fog Cloud", "Magic Missile"],
})

console.log("\nsandbox grant")

test("a cantrip lands in cantrips and opens no slots", () => {
  const r = grantSpell(kenta(), "fire bolt", 0)
  assert.equal(r.changed, true)
  assert.deepEqual(r.sheet.cantrips, ["Ray of Frost", "fire bolt"])
  assert.deepEqual(r.sheet.slots, kenta().slots)
  assert.deepEqual(loanedSpells(r.sheet), ["fire bolt"])
  assert.deepEqual(r.sheet.sandbox.slots, {})
})

test("a spell above the sheet's slots opens the level and records that it did", () => {
  const r = grantSpell(kenta(), "fireball", 3)
  assert.equal(r.changed, true)
  assert.deepEqual(r.sheet.prepared, ["Fog Cloud", "Magic Missile", "fireball"])
  assert.deepEqual(r.sheet.slots["3"], { max: LOAN_SLOTS, used: 0 })
  assert.deepEqual(r.sheet.sandbox.slots, { "3": 0 })
})

test("a spell at a level the sheet already has leaves the slots alone", () => {
  const r = grantSpell(kenta(), "misty step", 2)
  assert.equal(r.changed, true)
  assert.deepEqual(r.sheet.slots["2"], { max: 2, used: 0 })
  assert.deepEqual(r.sheet.sandbox.slots, {})
})

test("lending what they already hold changes nothing and says so", () => {
  const r = grantSpell(kenta(), "Magic Missile", 1)
  assert.equal(r.changed, false)
  assert.match(r.reason, /already/)
  const twice = grantSpell(grantSpell(kenta(), "fireball", 3).sheet, "Fireball", 3)
  assert.equal(twice.changed, false)
  assert.deepEqual(loanedSpells(twice.sheet), ["fireball"])
})

test("the input sheet is never mutated", () => {
  const before = kenta()
  const frozen = JSON.stringify(before)
  grantSpell(before, "fireball", 3)
  revokeSpell(grantSpell(before, "fireball", 3).sheet, "fireball", levelOf)
  assert.equal(JSON.stringify(before), frozen)
})

test("returning the only loan at a level closes the level and clears the ledger", () => {
  const lent = grantSpell(kenta(), "fireball", 3).sheet
  const r = revokeSpell(lent, "fireball", levelOf)
  assert.equal(r.changed, true)
  assert.deepEqual(r.sheet.prepared, ["Fog Cloud", "Magic Missile"])
  assert.equal("3" in r.sheet.slots, false)
  assert.equal("sandbox" in r.sheet, false)
  assert.deepEqual(r.sheet.slots, kenta().slots)
})

test("two loans at one level keep it open until the second goes back", () => {
  let sc = grantSpell(kenta(), "fireball", 3).sheet
  sc = grantSpell(sc, "lightning bolt", 3).sheet
  assert.deepEqual(sc.sandbox.slots, { "3": 0 }, "the second loan must not overwrite the recorded old max")
  const one = revokeSpell(sc, "fireball", levelOf).sheet
  assert.deepEqual(one.slots["3"], { max: LOAN_SLOTS, used: 0 })
  assert.deepEqual(loanedSpells(one), ["lightning bolt"])
  const none = revokeSpell(one, "lightning bolt", levelOf).sheet
  assert.equal("3" in none.slots, false)
  assert.equal("sandbox" in none, false)
})

test("a level that existed with max 0 comes back without a positive max", () => {
  const sc = { ...kenta(), slots: { ...kenta().slots, "3": { max: 0, used: 0 } } }
  const lent = grantSpell(sc, "fireball", 3).sheet
  assert.deepEqual(lent.sandbox.slots, { "3": 0 })
  const back = revokeSpell(lent, "fireball", levelOf).sheet
  assert.ok(!back.slots["3"] || !(back.slots["3"].max > 0))
})

test("their own spell cannot be taken back", () => {
  const r = revokeSpell(kenta(), "Magic Missile", levelOf)
  assert.equal(r.changed, false)
  assert.match(r.reason, /theirs/)
  const missing = revokeSpell(kenta(), "fireball", levelOf)
  assert.equal(missing.changed, false)
})

test("a cast made with the loan does not stop it going back", () => {
  const lent = grantSpell(kenta(), "fireball", 3).sheet
  const spent = { ...lent, slots: { ...lent.slots, "3": { max: LOAN_SLOTS, used: 1 } } }
  const r = revokeSpell(spent, "fireball", levelOf)
  assert.equal("3" in r.sheet.slots, false)
})

test("return all gives everything back at once", () => {
  let sc = grantSpell(kenta(), "fire bolt", 0).sheet
  sc = grantSpell(sc, "fireball", 3).sheet
  sc = grantSpell(sc, "misty step", 2).sheet
  const r = revokeAll(sc, levelOf)
  assert.equal(r.changed, true)
  assert.deepEqual(r.sheet.cantrips, ["Ray of Frost"])
  assert.deepEqual(r.sheet.prepared, ["Fog Cloud", "Magic Missile"])
  assert.deepEqual(r.sheet.slots, kenta().slots)
  assert.equal("sandbox" in r.sheet, false)
  assert.equal(revokeAll(r.sheet, levelOf).changed, false)
})

test("a sheet that never had spellcasting can still be lent to", () => {
  const r = grantSpell(null, "fireball", 3)
  assert.deepEqual(r.sheet.prepared, ["fireball"])
  assert.deepEqual(r.sheet.slots, { "3": { max: LOAN_SLOTS, used: 0 } })
  const back = revokeSpell(r.sheet, "fireball", levelOf).sheet
  assert.deepEqual(back.prepared, [])
  assert.deepEqual(back.slots, {})
})

console.log(failures ? `\n${failures} failing` : "\nall passing")
process.exit(failures ? 1 : 0)
