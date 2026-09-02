// A spawned creature is the real creature, and it lands somewhere legal.
// Run: node lib/__tests__/sandbox-spawn.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// The house style in this folder is to mirror the .ts logic in plain JS,
// because node cannot import TypeScript. A mirror can drift from what ships,
// and the part most likely to drift here is the DATA — two tables of numbers
// nobody will remember to update twice.
//
// So the tables are not mirrored. They are PARSED OUT OF THE SOURCE, and
// every assertion below runs against the values the app actually ships.
const src = readFileSync(new URL("../sandbox-spawn.ts", import.meta.url), "utf8")

function table(name) {
  const m = new RegExp(`export const ${name}: Record<string, number> = \\{([^}]*)\\}`, "m").exec(src)
  assert.ok(m, `${name} is no longer a flat Record literal — this test can no longer read it`)
  const out = {}
  for (const [, k, v] of m[1].matchAll(/(\w+):\s*([\d.]+)/g)) out[k] = Number(v)
  return out
}
const SIZE_SQUARES = table("SIZE_SQUARES")
const SIZE_SCALE = table("SIZE_SCALE")

// The logic, mirrored from sandbox-spawn.ts, but reading the tables above.
const sizeKey = (s) => { const k = String(s ?? "").trim().toLowerCase(); return k in SIZE_SQUARES ? k : "medium" }
const squaresFor = (s) => SIZE_SQUARES[sizeKey(s)]
const scaleFor = (s, cat) => (typeof cat === "number" && cat > 0 ? cat : SIZE_SCALE[sizeKey(s)])
const allegianceFor = (s) => s.allegiance ?? (s.kind === "character" ? "party" : s.kind === "npc" ? "ally" : "hostile")

function freeSquare({ want, occupied, gridWidth, gridHeight, squares = 1, blocked = [] }) {
  const n = Math.max(1, squares)
  const taken = new Set()
  for (const s of occupied) taken.add(`${s.x},${s.y}`)
  for (const s of blocked) taken.add(`${s.x},${s.y}`)
  const fits = (x, y) => {
    if (x < 0 || y < 0 || x + n > gridWidth || y + n > gridHeight) return false
    for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) if (taken.has(`${x + dx},${y + dy}`)) return false
    return true
  }
  if (fits(want.x, want.y)) return { x: want.x, y: want.y }
  const reach = Math.max(gridWidth, gridHeight)
  for (let r = 1; r <= reach; r++)
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        if (fits(want.x + dx, want.y + dy)) return { x: want.x + dx, y: want.y + dy }
      }
  return null
}

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\nsandbox spawn")

// ---- sizes ---------------------------------------------------------------

test("every SRD creature size is known", () => {
  // A size the table has never heard of silently becomes Medium, which is a
  // Gargantuan purple worm standing in one square and nobody noticing.
  for (const s of ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"]) {
    assert.equal(sizeKey(s), s.toLowerCase(), `${s} falls through to medium`)
  }
})

test("footprints match the SRD", () => {
  assert.equal(squaresFor("Medium"), 1)
  assert.equal(squaresFor("Large"), 2)      // 10 ft
  assert.equal(squaresFor("Huge"), 3)       // 15 ft
  assert.equal(squaresFor("Gargantuan"), 4) // 20 ft
  // Tiny occupies a full square here even though the SRD lets Tiny creatures
  // share one - the board has no notion of sharing, and pretending otherwise
  // would let two things stand on one square everywhere else in the code.
  assert.equal(squaresFor("Tiny"), 1)
})

test("size is read however a catalogue spelled it", () => {
  // bestiary.size is "Medium"; characters.size is lowercase in places.
  assert.equal(squaresFor("large"), 2)
  assert.equal(squaresFor("  LARGE "), 2)
})

test("an unknown size falls back to medium rather than crashing", () => {
  assert.equal(squaresFor("Colossal"), 1)
  assert.equal(squaresFor(null), 1)
  assert.equal(squaresFor(undefined), 1)
})

// ---- scale ---------------------------------------------------------------

test("the scale ladder rises with size and never inverts", () => {
  const order = ["tiny", "small", "medium", "large", "huge", "gargantuan"]
  for (let i = 1; i < order.length; i++) {
    assert.ok(SIZE_SCALE[order[i]] > SIZE_SCALE[order[i - 1]],
      `${order[i]} is not drawn larger than ${order[i - 1]}`)
  }
})

test("the ladder still agrees with the hand-tuned live tokens", () => {
  // These are the numbers somebody actually measured against the board:
  // Kenta/Samson/Scott (medium) 1.0, Hook Horror (large) 1.6, the small
  // NPCs 0.60. If the ladder drifts from them, spawns stop matching the
  // creatures already standing next to them.
  assert.equal(SIZE_SCALE.medium, 1.0)
  assert.equal(SIZE_SCALE.large, 1.6)
  assert.equal(SIZE_SCALE.small, 0.6)
})

test("a measured catalogue scale beats the default ladder", () => {
  // Somebody sized that model against the board. A table of guesses must
  // never overrule a measurement.
  assert.equal(scaleFor("Medium", 1.3), 1.3)   // Prince Derendil
  assert.equal(scaleFor("Small", 0.43), 0.43)  // Stool
  // ...but a null/zero/absent one falls through to the ladder.
  assert.equal(scaleFor("Medium", null), 1.0)
  assert.equal(scaleFor("Medium", 0), 1.0)
  assert.equal(scaleFor("Medium", undefined), 1.0)
})

// ---- sides ---------------------------------------------------------------

test("the bestiary is a monster manual", () => {
  assert.equal(allegianceFor({ kind: "bestiary", id: "x", label: "Drow" }), "hostile")
})

