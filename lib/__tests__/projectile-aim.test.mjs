// A miss has to miss, and be seen to.
// Run: node lib/__tests__/projectile-aim.test.mjs
import assert from "node:assert/strict"

const missOffset = (margin) => {
  const by = Math.max(0, -margin), NEAR = 0.35, FAR = 1.6
  return NEAR + (FAR - NEAR) * Math.min(1, by / 10)
}
function aimPoint({ from, to, hit, margin, seed }) {
  if (hit) return { ...to }
  const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz)
  if (len < 1e-4) return { ...to }
  const px = -dz / len, pz = dx / len
  const side = ((seed ?? 0) % 2 === 0) ? 1 : -1
  const off = missOffset(margin ?? -5) * side
  return { x: to.x + px * off + (dx / len) * 0.5, z: to.z + pz * off + (dz / len) * 0.5 }
}
const flightTime = (from, to, ups = 26) =>
  Math.min(0.65, Math.max(0.12, Math.hypot(to.x - from.x, to.z - from.z) / ups))

const from = { x: 0, z: 0 }, to = { x: 10, z: 0 }
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\nprojectile aim")

test("a hit goes exactly to the target", () => {
  assert.deepEqual(aimPoint({ from, to, hit: true }), to)
})

test("A MISS DOES NOT", () => {
  // The whole point. Every projectile on this board used to fly to the
  // target's centre whether it hit or not.
  const p = aimPoint({ from, to, hit: false, margin: -5 })
  assert.ok(dist(p, to) > 0.3, `a miss landed ${dist(p, to).toFixed(2)} from the target`)
})

test("a near miss shaves past; a wide one is nowhere near", () => {
  // margin is why it is on the wire: "missed by 2 was very nearly hit; missed
  // by 9 was never in danger."
  const near = aimPoint({ from, to, hit: false, margin: -1 })
  const wide = aimPoint({ from, to, hit: false, margin: -12 })
  assert.ok(dist(wide, to) > dist(near, to), "a wide miss was no wider than a near one")
})

test("even a miss by one is visibly a miss", () => {
  // Otherwise it reads as a hit that failed to register.
  assert.ok(missOffset(-1) >= 0.3, "a near miss is too tight to see")
})

test("a fumble does not send the bolt into the next room", () => {
  // Clamped, or a natural 1 against a high AC throws it off the board.
  assert.ok(missOffset(-25) <= 1.6)
  assert.equal(missOffset(-25), missOffset(-10), "the clamp is not flat past the far end")
})

test("the offset is PERPENDICULAR, not short", () => {
  // A bolt that stops short reads as hitting an invisible wall.
  const p = aimPoint({ from, to, hit: false, margin: -5 })
  assert.ok(p.x > to.x, "the shot fell short of the target instead of going past it")
})

test("it carries a little PAST the target", () => {
  const p = aimPoint({ from, to, hit: false, margin: -5 })
  assert.ok(p.x - to.x > 0.2, "the bolt stopped level with the target")
})

test("the side alternates with the seed", () => {
  const a = aimPoint({ from, to, hit: false, margin: -5, seed: 0 })
  const b = aimPoint({ from, to, hit: false, margin: -5, seed: 1 })
  assert.ok(Math.sign(a.z) !== Math.sign(b.z), "two misses in a row both went the same way")
})

test("the same shot always looks the same", () => {
  // Replayed on another seat, it must not wander.
  assert.deepEqual(aimPoint({ from, to, hit: false, margin: -4, seed: 7 }),
                   aimPoint({ from, to, hit: false, margin: -4, seed: 7 }))
})

test("perpendicular is perpendicular whatever the angle", () => {
  const diag = { x: 7, z: 7 }
  const p = aimPoint({ from, to: diag, hit: false, margin: -5, seed: 0 })
  assert.ok(dist(p, diag) > 0.3)
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z))
})

test("SHOOTER AND TARGET ON THE SAME SQUARE DOES NOT PRODUCE NaN", () => {
  // There is no line to be wide of. Dividing by zero here removes the bolt
  // from the scene without a trace, which looks exactly like the bug this
  // whole file is fixing.
  const p = aimPoint({ from: { x: 3, z: 3 }, to: { x: 3, z: 3 }, hit: false, margin: -5 })
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z))
  assert.deepEqual(p, { x: 3, z: 3 })
})

test("flight time grows with distance, and is bounded at both ends", () => {
  // A fixed duration makes a five-foot shot look slow and a long one look
  // teleported.
  assert.ok(flightTime(from, { x: 3, z: 0 }) < flightTime(from, { x: 25, z: 0 }))
  assert.ok(flightTime(from, { x: 0.1, z: 0 }) >= 0.12, "a point-blank shot has no flight at all")
  assert.ok(flightTime(from, { x: 400, z: 0 }) <= 0.65, "a long shot stalls the turn")
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
