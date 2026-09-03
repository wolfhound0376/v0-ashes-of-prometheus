// A defence nobody can see is a defence that did not happen.
// Run: node lib/__tests__/defence-motion-legibility.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const src = readFileSync(new URL("../../components/tactical/defence-motion.ts", import.meta.url), "utf8")

const shapes = {}
for (const m of src.matchAll(/(\w+):\s*\{\s*lean:\s*(-?[\d.]+),\s*shift:\s*(-?[\d.]+),\s*drop:\s*(-?[\d.]+),\s*life:\s*([\d.]+)\s*\}/g)) {
  shapes[m[1]] = { lean: +m[2], shift: +m[3], drop: +m[4], life: +m[5] }
}

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\ndefence motion legibility")

test("all four defences are still defined", () => {
  for (const k of ["dodge", "parry", "block", "hurt"]) assert.ok(shapes[k], `${k} is missing`)
})

test("A DODGE IS BIG ENOUGH TO SEE", () => {
  // The reported bug. The first pass used 0.34 board units over 0.42s, which
  // is invisible from a tabletop camera looking down at a 12x12 room.
  assert.ok(Math.abs(shapes.dodge.shift) >= 0.5,
    `a dodge travels only ${shapes.dodge.shift} of a square`)
})

test("A DODGE IS STILL SMALLER THAN A SQUARE", () => {
  // The other failure mode, and the reason the numbers were small to begin
  // with: travel a whole square and the miniature appears to have MOVED,
  // which the grid logic would flatly contradict.
  for (const k of Object.keys(shapes)) {
    assert.ok(Math.abs(shapes[k].shift) < 1, `${k} travels a full square (${shapes[k].shift})`)
  }
})

test("a dodge travels further than a parry", () => {
  // A dodge is about not being where you were; a parry is a turn of the blade.
  // If these ever equalise the two read as the same motion.
  assert.ok(Math.abs(shapes.dodge.shift) > Math.abs(shapes.parry.shift))
})

test("a parry leans more than it travels", () => {
  assert.ok(shapes.parry.lean > Math.abs(shapes.parry.shift))
})

test("a block drops more than it leans", () => {
  // Weight going down into the shield rather than away from the blow.
  assert.ok(shapes.block.drop > Math.abs(shapes.block.lean))
})

test("BEING HURT LEANS THE OPPOSITE WAY FROM DODGING", () => {
  // The sign is what stops "I got hit" and "I got out of the way" reading as
  // the same animation, which is the whole reason a miss needed its own
  // motion in the first place.
  assert.ok(shapes.hurt.lean < 0, "being hurt no longer leans INTO the blow")
  assert.ok(shapes.dodge.lean > 0, "a dodge no longer leans away")
})

test("every defence is over fast", () => {
  // It has to finish inside the beat between the blow and the next thing.
  for (const k of Object.keys(shapes)) {
    assert.ok(shapes[k].life <= 0.5, `${k} lasts ${shapes[k].life}s`)
    assert.ok(shapes[k].life >= 0.3, `${k} is over in ${shapes[k].life}s, too fast to read`)
  }
})

test("the body always returns to rest", () => {
  // sin(p*pi) peaks at the halfway point and comes back to zero, so the
  // miniature ends where it started even if the handle is dropped early.
  assert.ok(/Math\.sin\(p \* Math\.PI\)/.test(src), "the motion no longer returns to rest")
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
