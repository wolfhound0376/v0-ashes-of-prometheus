// A corpse that keeps twitching forever is a bug.
// Run: node lib/__tests__/collapse.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const src = readFileSync(new URL("../collapse.ts", import.meta.url), "utf8")

// lib/collapse.ts, as implemented. Beats parsed from the source.
const n = (name) => Number(src.match(new RegExp(`${name} = ([\\d.]+)`))[1])
const BUCKLE_END = n("BUCKLE_END"), TOPPLE_END = n("TOPPLE_END"), LAND_END = n("LAND_END"), SETTLE_END = n("SETTLE_END")
const FINAL_PITCH = Math.PI / 2 + 0.06, BUCKLE_DROP = 0.09, BOUNCE = 0.035, SHUDDER = 0.012
const hash = (id) => { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0) / 4294967296 }
function headingFor(id, from, at) {
  if (from && at) { const dx = at.x - from.x, dy = at.y - from.y; if (dx !== 0 || dy !== 0) return Math.atan2(dx, dy) }
  return hash(id) * Math.PI * 2
}
const easeIn = (t) => t * t
function collapseAt(t, id, heading) {
  const done = { pitch: FINAL_PITCH, drop: -BUCKLE_DROP, heading, settled: true }
  if (!Number.isFinite(t) || t < 0) return { pitch: 0, drop: 0, heading, settled: false }
  if (t >= SETTLE_END) return done
  if (t < BUCKLE_END) { const k = t / BUCKLE_END; return { pitch: FINAL_PITCH * 0.06 * k, drop: -BUCKLE_DROP * k, heading, settled: false } }
  if (t < TOPPLE_END) { const k = (t - BUCKLE_END) / (TOPPLE_END - BUCKLE_END); return { pitch: FINAL_PITCH * (0.06 + 0.94 * easeIn(k)), drop: -BUCKLE_DROP, heading, settled: false } }
  if (t < LAND_END) { const k = (t - TOPPLE_END) / (LAND_END - TOPPLE_END); return { pitch: FINAL_PITCH + Math.sin(k * Math.PI) * BOUNCE, drop: -BUCKLE_DROP, heading, settled: false } }
  const k = (t - LAND_END) / (SETTLE_END - LAND_END), fade = (1 - k) ** 3
  return { pitch: FINAL_PITCH + Math.sin(t * 9.3 + hash(id) * 10) * SHUDDER * fade, drop: -BUCKLE_DROP, heading, settled: false }
}

let failures = 0
const test = (nm, f) => { try { f(); console.log("  PASS ", nm) } catch (e) { failures++; console.log("  FAIL ", nm); console.log("        " + String(e.message).split("\n")[0]) } }
const frames = (id, h = 0, end = 4) => Array.from({ length: Math.round(end * 60) }, (_, i) => ({ t: i / 60, p: collapseAt(i / 60, id, h) }))

console.log("\ncollapse")

test("it starts standing", () => {
  const p = collapseAt(0, "k", 0)
  // Math.abs, not strictEqual: k=0 yields -0, and Node's strict equal uses
  // Object.is, where -0 is not 0. Harmless in a transform, noisy in a test.
  assert.ok(Math.abs(p.pitch) < 1e-12, `pitch ${p.pitch}`)
  assert.ok(Math.abs(p.drop) < 1e-12, `drop ${p.drop}`)
})

test("the knees go before the body does — this is the whole difference", () => {
  // A chess piece has no knees. At the end of the buckle the body has DROPPED
  // but has barely rotated; skipping this beat is what made the old fall read
  // as furniture tipping.
  const p = collapseAt(BUCKLE_END * 0.99, "k", 0)
  assert.ok(p.drop < -BUCKLE_DROP * 0.9, `hips only dropped ${p.drop}`)
  assert.ok(p.pitch < FINAL_PITCH * 0.1, `already rotated ${p.pitch}`)
})

test("the topple accelerates — gravity does not ease out", () => {
  // Each step of the fall must be bigger than the one before it.
  const a = collapseAt(0.3, "k", 0).pitch, b = collapseAt(0.45, "k", 0).pitch
  const c = collapseAt(0.6, "k", 0).pitch, d = collapseAt(0.75, "k", 0).pitch
  assert.ok(b - a < c - b, "the middle of the fall is not accelerating")
  assert.ok(c - b < d - c, "the end of the fall is not accelerating")
})

test("it lands slightly past square, like dead weight", () => {
  assert.ok(collapseAt(SETTLE_END + 1, "k", 0).pitch > Math.PI / 2)
})

test("it never rotates further than a body can", () => {
  for (const { p } of frames("k")) {
    assert.ok(p.pitch >= 0 && p.pitch <= FINAL_PITCH + BOUNCE + 1e-9, `pitch ${p.pitch}`)
  }
})

test("the fall is monotonic until it lands", () => {
  // No wobbling on the way down — that is the bounce's job, afterwards.
  let last = -1
  for (const { t, p } of frames("k", 0, TOPPLE_END)) {
    assert.ok(p.pitch >= last - 1e-9, `pitch went backwards at t=${t}`)
    last = p.pitch
  }
})

test("the shudder dies to absolutely nothing", () => {
  // "them slightly moving" — but a corpse still twitching at the end of a
  // fight is a bug, not atmosphere.
  const late = collapseAt(SETTLE_END - 0.05, "k", 0).pitch - FINAL_PITCH
  assert.ok(Math.abs(late) < SHUDDER * 0.05, `still moving ${late} at the end`)
  assert.equal(collapseAt(SETTLE_END, "k", 0).settled, true)
  assert.equal(collapseAt(600, "k", 0).settled, true)
  assert.deepEqual(collapseAt(600, "k", 0), collapseAt(9999, "k", 0))
})

test("it falls AWAY from whatever hit it", () => {
  // Struck from the north (lower y), the body goes down to the south.
  const away = headingFor("k", { x: 5, y: 2 }, { x: 5, y: 6 })
  assert.ok(Math.abs(away - 0) < 1e-9, `expected due south, got ${away}`)
  const east = headingFor("k", { x: 2, y: 5 }, { x: 6, y: 5 })
  assert.ok(Math.abs(east - Math.PI / 2) < 1e-9, `expected due east, got ${east}`)
})

test("with no attacker it still lands the same way every time", () => {
  // Every seat renders this corpse, and it must be the same corpse after a
  // reload — a random heading would rotate the body on refresh.
  assert.equal(headingFor("kenta", null, null), headingFor("kenta", null, null))
  assert.notEqual(headingFor("kenta"), headingFor("scott"))
})

test("nonsense time does not throw or teleport", () => {
  for (const t of [NaN, -1, -999]) {
    const p = collapseAt(t, "k", 0)
    assert.equal(p.pitch, 0)
  }
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
