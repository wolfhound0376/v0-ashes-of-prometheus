// THROWING, checked without a board.
//
// Two jobs here. The first is the arithmetic: how far a thing carries, and
// whether the square you clicked is inside that. The second — and the reason
// this file reads the TypeScript source as well as importing it — is that the
// SRD ranges must not be quietly edited into something more convenient. A
// dagger goes 20/60 because the book says 20/60, and if a future turn changes
// that number the assertion that catches it should say so in the book's terms
// rather than in a bundled function's.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const out = mkdtempSync(join(tmpdir(), "throw-"))
const bundle = join(out, "t.mjs")
execFileSync(process.env.ESBUILD || "esbuild",
  ["lib/throwing.ts", "--bundle", "--format=esm", "--platform=neutral", "--outfile=" + bundle],
  { stdio: "inherit" })
const { throwRangeFor, canThrow, distanceFt, FEET_PER_SQUARE, TOO_HEAVY_LB } =
  await import(pathToFileURL(bundle).href)

const src = readFileSync("lib/throwing.ts", "utf8")

// ── THE CONSTANTS, READ OFF THE SOURCE ───────────────────────────────────────
// Not re-typed here: pulled out of the file, so the test cannot drift away
// from the thing it is testing the way a copied number would.
const num = (name) => {
  const m = src.match(new RegExp("const " + name + " = (\\d+)"))
  assert.ok(m, name + " must be a plain number in the source")
  return Number(m[1])
}
assert.equal(FEET_PER_SQUARE, num("FEET_PER_SQUARE"))
assert.equal(FEET_PER_SQUARE, 5, "the board is a five-foot grid; everything else assumes it")
assert.equal(TOO_HEAVY_LB, num("TOO_HEAVY_LB"))

// Every entry in the THROWN table, parsed out and checked against the SRD.
const table = Object.fromEntries(
  Array.from(src.matchAll(/\{ match: \/\\b([a-z ]+)[|\\\/][^}]*normal: (\d+), long: (\d+) \}/gi))
    .map((m) => [m[1].trim(), [Number(m[2]), Number(m[3])]]),
)
for (const [name, want] of Object.entries({
  dart: [20, 60],
  dagger: [20, 60],
  handaxe: [20, 60],
  javelin: [30, 120],
  spear: [20, 60],
  net: [5, 15],
})) {
  assert.deepEqual(table[name], want, name + " throws " + want[0] + "/" + want[1] + " in the SRD")
}

// ── DISTANCE ────────────────────────────────────────────────────────────────
// Chebyshev, the same diagonal the rest of the board counts with: a two-square
// diagonal is 10 ft, not 14.
assert.equal(distanceFt({ x: 4, y: 6 }, { x: 4, y: 6 }), 0)
assert.equal(distanceFt({ x: 4, y: 6 }, { x: 4, y: 10 }), 20)
assert.equal(distanceFt({ x: 4, y: 6 }, { x: 6, y: 8 }), 10, "diagonals cost one square here")

// ── RANGE ───────────────────────────────────────────────────────────────────
{
  const dagger = throwRangeFor("Dagger")
  assert.equal(dagger.known, true, "the book has a dagger")
  assert.deepEqual([dagger.normal, dagger.long], [20, 60])

  // Names arrive from a catalogue, not a dropdown: "Silvered Dagger +1" is
  // still a dagger.
  assert.equal(throwRangeFor("Silvered Dagger +1").normal, 20, "an adorned dagger is a dagger")
  assert.equal(throwRangeFor("Javelin of Lightning").long, 120)

  // Nothing the book covers: the general ruling.
  const lantern = throwRangeFor("Hooded Lantern", 2)
  assert.equal(lantern.known, false)
  assert.ok(lantern.normal > 0 && lantern.long > lantern.normal)

  // Weight tells against it, and the scale is monotonic — heavier is never
  // further — which is the property that matters, not the exact feet.
  const light = throwRangeFor("Crate", 5).long
  const middling = throwRangeFor("Crate", 40).long
  const heavy = throwRangeFor("Crate", 55).long
  assert.ok(light >= middling && middling >= heavy, light + " >= " + middling + " >= " + heavy)
  assert.ok(heavy >= 5, "even a heavy thing can be shoved a square")

  // Squares are squares: a range is always a whole number of them.
  for (const w of [1, 12, 25, 33, 47, 59]) {
    const r = throwRangeFor("Crate", w)
    assert.equal(r.normal % FEET_PER_SQUARE, 0, "normal range at " + w + " lb is a whole square")
    assert.equal(r.long % FEET_PER_SQUARE, 0, "long range at " + w + " lb is a whole square")
  }

  // A weapon's own range beats the weight ruling: a spear is 20/60 whether or
  // not the catalogue bothered to record what it weighs.
  assert.deepEqual(
    [throwRangeFor("Spear", 30).normal, throwRangeFor("Spear", 30).long],
    [20, 60],
    "the SRD table wins over the general ruling",
  )
}

// ── THE VERDICT ─────────────────────────────────────────────────────────────
{
  const from = { x: 5, y: 5 }

  // Comfortably inside: no fuss.
  const near = canThrow({ from, to: { x: 7, y: 5 }, name: "Dagger" })
  assert.equal(near.ok, true)
  assert.equal(near.longRange, false)
  assert.equal(near.distanceFt, 10)

  // Past 20 ft, inside 60: allowed, and the caller is told, because that is
  // disadvantage on the attack path and worth saying in the log.
  const far = canThrow({ from, to: { x: 5, y: 12 }, name: "Dagger" })
  assert.equal(far.ok, true)
  assert.equal(far.longRange, true, "35 ft is past a dagger's normal range")

  // Past 60: no.
  const tooFar = canThrow({ from, to: { x: 5, y: 25 }, name: "Dagger" })
  assert.equal(tooFar.ok, false)
  assert.match(tooFar.reason, /range/)

  // Your own square is a drop, and saying so is more useful than refusing.
  const here = canThrow({ from, to: { ...from }, name: "Dagger" })
  assert.equal(here.ok, false)
  assert.match(here.reason, /drop/)

  // Too heavy to leave the hand at all.
  const anvil = canThrow({ from, to: { x: 6, y: 5 }, name: "Anvil", weightLb: TOO_HEAVY_LB + 1 })
  assert.equal(anvil.ok, false)
  assert.match(anvil.reason, /heavy/)
  // And exactly at the limit it still goes, so the boundary is not a surprise.
  assert.equal(canThrow({ from, to: { x: 6, y: 5 }, name: "Anvil", weightLb: TOO_HEAVY_LB }).ok, true)

  // A missing name is not a crash. Rows arrive from a catalogue that has been
  // wrong before; an unnamed thing gets the general ruling and moves on.
  assert.equal(canThrow({ from, to: { x: 6, y: 5 } }).ok, true)
  assert.equal(canThrow({ from, to: { x: 6, y: 5 }, name: null, weightLb: null }).ok, true)
}

console.log("throwing: ok")
