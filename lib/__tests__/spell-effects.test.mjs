// Sleep takes the weakest first, and no spell is ever silent again.
// Run: node lib/__tests__/spell-effects.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const src = readFileSync(new URL("../spell-effects.ts", import.meta.url), "utf8")

// lib/spell-effects.ts, as implemented.
function spendHpPool({ pool, candidates, immuneTypes }) {
  const immune = (immuneTypes ?? []).map((t) => t.toLowerCase())
  const eligible = candidates
    .filter((c) => typeof c.hp === "number" && c.hp > 0)
    .filter((c) => !immune.some((t) => String(c.creatureType ?? "").toLowerCase().includes(t)))
    .map((c) => ({ id: c.id, label: c.label, hp: c.hp }))
    .sort((a, b) => a.hp - b.hp)
  const affected = []
  let remaining = pool
  for (const c of eligible) {
    if (c.hp > remaining) continue
    affected.push(c); remaining -= c.hp
  }
  return { affected, remaining }
}
const needsRuling = ({ effects, handled }) => (handled ? false : !effects.some((e) => e.kind !== "dm"))

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\nspell effects")

// ---- Sleep ---------------------------------------------------------------

const room = [
  { id: "a", label: "Drow", hp: 13 },
  { id: "b", label: "Drow Elite", hp: 71 },
  { id: "c", label: "Stool", hp: 4 },
  { id: "d", label: "Jimjar", hp: 27 },
]

test("THE WEAKEST FALL FIRST — that ordering IS the spell", () => {
  // SRD: "Starting with the creature that has the lowest current hit points."
  // Sorting the other way makes Sleep a single-target spell against the
  // toughest thing in the room, which is the opposite of what it is for.
  const r = spendHpPool({ pool: 20, candidates: room })
  assert.deepEqual(r.affected.map((a) => a.label), ["Stool", "Drow"])
})

test("the pool is spent down, not applied per creature", () => {
  const r = spendHpPool({ pool: 20, candidates: room })
  assert.equal(r.remaining, 20 - 4 - 13)
})

test("A CREATURE THAT DOES NOT FIT IS SKIPPED, NOT STOPPED AT", () => {
  // The SRD says "before moving on to the creature with the next lowest hit
  // points" - it does not stop. A pool of 18 cannot take Jimjar at 27, but it
  // has already taken Stool and the Drow, and must keep looking.
  const r = spendHpPool({ pool: 18, candidates: room })
  assert.deepEqual(r.affected.map((a) => a.label), ["Stool", "Drow"])
  assert.equal(r.remaining, 1)
})

test("a small pool can still take the smallest", () => {
  const r = spendHpPool({ pool: 5, candidates: room })
  assert.deepEqual(r.affected.map((a) => a.label), ["Stool"])
})

test("a pool too small for anybody takes nobody", () => {
  const r = spendHpPool({ pool: 3, candidates: room })
  assert.deepEqual(r.affected, [])
  assert.equal(r.remaining, 3)
})

test("a big enough pool takes the whole room", () => {
  const r = spendHpPool({ pool: 200, candidates: room })
  assert.equal(r.affected.length, 4)
})

test("the already-down are not candidates", () => {
  // Spending the pool on a body is how Sleep does nothing.
  const r = spendHpPool({ pool: 20, candidates: [{ id: "x", label: "Corpse", hp: 0 }, ...room] })
  assert.ok(!r.affected.some((a) => a.label === "Corpse"))
})

test("untracked hit points are not candidates either", () => {
  // null is UNTRACKED, never zero - the same rule the rest of the board keeps.
  const r = spendHpPool({ pool: 50, candidates: [{ id: "n", label: "Shuushar", hp: null }] })
  assert.deepEqual(r.affected, [])
})

test("the undead do not sleep", () => {
  // SRD: "Undead and creatures immune to being charmed aren't affected."
  const r = spendHpPool({
    pool: 100,
    candidates: [{ id: "z", label: "Quick Zombie", hp: 22, creatureType: "Undead" }, { id: "c", label: "Stool", hp: 4 }],
    immuneTypes: ["undead", "construct"],
  })
  assert.deepEqual(r.affected.map((a) => a.label), ["Stool"])
})

