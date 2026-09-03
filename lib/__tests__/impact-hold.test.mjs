// The corpse must not arrive before the spell does.
// Run: node lib/__tests__/impact-hold.test.mjs
import assert from "node:assert/strict"

// lib/impact-hold.ts, as implemented.
class ImpactHold {
  constructor() { this.holds = new Map() }
  hold(id, now, ms) {
    const until = now + Math.max(0, ms)
    const cur = this.holds.get(id)
    if (cur && cur.until >= until) return
    this.holds.set(id, { until })
  }
  held(id, now) {
    const h = this.holds.get(id)
    if (!h) return false
    if (h.until <= now) { this.holds.delete(id); return false }
    return true
  }
  remaining(id, now) {
    const h = this.holds.get(id)
    if (!h) return 0
    const left = h.until - now
    if (left <= 0) { this.holds.delete(id); return 0 }
    return left
  }
  release(id) { this.holds.delete(id) }
  sweep(now) { for (const [id, h] of this.holds) if (h.until <= now) this.holds.delete(id) }
  size(now) { this.sweep(now); return this.holds.size }
  clear() { this.holds.clear() }
}
const holdMsFor = (s) => {
  const n = Number(s)
  const base = Number.isFinite(n) && n > 0 ? n * 1000 : 900
  return Math.min(4000, base + 900)
}

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\nimpact hold")

test("a held token ignores the wire", () => {
  // THE BUG. The server writes hp_current before it responds, so the realtime
  // row can beat the bolt to the target and drop the body mid-windup.
  const h = new ImpactHold()
  h.hold("drow", 1000, 900)
  assert.equal(h.held("drow", 1100), true)
})

test("an unheld token is never held", () => {
  assert.equal(new ImpactHold().held("drow", 1000), false)
})

test("the impact releases it", () => {
  const h = new ImpactHold()
  h.hold("drow", 1000, 900)
  h.release("drow")
  assert.equal(h.held("drow", 1100), false, "the hold survived its own impact")
})

test("releasing something never held is harmless", () => {
  // The swing path releases without holding: a sword's contact frame IS its
  // impact, and there was never a flight to wait through.
  const h = new ImpactHold()
  assert.doesNotThrow(() => h.release("nobody"))
})

test("A HOLD THAT OUTLIVES ITS SPELL LAPSES ON ITS OWN", () => {
  // The most important test here. If the effect never lands - a texture
  // fails, the tab is backgrounded and the animation loop stops, an exception
  // eats the impact callback - a hold with no deadline would make that
  // creature ignore its own hit points for the rest of the session, standing
  // at full health while the log says it died.
  const h = new ImpactHold()
  h.hold("drow", 1000, 900)
  assert.equal(h.held("drow", 1899), true, "lapsed early")
  assert.equal(h.held("drow", 1900), false, "the hold never lapsed")
})

test("a lapsed hold is dropped on READ, not only on sweep", () => {
  // A board whose animation loop has stopped never sweeps. It must still
  // recover the moment anything asks.
  const h = new ImpactHold()
  h.hold("drow", 1000, 900)
  h.held("drow", 5000)
  assert.equal(h.size(0), 0, "the lapsed hold was left behind for the sweep")
})

test("a second spell in the air EXTENDS the hold", () => {
  // Two casts at the same creature. The later one must not be released by the
  // earlier one's deadline, or the body falls early again - the exact bug,
  // one spell later.
  const h = new ImpactHold()
  h.hold("drow", 1000, 900)   // lapses at 1900
  h.hold("drow", 1500, 900)   // lapses at 2400
  assert.equal(h.held("drow", 2000), true, "the later spell inherited the earlier deadline")
})

test("a shorter second hold does not SHORTEN the first", () => {
  // The other direction of the same rule. A fast cast arriving behind a slow
  // one must not cut the slow one's flight short.
  const h = new ImpactHold()
  h.hold("drow", 1000, 3000)  // lapses at 4000
  h.hold("drow", 1100, 200)   // would lapse at 1300
  assert.equal(h.held("drow", 2000), true, "a short hold clipped a long one")
})

test("holds are per token, never shared", () => {
  // A Fireball holds five creatures. One impact must not free the other four
  // - and holding one must not hold the caster standing next to it.
  const h = new ImpactHold()
  h.hold("a", 1000, 900)
  h.hold("b", 1000, 900)
  assert.equal(h.held("c", 1000), false, "a token nobody held is held")
  h.release("a")
  assert.equal(h.held("b", 1100), true, "releasing one released another")
})

test("sweep clears the lapsed and keeps the live", () => {
  const h = new ImpactHold()
  h.hold("old", 1000, 100)
  h.hold("new", 1000, 3000)
  h.sweep(1500)
  assert.equal(h.held("old", 1500), false)
  assert.equal(h.held("new", 1500), true)
})

test("clear lets go of everything", () => {
  // The fight ended, or the board is unmounting.
  const h = new ImpactHold()
  h.hold("a", 1000, 3000)
  h.hold("b", 1000, 3000)
  h.clear()
  assert.equal(h.size(1000), 0)
})

test("a zero or negative hold is not a hold", () => {
  const h = new ImpactHold()
  h.hold("a", 1000, 0)
  assert.equal(h.held("a", 1000), false, "a zero-length hold held")
  h.hold("b", 1000, -500)
  assert.equal(h.held("b", 1000), false, "a negative hold held")
})

test("the deadline is longer than the effect it waits for", () => {
  // Releasing early is the bug this file exists to prevent, so the margin is
  // generous on purpose.
  assert.ok(holdMsFor(1.0) > 1000, "a one-second effect gets a deadline of one second")
  assert.ok(holdMsFor(0.4) > 400)
})

test("an unknown duration still gets a sane deadline", () => {
  for (const bad of [null, undefined, 0, -1, NaN, "banana"]) {
    const ms = holdMsFor(bad)
    assert.ok(ms > 0 && ms <= 4000, `holdMsFor(${String(bad)}) = ${ms}`)
  }
})

test("NO DEADLINE IS UNBOUNDED", () => {
  // A bad duration must not be able to park a creature's health forever.
  assert.ok(holdMsFor(999) <= 4000, "a long effect parks the hold indefinitely")
  assert.ok(holdMsFor(Infinity) <= 4000, "an infinite effect parks the hold forever")
})

test("remaining() says how long truth must wait", () => {
  const h = new ImpactHold()
  h.hold("a", 1000, 800)
  assert.equal(h.remaining("a", 1000), 800)
  assert.equal(h.remaining("a", 1500), 300)
})

test("remaining() is 0 for a hold that was never placed", () => {
  assert.equal(new ImpactHold().remaining("nobody", 1000), 0)
})

test("an expired hold reports 0 and is forgotten", () => {
  // The rail's reconcile timer keys off this: 0 means "apply the truth now".
  const h = new ImpactHold()
  h.hold("a", 1000, 500)
  assert.equal(h.remaining("a", 1600), 0)
  assert.equal(h.held("a", 1600), false)
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
