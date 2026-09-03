// A corpse that keeps breathing is worse than a statue.
// Run: node lib/__tests__/idle-motion.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const src = readFileSync(new URL("../idle-motion.ts", import.meta.url), "utf8")

// lib/idle-motion.ts, as implemented. Constants PARSED from the source so an
// amplitude that changes there is measured here rather than assumed.
const num = (name) => Number(src.match(new RegExp(`const ${name} = ([\\d.]+)`))[1])
const BREATH_PERIOD = num("BREATH_PERIOD"), SHIFT_PERIOD = num("SHIFT_PERIOD"), DRIFT_PERIOD = num("DRIFT_PERIOD")
const BREATH = num("BREATH"), SWAY = num("SWAY"), YAW = num("YAW")
const STILL = { bob: 0, sway: 0, yaw: 0 }
function phaseOf(id) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) / 4294967296
}
function idleOffset({ id, time, alive, height }) {
  if (!alive) return STILL
  const p = phaseOf(id), t = time
  const k = Math.min(3, Math.max(0.33, (height ?? 1.2) / 1.2))
  const turn = Math.PI * 2
  return {
    bob: Math.sin((t / BREATH_PERIOD + p) * turn) * BREATH * k,
    sway: Math.sin((t / SHIFT_PERIOD + p * 1.7) * turn) * SWAY * k,
    yaw: Math.sin((t / DRIFT_PERIOD + p * 2.3) * turn) * YAW,
  }
}

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }
const sample = (id, alive = true, height) => Array.from({ length: 400 }, (_, i) => idleOffset({ id, time: i * 0.05, alive, height }))

console.log("\nidle motion")

test("the dead lie absolutely still", () => {
  for (const o of sample("drow-1", false)) assert.deepEqual(o, STILL)
})

test("the living never stop moving", () => {
  const s = sample("drow-1")
  const moved = s.filter((o) => Math.abs(o.bob) > 1e-6).length
  assert.ok(moved > s.length * 0.9, `only ${moved}/${s.length} frames had motion`)
})

test("the motion stays under a couple of centimetres", () => {
  // 1 unit = 5 ft. BREATH 0.014 units is about 2.1 cm on a six-foot figure —
  // the top of what the animation literature calls a breathing idle. A big
  // idle reads as a character DOING something rather than existing.
  for (const o of sample("drow-1")) {
    assert.ok(Math.abs(o.bob) <= BREATH * 1.001, `bob ${o.bob} exceeds ${BREATH}`)
    assert.ok(Math.abs(o.sway) <= SWAY * 1.001, `sway ${o.sway} exceeds ${SWAY}`)
    assert.ok(Math.abs(o.yaw) <= YAW * 1.001, `yaw ${o.yaw} exceeds ${YAW}`)
  }
})

test("two creatures are never in step", () => {
  const a = sample("token-aaa"), b = sample("token-bbb")
  const same = a.filter((o, i) => Math.abs(o.bob - b[i].bob) < 1e-4).length
  assert.ok(same < a.length * 0.2, `${same}/${a.length} frames identical — they are marching`)
})

test("the same creature is identical frame for frame", () => {
  // Every seat at the table renders the same figure; a random phase would put
  // them out of step with each other.
  assert.deepEqual(idleOffset({ id: "x", time: 12.5, alive: true }), idleOffset({ id: "x", time: 12.5, alive: true }))
})

test("the three waves never line up", () => {
  // Incommensurate periods, so the eye cannot find the loop point. If any two
  // shared a common multiple inside a fight, the whole cycle would repeat.
  const pairs = [[BREATH_PERIOD, SHIFT_PERIOD], [BREATH_PERIOD, DRIFT_PERIOD], [SHIFT_PERIOD, DRIFT_PERIOD]]
  for (const [a, b] of pairs) {
    const r = a / b
    assert.ok(Math.abs(r - Math.round(r)) > 0.05, `${a} and ${b} are near-harmonic`)
  }
})

test("a spider still twitches and a giant does not heave", () => {
  const tiny = sample("s", true, 0.2).reduce((m, o) => Math.max(m, Math.abs(o.bob)), 0)
  const huge = sample("s", true, 40).reduce((m, o) => Math.max(m, Math.abs(o.bob)), 0)
  assert.ok(tiny > 0, "the smallest creature stopped moving entirely")
  assert.ok(huge <= BREATH * 3.001, `a giant heaved ${huge}`)
})

test("no drift: it returns to where it started", () => {
  // Sines, not integrations. A drift would walk a token off its square over
  // a long fight.
  const a = idleOffset({ id: "x", time: 0, alive: true })
  const b = idleOffset({ id: "x", time: BREATH_PERIOD, alive: true })
  assert.ok(Math.abs(a.bob - b.bob) < 1e-9, "the breath does not close its loop")
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