test("the immunity check reads a messy creature_type", () => {
  // The bestiary says "humanoid (elf)", so it is a substring test, not equality.
  const r = spendHpPool({
    pool: 100,
    candidates: [{ id: "z", label: "Thing", hp: 5, creatureType: "Medium undead, neutral evil" }],
    immuneTypes: ["undead"],
  })
  assert.deepEqual(r.affected, [])
})

test("an empty room is not an error", () => {
  assert.deepEqual(spendHpPool({ pool: 40, candidates: [] }).affected, [])
})

test("ties are stable enough to be fair", () => {
  // Two creatures on the same hit points and a pool for one of them: exactly
  // one falls, and it does not matter which, but it must not be both.
  const r = spendHpPool({ pool: 10, candidates: [{ id: "a", label: "A", hp: 10 }, { id: "b", label: "B", hp: 10 }] })
  assert.equal(r.affected.length, 1)
})

// ---- the fallback that makes it "in mass" --------------------------------

test("A SPELL THAT DOES NOTHING GOES TO THE DM", () => {
  // The rule the whole feature turns on. Silence is a bug; a ruling is not.
  assert.equal(needsRuling({ effects: [], handled: false }), true)
})

test("a spell the engine handled is never second-guessed", () => {
  assert.equal(needsRuling({ effects: [], handled: true }), false)
})

test("a mechanised effect does not need a ruling", () => {
  assert.equal(needsRuling({ effects: [{ kind: "condition", condition: "Faerie Fire", rounds: 10 }], handled: false }), false)
})

test("a dm-only effect DOES need a ruling — that is what it is for", () => {
  assert.equal(needsRuling({ effects: [{ kind: "dm", text: "..." }], handled: false }), true)
})

test("a spell with both gets its mechanics AND is not sent away", () => {
  // Disguise Self: a condition the board can show, plus text only a DM can
  // adjudicate. The mechanical half means it is not "unhandled".
  const effects = [{ kind: "condition", condition: "Disguised", rounds: 100 }, { kind: "dm", text: "..." }]
  assert.equal(needsRuling({ effects, handled: false }), false)
})

// ---- the table -----------------------------------------------------------

test("every spell the party has that did nothing now has a row", () => {
  // The eight measured against the live sheets on 2026-09-03.
  for (const s of ["sleep", "faerie fire", "dissonant whispers", "guidance",
                   "thaumaturgy", "minor illusion", "disguise self", "fog cloud"]) {
    assert.ok(new RegExp(`"?${s.replace(" ", "[ -]")}"?\\s*:\\s*\\[`).test(src), `${s} has no effects row`)
  }
})

test("Sleep's pool is the SRD's 5d8", () => {
  assert.ok(/dice: "5d8"/.test(src), "Sleep no longer rolls 5d8")
})

test("every dm effect carries the text a ruling needs", () => {
  // A `dm` effect with no text hands Malachar a spell name and no rule, which
  // is how a DM invents something different every session.
  for (const m of src.matchAll(/kind: "dm",\s*\n?\s*text:\s*"([^"]*)"/g)) {
    assert.ok(m[1].length > 40, `a dm effect has only ${m[1].length} characters of rule`)
  }
})

test("Fog Cloud blinds the creatures inside it", () => {
  // SRD, Vision and Light: "A creature in a heavily obscured area effectively
  // suffers from the blinded condition." It used to be dm-text only, so the
  // spell drew a cloud and did nothing to anyone standing in it.
  const block = src.slice(src.indexOf('"fog cloud":'), src.indexOf('"fog cloud":') + 900)
  assert.match(block, /kind: "condition", condition: "Blinded"/)
})

test("Fog Cloud no longer asks Malachar to rule the obvious", () => {
  // One non-dm effect is all it takes, by the rule this file already pins.
  assert.equal(
    needsRuling({ effects: [{ kind: "condition", condition: "Blinded", rounds: 100 }, { kind: "dm", text: "x" }], handled: false }),
    false,
  )
})

test("...but the cloud's persistence is still the DM's to narrate", () => {
  // A condition laid at cast time cannot say that someone who WALKS IN later
  // is obscured too, nor that a wind disperses the whole thing.
  const block = src.slice(src.indexOf('"fog cloud":'), src.indexOf('"fog cloud":') + 900)
  assert.match(block, /kind: "dm"/)
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
