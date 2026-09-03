// A corpse does not get a turn, and the round still turns when you walk past it.
// Run: node lib/__tests__/turn-order.test.mjs
import assert from "node:assert/strict"

// lib/turn-order.ts, as implemented.
function advanceTurn({ from, count, isDead }) {
  if (count <= 0) return { index: 0, roundsCrossed: 0, exhausted: true }
  let roundsCrossed = 0
  let index = from
  for (let step = 0; step < count; step++) {
    const next = index + 1
    if (next >= count) roundsCrossed += 1
    index = next % count
    if (!isDead(index)) return { index, roundsCrossed, exhausted: false }
  }
  return { index, roundsCrossed, exhausted: true }
}

const alive = () => false
const deadAt = (...ix) => (i) => ix.includes(i)

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\nturn order")

test("with everyone alive it is just the next one", () => {
  assert.deepEqual(advanceTurn({ from: 0, count: 4, isDead: alive }), { index: 1, roundsCrossed: 0, exhausted: false })
  assert.deepEqual(advanceTurn({ from: 2, count: 4, isDead: alive }), { index: 3, roundsCrossed: 0, exhausted: false })
})

test("the top of the order wraps and turns the round", () => {
  assert.deepEqual(advanceTurn({ from: 3, count: 4, isDead: alive }), { index: 0, roundsCrossed: 1, exhausted: false })
})

test("a corpse is stepped over", () => {
  // THE REPORTED BUG. The Drow Elite Warrior died in round 1 and was still
  // being dealt a turn six rounds later, answering "lies still" each time.
  const r = advanceTurn({ from: 0, count: 4, isDead: deadAt(1) })
  assert.equal(r.index, 2, "landed on the corpse")
})

test("several corpses in a row are all stepped over", () => {
  const r = advanceTurn({ from: 0, count: 6, isDead: deadAt(1, 2, 3) })
  assert.equal(r.index, 4)
})

test("THE ROUND TURNS WHEN YOU CROSS THE TOP, NOT WHEN YOU LAND ON IT", () => {
  // The trap. If the first combatant in the order is a corpse, the turn lands
  // on index 1 - but a new round has still begun. A caller keyed on
  // `nextIndex === 0` would silently skip the round increment, the summon
  // expiry and the end-of-round world step, and Mage Hand would never fade.
  const r = advanceTurn({ from: 3, count: 4, isDead: deadAt(0) })
  assert.equal(r.index, 1, "did not step over the corpse at the top")
  assert.equal(r.roundsCrossed, 1, "crossed the top without counting the round")
})

test("stepping over the whole tail still counts exactly one round", () => {
  // Dead at 2 and 3: from 1 we cross the top once and land on 0.
  const r = advanceTurn({ from: 1, count: 4, isDead: deadAt(2, 3) })
  assert.equal(r.index, 0)
  assert.equal(r.roundsCrossed, 1, "counted the wrap more than once, or not at all")
})

test("the dying are NOT the dead", () => {
  // The subtlety that matters most. A character at 0 who is dying rolls a
  // death save every turn - that roll IS their turn and it is how they come
  // back. Samson rolled three across three rounds in the trial and
  // stabilised. Only the caller's isDead decides, and it must say false for
  // them; this asserts the mechanism honours that.
  const r = advanceTurn({ from: 0, count: 3, isDead: () => false })
  assert.equal(r.index, 1, "a dying combatant was skipped")
})

test("the only survivor keeps being given the turn", () => {
  const r = advanceTurn({ from: 2, count: 4, isDead: deadAt(0, 1, 3) })
  assert.equal(r.index, 2, "the last one standing lost their turn")
  assert.equal(r.exhausted, false)
  assert.equal(r.roundsCrossed, 1)
})

test("a board of corpses says so instead of spinning", () => {
  // Total party kill, or a Sweep. Bounded at one lap: without the bound this
  // is an infinite loop inside a request handler.
  const r = advanceTurn({ from: 0, count: 4, isDead: () => true })
  assert.equal(r.exhausted, true, "did not report an exhausted order")
})

test("an exhausted order still reports a coherent round count", () => {
  // The caller may end the fight here, and the final state it writes must not
  // contradict the log above it.
  const r = advanceTurn({ from: 2, count: 4, isDead: () => true })
  assert.equal(r.roundsCrossed, 1)
  assert.ok(Number.isInteger(r.index) && r.index >= 0 && r.index < 4)
})

test("an empty order does not divide by zero", () => {
  const r = advanceTurn({ from: 0, count: 0, isDead: alive })
  assert.equal(r.exhausted, true)
  assert.equal(r.index, 0)
})

test("one combatant, alone and alive, keeps their turn and the round turns", () => {
  const r = advanceTurn({ from: 0, count: 1, isDead: alive })
  assert.deepEqual(r, { index: 0, roundsCrossed: 1, exhausted: false })
})

test("isDead is never asked about the combatant whose turn is ending", () => {
  // They may have just died in it, which has no bearing on who goes next -
  // and asking would make a creature that killed itself skip its own killer.
  const asked = []
  advanceTurn({ from: 2, count: 4, isDead: (i) => { asked.push(i); return false } })
  assert.ok(!asked.includes(2), `isDead was asked about the ending turn itself: ${asked.join(",")}`)
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
