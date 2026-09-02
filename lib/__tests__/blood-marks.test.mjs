// Blood on the tiles: when a mark is laid, how big, and that the shape is
// the same on every screen.
//
// Run:  node --test lib/__tests__/blood-marks.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, "..", "blood-marks.ts")
const out = join(mkdtempSync(join(tmpdir(), "blood-marks-")), "blood-marks.mjs")
const esbuild = process.env.ESBUILD ?? "npx esbuild"
execSync(`${esbuild} "${src}" --format=esm --platform=neutral --outfile="${out}"`, { stdio: "pipe" })
const bm = await import(pathToFileURL(out).href)

test("a melee blow that drops someone bleeds; a spell that drops someone does not", () => {
  assert.equal(bm.bleeds({ melee: true, amount: 9, fell: true, bleeding: false }), true)
  assert.equal(bm.bleeds({ melee: false, amount: 9, fell: true, bleeding: false }), false)
})

test("a melee blow on someone tagged Bleeding bleeds even when they stay up", () => {
  assert.equal(bm.bleeds({ melee: true, amount: 3, fell: false, bleeding: true }), true)
  assert.equal(bm.bleeds({ melee: true, amount: 3, fell: false, bleeding: false }), false)
})

test("no damage, no blood", () => {
  assert.equal(bm.bleeds({ melee: true, amount: 0, fell: false, bleeding: true }), false)
})

test("a drop is a small pool; a bleeding hit scales with damage and never fills a square", () => {
  const drop = bm.poolSize({ amount: 4, fell: true })
  const nick = bm.poolSize({ amount: 2, fell: false })
  const axe = bm.poolSize({ amount: 40, fell: false })
  assert.ok(drop > nick, "a drop pools more than a nick")
  assert.ok(axe > nick, "a heavier blow pools more")
  assert.ok(bm.poolSize({ amount: 999, fell: true }) < 1, "never a whole square")
})

test("marks are deterministic from their id and de-duplicated by it", () => {
  const a = bm.makeMark({ x: 3, y: 4, size: 0.3, at: "2026-09-02T10:00:00Z", salt: "kenta" })
  const b = bm.makeMark({ x: 3, y: 4, size: 0.3, at: "2026-09-02T10:00:00Z", salt: "kenta" })
  assert.equal(a.id, b.id)
  assert.equal(a.seed, b.seed)
  assert.deepEqual(bm.placement(a.seed), bm.placement(b.seed))
  assert.equal(bm.appendMark([a], b).length, 1)
})

test("the cap drops the oldest", () => {
  let marks = []
  for (let i = 0; i < 5; i++) {
    marks = bm.appendMark(marks, bm.makeMark({ x: i, y: 0, size: 0.3, at: `t${i}`, salt: "s" }), 3)
  }
  assert.deepEqual(marks.map((m) => m.x), [2, 3, 4])
})

test("normaliseMarks keeps only well-formed blood marks", () => {
  const good = bm.makeMark({ x: 1, y: 1, size: 0.3, at: "t", salt: "s" })
  const raw = [good, { id: "x", kind: "blood", x: "1", y: 1 }, null, { id: "y", kind: "fire", x: 1, y: 1 }, "junk"]
  assert.deepEqual(bm.normaliseMarks(raw), [good])
  assert.deepEqual(bm.normaliseMarks(undefined), [])
})

test("placement stays inside the square", () => {
  for (const seed of [0, 1, 12345, 0xffffffff, bm.seedFrom("kenta")]) {
    const p = bm.placement(seed)
    assert.ok(Math.abs(p.dx) <= 0.18 && Math.abs(p.dz) <= 0.18)
    assert.ok(p.stretch >= 0.85 && p.stretch <= 1.15)
  }
})