test("a player character is always party", () => {
  assert.equal(allegianceFor({ kind: "character", id: "x", label: "Kenta" }), "party")
})

test("an explicit allegiance always wins", () => {
  // A drow can be spawned as an ally - that is half the point of a sandbox.
  assert.equal(allegianceFor({ kind: "bestiary", id: "x", label: "Drow", allegiance: "ally" }), "ally")
  assert.equal(allegianceFor({ kind: "character", id: "x", label: "Kenta", allegiance: "hostile" }), "hostile")
})

test("the three words are the board's own three words", () => {
  // vtt_tokens.allegiance on the live map holds exactly party/ally/hostile.
  // A fourth word here would render as nothing and side with nobody.
  const words = new Set(["party", "ally", "hostile"])
  for (const kind of ["bestiary", "npc", "character"]) {
    assert.ok(words.has(allegianceFor({ kind, id: "x", label: "x" })), `${kind} invented a side`)
  }
})

// ---- placement -----------------------------------------------------------

const G = { gridWidth: 12, gridHeight: 12 }

test("an empty square is the square you asked for", () => {
  assert.deepEqual(freeSquare({ ...G, want: { x: 5, y: 5 }, occupied: [] }), { x: 5, y: 5 })
})

test("an occupied square pushes to a neighbour, not to an error", () => {
  const at = freeSquare({ ...G, want: { x: 5, y: 5 }, occupied: [{ x: 5, y: 5 }] })
  assert.ok(at, "refused a placement it could have satisfied")
  assert.equal(Math.max(Math.abs(at.x - 5), Math.abs(at.y - 5)), 1, "did not take the NEAREST free square")
})

test("nothing is ever stacked on something else", () => {
  // The whole reason placement is a search rather than an insert.
  const occupied = []
  for (let x = 0; x < 12; x++) for (let y = 0; y < 3; y++) occupied.push({ x, y })
  const at = freeSquare({ ...G, want: { x: 6, y: 1 }, occupied })
  assert.ok(at)
  assert.ok(!occupied.some((o) => o.x === at.x && o.y === at.y), "landed on top of somebody")
})

test("a Large creature needs the whole 2x2 clear", () => {
  // The bug this prevents: a hook horror placed with one of its four squares
  // inside a drow, which then cannot be targeted or moved out of.
  const occupied = [{ x: 6, y: 5 }]
  const at = freeSquare({ ...G, want: { x: 5, y: 4 }, occupied, squares: 2 })
  assert.ok(at)
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
    assert.ok(!occupied.some((o) => o.x === at.x + dx && o.y === at.y + dy), "footprint overlaps an occupant")
  }
})

test("a footprint never hangs off the edge of the board", () => {
  // Asking for the far corner with a Gargantuan selected.
  const at = freeSquare({ ...G, want: { x: 11, y: 11 }, occupied: [], squares: 4 })
  assert.ok(at, "found no room on an empty 12x12 for a 4x4")
  assert.ok(at.x >= 0 && at.y >= 0 && at.x + 4 <= 12 && at.y + 4 <= 12, "hangs off the board")
})

test("walls are as solid as bodies", () => {
  const blocked = [{ x: 5, y: 5 }, { x: 5, y: 4 }, { x: 4, y: 5 }, { x: 4, y: 4 }]
  const at = freeSquare({ ...G, want: { x: 5, y: 5 }, occupied: [], blocked })
  assert.ok(at)
  assert.ok(!blocked.some((b) => b.x === at.x && b.y === at.y), "spawned inside a wall")
})

test("a genuinely full board answers null instead of lying", () => {
  // The caller has to handle this. Returning {0,0} would put the creature
  // somewhere real-looking and wrong.
  const occupied = []
  for (let x = 0; x < 12; x++) for (let y = 0; y < 12; y++) occupied.push({ x, y })
  assert.equal(freeSquare({ ...G, want: { x: 5, y: 5 }, occupied }), null)
})

test("a board with no room for a BIG creature also answers null", () => {
  // Room for a medium, none for a huge: the check is the footprint, not the
  // square count.
  const occupied = []
  for (let x = 0; x < 12; x++) for (let y = 0; y < 12; y++) if (!(x === 0 && y === 0)) occupied.push({ x, y })
  assert.deepEqual(freeSquare({ ...G, want: { x: 5, y: 5 }, occupied }), { x: 0, y: 0 })
  assert.equal(freeSquare({ ...G, want: { x: 5, y: 5 }, occupied, squares: 2 }), null)
})

// ---- the payload ---------------------------------------------------------

test("model_url is deliberately never set", () => {
  // The board falls back to the SPECIES model, then to a pawn. Copying the
  // URL onto the token would freeze each spawn at the art that existed the
  // moment it was placed - so a bestiary row that grows a model later would
  // never reach the creatures already standing on the board.
  const payload = /export function spawnPayload[\s\S]*?\n\}/.exec(src)
  assert.ok(payload, "spawnPayload is no longer findable in the source")
  assert.ok(!/model_url/.test(payload[0]), "spawnPayload now sets model_url — read the comment above it first")
})

test("hp arrives full, at both ends of the bar", () => {
  const body = /export function spawnPayload[\s\S]*?\n\}/.exec(src)[0]
  assert.ok(/hp_current: hp/.test(body) && /hp_max: hp/.test(body),
    "a spawn no longer arrives at full health")
})

test("every spawn is stamped as a rehearsal row", () => {
  // "sandbox-spawn" is what makes a sweep safe: it is how the clear verb
  // knows which rows it put there and which were seeded by hand.
  assert.ok(/updated_by: "sandbox-spawn"/.test(src), "spawns are no longer stamped")
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
