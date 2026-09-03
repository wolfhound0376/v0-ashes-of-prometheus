// The attacker's half of a d20, which did not exist until now.
//
// lib/helpless has always answered "what does the TARGET's condition do to
// this roll". Nothing asked what the ATTACKER's own state does, so a character
// at exhaustion 3 — "disadvantage on attack rolls and saving throws" — swung
// exactly as well as a rested one.
//
// The case worth the most attention is the CANCEL ORDER. SRD: "If
// circumstances cause a roll to have both advantage and disadvantage, you are
// considered to have neither of them." That is one judgement over every
// source, not a running total — so adding the attacker's disadvantage to an
// already-resolved verdict gives the wrong answer whenever the target
// contributed both.

// Run:  node --test lib/__tests__/exhaustion-rolls.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, "..", "helpless.ts")
const out = join(mkdtempSync(join(tmpdir(), "exroll-")), "helpless.mjs")
const esbuild = process.env.ESBUILD ?? "npx esbuild"
execSync(`${esbuild} "${src}" --format=esm --platform=neutral --outfile="${out}"`, { stdio: "pipe" })
const { attackContext, rollerContext, attackAgainst, attackSources, resolveSources, rollD20 } =
  await import(pathToFileURL(out).href)

test("an exhausted attacker has disadvantage from level 3, not before", () => {
  const plain = { targetConditions: [], distanceFt: 5 }
  for (const level of [0, 1, 2]) {
    const c = attackContext({ ...plain, attackerExhaustion: level })
    assert.equal(c.disadvantage, false, `level ${level} should not touch an attack`)
  }
  for (const level of [3, 4, 5, 6]) {
    const c = attackContext({ ...plain, attackerExhaustion: level })
    assert.equal(c.disadvantage, true, `level ${level} should give disadvantage`)
    assert.match(c.note ?? "", /exhausted/)
  }
})

test("exhaustion cancels against a helpless target rather than stacking", () => {
  // Restrained gives advantage; exhaustion 3 gives disadvantage. Neither wins.
  const c = attackContext({
    targetConditions: ["Restrained"],
    distanceFt: 5,
    attackerExhaustion: 3,
  })
  assert.equal(c.advantage, false)
  assert.equal(c.disadvantage, false)
  assert.match(c.note ?? "", /cancel/)
})

test("THE ORDERING BUG: a target that already cancels stays cancelled", () => {
  // Restrained (advantage) + Prone at range (disadvantage) cancel on their own.
  // Adding an exhausted attacker must NOT tip it into disadvantage: an
  // advantage source was present, so by the rule it is still neither.
  //
  // This is exactly what a naive `ctx.disadvantage ||= exhausted` produces,
  // and it is why the sources are gathered before the cancel runs.
  const target = ["Restrained", "Prone"]
  const withoutMe = attackAgainst(target, 30)
  assert.equal(withoutMe.advantage, false, "precondition: they cancel already")
  assert.equal(withoutMe.disadvantage, false)

  const withMe = attackContext({ targetConditions: target, distanceFt: 30, attackerExhaustion: 5 })
  assert.equal(withMe.disadvantage, false, "must NOT become disadvantage")
  assert.equal(withMe.advantage, false)
})

test("checks and saves have different exhaustion thresholds", () => {
  // SRD: level 1 is ability CHECKS; level 3 is attacks and SAVING THROWS.
  assert.equal(rollerContext({ kind: "check", exhaustion: 1 }).disadvantage, true)
  assert.equal(rollerContext({ kind: "save", exhaustion: 1 }).disadvantage, false)
  assert.equal(rollerContext({ kind: "save", exhaustion: 2 }).disadvantage, false)
  assert.equal(rollerContext({ kind: "save", exhaustion: 3 }).disadvantage, true)
  assert.equal(rollerContext({ kind: "check", exhaustion: 0 }).disadvantage, false)
})

test("a rogue's advantage clause is now reachable", () => {
  // The sneak attack rule takes `hasAdvantage`, and the route passed a
  // hardcoded false. Against an Unconscious target it is true, which is the
  // first clause of the feature finally being live.
  const c = attackContext({ targetConditions: ["Unconscious"], distanceFt: 5 })
  assert.equal(c.advantage, true)
  assert.equal(c.autoCrit, true, "helpless within 5 ft is also an automatic critical")
})

test("the refactor did not change what attackAgainst answers", () => {
  const cases = [
    [[], 5], [["Blinded"], 5], [["Invisible"], 5], [["Prone"], 5], [["Prone"], 30],
    [["Restrained", "Invisible"], 5], [["Unconscious"], 5], [["Unconscious"], 30],
  ]
  for (const [conds, ft] of cases) {
    const direct = resolveSources(attackSources(conds, ft))
    const legacy = attackAgainst(conds, ft)
    assert.deepEqual(legacy, direct, `${JSON.stringify(conds)} at ${ft}ft`)
  }
})

test("rollD20 keeps the lower die under an exhausted attacker", () => {
  const faces = [17, 4]
  let i = 0
  const d20 = () => faces[i++]
  const c = attackContext({ targetConditions: [], distanceFt: 5, attackerExhaustion: 3 })
  const r = rollD20(c, d20)
  assert.equal(r.roll, 4, "disadvantage keeps the lower")
  assert.deepEqual(r.dice, [17, 4], "and reports both, so the table sees what was lost")
})
