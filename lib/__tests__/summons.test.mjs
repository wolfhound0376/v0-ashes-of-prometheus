// Mage Hand, against the SRD sentence by sentence.
//
// Run:  node --test lib/__tests__/summons.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, "..", "summons.ts")
const out = join(mkdtempSync(join(tmpdir(), "summons-")), "summons.mjs")
const esbuild = process.env.ESBUILD ?? "npx esbuild"
execSync(`${esbuild} "${src}" --format=esm --platform=neutral --outfile="${out}"`, { stdio: "pipe" })
const s = await import(pathToFileURL(out).href)

test("cast in round 3, the hand lasts a minute: gone when round 13 begins", () => {
  const h = s.summonMageHand({ casterToken: "t1", characterId: "c1", round: 3 })
  assert.equal(h.expires_round, 13)
  assert.equal(s.roundsLeft(h, 3), 10)
  assert.equal(s.roundsLeft(h, 12), 1)
  assert.equal(s.expired(h, 12), false)
  assert.equal(s.expired(h, 13), true)
})

test("appears within 30 ft of the caster, and no farther", () => {
  const caster = { x: 0, y: 0 }
  assert.equal(s.withinCastRange({ x: 6, y: 6 }, caster), true)   // 30 ft diagonal
  assert.equal(s.withinCastRange({ x: 7, y: 0 }, caster), false)  // 35 ft
})

test("vanishes beyond 30 ft of its caster", () => {
  assert.equal(s.withinLeash({ x: 6, y: 0 }, { x: 0, y: 0 }), true)
  assert.equal(s.withinLeash({ x: 7, y: 0 }, { x: 0, y: 0 }), false)
})

test("moves up to 30 ft per use of the action", () => {
  assert.equal(s.canReach({ x: 2, y: 2 }, { x: 8, y: 8 }), true)
  assert.equal(s.canReach({ x: 2, y: 2 }, { x: 9, y: 2 }), false)
})

test("the four SRD uses, and nothing else", () => {
  assert.deepEqual(s.HAND_USES.map((u) => u.key), ["manipulate", "open", "stow", "pour"])
  assert.match(s.handUse("open").line("Kenta"), /unlocked door/)
  assert.equal(s.handUse("attack"), null)
})

test("normaliseSummon accepts the stored shape and rejects junk", () => {
  const h = s.summonMageHand({ casterToken: "t1", characterId: null, round: 1 })
  assert.deepEqual(s.normaliseSummon(h), h)
  assert.equal(s.normaliseSummon(null), null)
  assert.equal(s.normaliseSummon({ spell: "fireball" }), null)
  assert.equal(s.normaliseSummon({ spell: "mage hand", caster_token: "t", cast_round: "x" }), null)
})

test("the hand has no hit points, no AC and no initiative in this module", () => {
  const keys = Object.keys(s.summonMageHand({ casterToken: "t", characterId: null, round: 1 }))
  for (const k of ["hp", "hp_max", "ac", "initiative"]) assert.ok(!keys.includes(k), k)
})
