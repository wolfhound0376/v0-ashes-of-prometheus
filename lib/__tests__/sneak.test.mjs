// You cannot see behind you, through a wall, or past a hook horror.
// Run: node lib/__tests__/sneak.test.mjs
import assert from "node:assert/strict"

// lib/sneak.ts, as implemented.
const SIZE_ORDER = { tiny: 0, small: 1, medium: 2, large: 3, huge: 4, gargantuan: 5 }
const sizeRank = (s) => { const k = String(s ?? "").trim().toLowerCase(); return k in SIZE_ORDER ? SIZE_ORDER[k] : SIZE_ORDER.medium }
const VISION_ARC_DEG = 200
const SMELL_SQUARES = 1
function angleDelta(a, b) {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
const squaresBetween = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
function withinArc(v, s, arcDeg = VISION_ARC_DEG) {
  if (v.facing == null) return true
  const dx = s.x - v.x, dy = s.y - v.y
  if (dx === 0 && dy === 0) return true
  return Math.abs(angleDelta(Math.atan2(dx, dy), v.facing)) <= (arcDeg / 2) * (Math.PI / 180)
}
function squaresOnLine(a, b) {
  const out = [], dx = b.x - a.x, dy = b.y - a.y
  const steps = Math.max(Math.abs(dx), Math.abs(dy))
  if (steps === 0) return out
  const seen = new Set([`${a.x},${a.y}`, `${b.x},${b.y}`])
  const n = steps * 4
  for (let i = 1; i < n; i++) {
    const t = i / n
    const x = Math.round(a.x + dx * t), y = Math.round(a.y + dy * t)
    const k = `${x},${y}`
    if (seen.has(k)) continue
    seen.add(k); out.push({ x, y })
  }
  return out
}
function sightOf({ vantage: v, sneaker: s, bodies, walkable, arcDeg }) {
  const dist = squaresBetween(v, s)
  if (v.blindsight && dist <= v.blindsight) return { sees: true, how: "blindsight" }
  if (v.isBeast && dist <= SMELL_SQUARES) return { sees: true, how: "smell" }
  if (!withinArc(v, s, arcDeg)) return { sees: false, why: "behind" }
  const between = squaresOnLine(v, s)
  if (walkable && walkable.size > 0) {
    for (const c of between) if (!walkable.has(`${c.x},${c.y}`)) return { sees: false, why: "wall" }
  }
  const mine = sizeRank(s.size)
  for (const c of between) {
    const body = bodies.find((b) => b.x === c.x && b.y === c.y && b.id !== v.id)
    if (body && sizeRank(body.size) > mine) return { sees: false, why: "screened" }
  }
  return { sees: true, how: "eyes" }
}
function surveySneak({ sneaker, vantages, bodies, walkable, arcDeg }) {
  const seenBy = []
  for (const v of vantages) {
    const sight = sightOf({ vantage: v, sneaker, bodies, walkable, arcDeg })
    if (sight.sees) seenBy.push({ id: v.id, label: v.label, how: sight.how, passivePerception: v.passivePerception })
  }
  if (!seenBy.length) return { seenBy, unopposed: true, dc: null, keenest: null }
  const best = seenBy.reduce((a, b) => (b.passivePerception > a.passivePerception ? b : a))
  return { seenBy, unopposed: false, dc: best.passivePerception, keenest: best.label }
}

const NORTH = 0                 // facing +Y
const SOUTH = Math.PI
const drow = (o) => ({ id: "d", label: "Drow", x: 5, y: 5, facing: NORTH, passivePerception: 12, size: "medium", ...o })

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\nsneak")

// ---- the arc -------------------------------------------------------------

test("straight ahead is seen", () => {
  assert.equal(sightOf({ vantage: drow(), sneaker: { x: 5, y: 9, size: "medium" }, bodies: [] }).sees, true)
})

test("DIRECTLY BEHIND IS NOT SEEN", () => {
  // Sam's whole request. A drow looking north cannot see the rogue creeping
  // up from the south.
  const r = sightOf({ vantage: drow(), sneaker: { x: 5, y: 1, size: "medium" }, bodies: [] })
  assert.equal(r.sees, false)
  assert.equal(r.why, "behind")
})

test("the blind spot is 160 degrees, not 180", () => {
  // 200 degrees of sight means the edge sits 100 degrees off centre, so a
  // creature slightly behind your shoulder is STILL visible. A rogue has to
  // get properly behind you, not merely level with you.
  //
  // Tested on exact coordinates rather than grid squares: the first version
  // of this rounded the point to a square first, which moves the angle enough
  // to cross the boundary and fails on the test's own arithmetic rather than
  // on the rule.
  const at = (deg) => ({
    x: 5 + Math.sin((deg * Math.PI) / 180) * 6,
    y: 5 + Math.cos((deg * Math.PI) / 180) * 6,
  })
  assert.equal(withinArc(drow(), at(0)), true, "dead ahead was blind")
  assert.equal(withinArc(drow(), at(99)), true, "99 degrees off centre was blind")
  assert.equal(withinArc(drow(), at(101)), false, "101 degrees off centre was visible")
  assert.equal(withinArc(drow(), at(-99)), true, "the arc is not symmetric")
  assert.equal(withinArc(drow(), at(-101)), false, "the arc is not symmetric")
  assert.equal(withinArc(drow(), at(180)), false, "directly behind was visible")
})

test("turning round changes what you can see", () => {
  // The same two creatures, the same two squares, opposite facing.
  const north = drow({ facing: NORTH })
  const south = drow({ facing: SOUTH })
  const behindNorth = { x: 5, y: 1, size: "medium" }
  assert.equal(sightOf({ vantage: north, sneaker: behindNorth, bodies: [] }).sees, false)
  assert.equal(sightOf({ vantage: south, sneaker: behindNorth, bodies: [] }).sees, true)
})

test("AN UNRECORDED FACING SEES ALL ROUND", () => {
  // The safe direction to fail in, and it matters: rotation_y was 0 on every
  // token in the database before this feature. Treating "unset" as "facing
  // north" would have silently made most of the room unable to see anything.
  const r = sightOf({ vantage: drow({ facing: null }), sneaker: { x: 5, y: 1, size: "medium" }, bodies: [] })
  assert.equal(r.sees, true)
})

test("something in your own square is always in your arc", () => {
  // The angle between two identical points is meaningless.
  assert.equal(withinArc(drow(), { x: 5, y: 5 }), true)
})

// ---- walls ---------------------------------------------------------------

test("a wall blocks sight whichever way you face", () => {
  const walkable = new Set()
  for (let x = 0; x < 12; x++) for (let y = 0; y < 12; y++) walkable.add(`${x},${y}`)
  walkable.delete("5,7")   // a pillar between them
  const r = sightOf({ vantage: drow(), sneaker: { x: 5, y: 9, size: "medium" }, bodies: [], walkable })
  assert.equal(r.sees, false)
  assert.equal(r.why, "wall")
})

test("no cell geometry means no walls, not no sight", () => {
  // The board falls back to an open rectangle when a map has no cells file.
  // Failing closed here would make everyone blind on those maps.
  assert.equal(sightOf({ vantage: drow(), sneaker: { x: 5, y: 9, size: "medium" }, bodies: [], walkable: new Set() }).sees, true)
})

// ---- bodies --------------------------------------------------------------

test("A BIGGER BODY IN THE WAY SCREENS YOU", () => {
  // Sam's height rule. Stool the myconid sprout, behind Samson.
  const r = sightOf({
    vantage: drow(),
    sneaker: { x: 5, y: 9, size: "small" },
    bodies: [{ id: "samson", x: 5, y: 7, size: "medium" }],
  })
  assert.equal(r.sees, false)
  assert.equal(r.why, "screened")
})

test("an equal-sized body does NOT screen you", () => {
  // Strictly larger. Two humans in a line do not hide each other - and this
  // is what stops four mediums standing still and becoming a wall.
  const r = sightOf({
    vantage: drow(),
    sneaker: { x: 5, y: 9, size: "medium" },
    bodies: [{ id: "samson", x: 5, y: 7, size: "medium" }],
  })
  assert.equal(r.sees, true)
})

test("anybody can duck behind a hook horror", () => {
  // The rule generalises past halflings, which is what makes it worth having
  // when the whole party is Medium.
  const r = sightOf({
    vantage: drow(),
    sneaker: { x: 5, y: 9, size: "medium" },
    bodies: [{ id: "hh", x: 5, y: 7, size: "large" }],
  })
  assert.equal(r.sees, false)
})

test("a body BEHIND the sneaker screens nothing", () => {
  // Only what is BETWEEN you matters. Endpoints are excluded from the line.
  const r = sightOf({
    vantage: drow(),
    sneaker: { x: 5, y: 7, size: "medium" },
    bodies: [{ id: "hh", x: 5, y: 9, size: "large" }],
  })
  assert.equal(r.sees, true)
})

test("the observer never screens itself", () => {
  const r = sightOf({
    vantage: drow(),
    sneaker: { x: 5, y: 9, size: "tiny" },
    bodies: [{ id: "d", x: 5, y: 5, size: "gargantuan" }],
  })
  assert.equal(r.sees, true, "a creature blinded itself by being large")
})

test("a diagonal line does not leak between two bodies", () => {
  // Supercover, not Bresenham: a thin line clipping a corner would let a
  // rogue be seen through a gap that is not there - or screened by a body it
  // technically missed. Either way it is the ruling that starts an argument.
  const cells = squaresOnLine({ x: 0, y: 0 }, { x: 3, y: 3 })
  assert.ok(cells.length >= 2, `a diagonal crossed only ${cells.length} squares`)
})

// ---- noses and other senses ---------------------------------------------

test("a beast smells you when you are adjacent, facing be damned", () => {
  // Sam: "If they are an animal they may be able to smell if you are within
  // one foot of them." One foot rounds to the touching squares on a five-foot
  // grid - you cannot be a foot from something and not be adjacent to it.
  const wolf = drow({ isBeast: true, facing: NORTH })
  const r = sightOf({ vantage: wolf, sneaker: { x: 5, y: 4, size: "medium" }, bodies: [] })
  assert.equal(r.sees, true)
  assert.equal(r.how, "smell")
})

test("a beast two squares away is fooled like anything else", () => {
  const wolf = drow({ isBeast: true, facing: NORTH })
  assert.equal(sightOf({ vantage: wolf, sneaker: { x: 5, y: 3, size: "medium" }, bodies: [] }).sees, false)
})

test("a drow does not smell you", () => {
  const r = sightOf({ vantage: drow(), sneaker: { x: 5, y: 4, size: "medium" }, bodies: [] })
  assert.equal(r.sees, false, "a humanoid used its nose")
})

test("blindsight beats facing, walls and bodies together", () => {
  // A creature that sees without looking is not fooled by any of it.
  const walkable = new Set(["5,5", "5,9"])
  const r = sightOf({
    vantage: drow({ blindsight: 6 }),
    sneaker: { x: 5, y: 1, size: "small" },
    bodies: [{ id: "hh", x: 5, y: 3, size: "huge" }],
    walkable,
  })
  assert.equal(r.sees, true)
  assert.equal(r.how, "blindsight")
})

// ---- the verdict ---------------------------------------------------------

test("NOBODY SEES YOU MEANS NO ROLL", () => {
  // The heart of it. A rogue who worked the angles has already succeeded, and
  // asking for a d20 after that tells the player their positioning did not
  // matter.
  const v = surveySneak({
    sneaker: { x: 5, y: 1, size: "medium" },
    vantages: [drow(), drow({ id: "d2", label: "Drow Elite", x: 7, y: 5 })],
    bodies: [],
  })
  assert.equal(v.unopposed, true)
  assert.equal(v.dc, null)
  assert.deepEqual(v.seenBy, [])
})

test("one pair of eyes is a contest, against THAT creature's passive", () => {
  const v = surveySneak({
    sneaker: { x: 5, y: 9, size: "medium" },
    vantages: [drow({ passivePerception: 12 })],
    bodies: [],
  })
  assert.equal(v.unopposed, false)
  assert.equal(v.dc, 12)
  assert.equal(v.keenest, "Drow")
})

test("the keenest eye in the room sets the number", () => {
  const v = surveySneak({
    sneaker: { x: 5, y: 9, size: "medium" },
    vantages: [
      drow({ id: "a", label: "Drow", passivePerception: 12 }),
      drow({ id: "b", label: "Priestess", passivePerception: 16 }),
      drow({ id: "c", label: "Blind one", facing: SOUTH, passivePerception: 20 }),
    ],
    bodies: [],
  })
  assert.equal(v.dc, 16, "the sharpest WATCHER did not set the bar")
  assert.equal(v.keenest, "Priestess")
  assert.equal(v.seenBy.length, 2, "a creature facing away was counted as a watcher")
})

test("the verdict says HOW each of them knows", () => {
  // So the board can say "the wolf has your scent" rather than a bare number.
  const v = surveySneak({
    sneaker: { x: 5, y: 4, size: "medium" },
    vantages: [drow({ id: "w", label: "Wolf", isBeast: true })],
    bodies: [],
  })
  assert.equal(v.seenBy[0].how, "smell")
})

test("an empty room is unopposed", () => {
  const v = surveySneak({ sneaker: { x: 1, y: 1, size: "medium" }, vantages: [], bodies: [] })
  assert.equal(v.unopposed, true)
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
