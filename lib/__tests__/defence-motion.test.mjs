// A body that moves must come back exactly where it started.
// Run: node lib/__tests__/defence-motion.test.mjs
import assert from "node:assert/strict"

// The motion from components/tactical/defence-motion.ts, with a stand-in for
// the Three.js object so this runs without a renderer.
const SHAPES = {
  dodge: { lean: 0.30, shift: 0.34, drop: 0.05, life: 0.42 },
  parry: { lean: 0.22, shift: 0.06, drop: 0.02, life: 0.34 },
  block: { lean: 0.08, shift: 0.04, drop: 0.13, life: 0.36 },
  hurt:  { lean: -0.26, shift: -0.14, drop: 0.10, life: 0.38 },
}
const makeBody = (x=3, y=0.5, z=7, rz=0.2) => ({
  rotation: { z: rz },
  position: { x, y, z, set(a,b,c){ this.x=a; this.y=b; this.z=c } },
})
function defenceMotion({ body, state, from }) {
  const shape = SHAPES[state]; if (!shape) return null
  const rest = { rz: body.rotation.z, x: body.position.x, y: body.position.y, z: body.position.z }
  let ax = 0, az = 1
  if (from) {
    const dx = body.position.x - from.x, dz = body.position.z - from.z
    const len = Math.hypot(dx, dz)
    if (len > 1e-4) { ax = dx/len; az = dz/len }
  }
  let t = 0, done = false
  return {
    update(dt) {
      if (done) return false
      t += dt
      const p = Math.min(1, t/shape.life)
      const k = Math.sin(p*Math.PI) ** 0.7
      body.rotation.z = rest.rz + shape.lean*k
      body.position.x = rest.x + ax*shape.shift*k
      body.position.z = rest.z + az*shape.shift*k
      body.position.y = rest.y - shape.drop*k
      if (p >= 1) {
        body.rotation.z = rest.rz; body.position.set(rest.x, rest.y, rest.z)
        done = true; return false
      }
      return true
    },
    dispose() {
      if (done) return
      body.rotation.z = rest.rz; body.position.set(rest.x, rest.y, rest.z)
      done = true
    },
  }
}

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        "+String(e.message).split("\n")[0]) } }

console.log("\ndefence motion")

test("every defence returns the body EXACTLY to rest", () => {
  // The failure this guards: float drift over a session leaves a miniature
  // leaning a few degrees off true and sunk into the floor - the kind of
  // thing nobody can name and everybody notices.
  for (const state of Object.keys(SHAPES)) {
    const b = makeBody()
    const m = defenceMotion({ body: b, state, from: { x: 0, z: 0 } })
    while (m.update(1/60)) {}
    assert.equal(b.rotation.z, 0.2, state)
    assert.equal(b.position.x, 3, state)
    assert.equal(b.position.y, 0.5, state)
    assert.equal(b.position.z, 7, state)
  }
})

test("dispose mid-motion also restores rest", () => {
  // The board rebuilds a token on any HP change, and being hit IS an HP
  // change - so a motion is routinely cut off half way through.
  const b = makeBody()
  const m = defenceMotion({ body: b, state: "dodge", from: { x: 0, z: 0 } })
  m.update(0.1); m.update(0.1)
  assert.notEqual(b.position.x, 3)   // it did move
  m.dispose()
  assert.equal(b.position.x, 3)
  assert.equal(b.rotation.z, 0.2)
})

test("a dodge moves AWAY from the attacker", () => {
  const b = makeBody(5, 0, 5)
  const m = defenceMotion({ body: b, state: "dodge", from: { x: 0, z: 5 } })
  m.update(0.2)
  assert.ok(b.position.x > 5, "should step away along +x")
})

test("hurt leans the opposite way from dodge", () => {
  // If these read the same the whole point is lost: one is being hit, the
  // other is not being there.
  assert.ok(SHAPES.hurt.lean < 0 && SHAPES.dodge.lean > 0)
  assert.ok(SHAPES.hurt.shift < 0 && SHAPES.dodge.shift > 0)
})

test("travel stays well inside one square", () => {
  // A five-foot square is 1 board unit. Anything approaching that reads as
  // the token having MOVED, which it has not - the grid still owns its square.
  for (const [s, v] of Object.entries(SHAPES)) assert.ok(Math.abs(v.shift) < 0.4, s)
})

test("an unknown state gets no motion rather than a wrong one", () => {
  assert.equal(defenceMotion({ body: makeBody(), state: "walk" }), null)
  assert.equal(defenceMotion({ body: makeBody(), state: "dead" }), null)
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
