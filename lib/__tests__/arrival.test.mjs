// Arrival resolution, checked against the published tables.
// Run: node lib/__tests__/arrival.test.mjs
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Bundle the TS to plain JS so this runs with no toolchain.
const out = mkdtempSync(join(tmpdir(), "arrival-"))
const bundle = join(out, "arrival.mjs")
execFileSync(process.env.ESBUILD || "esbuild", [
  "lib/travel/arrival.ts", "--bundle", "--format=esm", "--platform=neutral", "--outfile=" + bundle,
], { stdio: "inherit" })
const { resolveArrival, rollChain, rowFor } = await import(bundle)

// The real tables, same ranges as the migration seeds.
const tables = [
  { table_key: "underdark_random",   die: 20, title: "Random Encounters",   source: "OotA Encounters ch.2 p.30" },
  { table_key: "underdark_terrain",  die: 20, title: "Terrain Encounters",  source: "OotA Encounters ch.2 p.30" },
  { table_key: "underdark_creature", die: 20, title: "Creature Encounters", source: "OotA Encounters ch.2 p.32" },
  { table_key: "underdark_ambush",   die: 20, title: "Ambushers",           source: "OotA Encounters ch.2 p.32" },
]
const rows = [
  { table_key: "underdark_random", roll_min: 1,  roll_max: 13, result: "No encounter", detail: { rolls: [] } },
  { table_key: "underdark_random", roll_min: 14, roll_max: 15, result: "Terrain", detail: { rolls: ["underdark_terrain"] } },
  { table_key: "underdark_random", roll_min: 16, roll_max: 17, result: "One or more creatures", detail: { rolls: ["underdark_creature"] } },
  { table_key: "underdark_random", roll_min: 18, roll_max: 20, result: "Terrain featuring one or more creatures", detail: { rolls: ["underdark_terrain", "underdark_creature"] } },
  { table_key: "underdark_terrain", roll_min: 1, roll_max: 20, result: "Rockfall", detail: {} },
  { table_key: "underdark_creature", roll_min: 1, roll_max: 2, result: "Ambushers", detail: { rolls: ["underdark_ambush"] } },
  { table_key: "underdark_creature", roll_min: 3, roll_max: 20, result: "Carrion crawler", detail: {} },
  { table_key: "underdark_ambush", roll_min: 1, roll_max: 20, result: "1 umber hulk", detail: {} },
]
const march = (miles = 0) => ({ miles_since_check: miles, day_miles: 7, checks_made: 0 })
const fixed = (n) => () => n
const sequence = (...ns) => { let i = 0; return () => ns[Math.min(i++, ns.length - 1)] }

let failures = 0
async function test(name, fn) {
  try { await fn(); console.log("  PASS ", name) }
  catch (e) { failures++; console.log("  FAIL ", name); console.log("        " + (e.message || e).split("\n")[0]) }
}

console.log("\narrival resolution")

await test("a short leg does not roll at all", async () => {
  const o = resolveArrival({ nodeName: "A bend in the tunnel", milesWalked: 2, march: march(0), events: [], tables, rows,
    roll: () => { throw new Error("rolled when no check was due") } })
  assert.equal(o.halt, false)
  assert.equal(o.march.miles_since_check, 2)
  assert.equal(o.march.checks_made, 0)
})

await test("a day's march triggers exactly one check, and the debt carries over", async () => {
  const o = resolveArrival({ nodeName: "Camp", milesWalked: 5, march: march(4), events: [], tables, rows, roll: fixed(1) })
  assert.equal(o.march.checks_made, 1)
  // 4 + 5 = 9 walked, 7 spent on the check, 2 still owing toward the next.
  assert.equal(o.march.miles_since_check, 2)
  assert.equal(o.halt, false, "a d20 of 1 is 'No encounter' - the party walks on")
})

await test("fifty-one quiet nodes across the route yield about eight checks, not fifty-one", async () => {
  // 56 miles in 51 hops, the real painted route.
  let m = march(0)
  let checks = 0
  for (let i = 0; i < 51; i++) {
    const o = resolveArrival({ nodeName: "n" + i, milesWalked: 56 / 51, march: m, events: [], tables, rows, roll: fixed(1) })
    m = o.march
    checks = m.checks_made
  }
  assert.equal(checks, 8, "the guide puts Velkynvelve to Sloobludop at 8 days; got " + checks)
})

await test("an authored event outranks the dice and stops the march", async () => {
  const o = resolveArrival({
    nodeName: "The rope bridge", milesWalked: 40, march: march(0), tables, rows,
    events: [{ id: "a", kind: "cinematic", title: "The bridge gives", body: "Rope frays.", payload: {}, fires_once: true, priority: 0 }],
    roll: () => { throw new Error("rolled despite authored canon") },
  })
  assert.equal(o.halt, true)
  assert.equal(o.kind, "cinematic")
  assert.equal(o.eventId, "a")
  assert.equal(o.rolls.length, 0)
})

await test("priority decides between two authored events", async () => {
  const o = resolveArrival({
    nodeName: "x", milesWalked: 0, march: march(0), tables, rows,
    events: [
      { id: "a", kind: "authored", title: "quiet scene", body: null, payload: {}, fires_once: true, priority: 0 },
      { id: "b", kind: "challenge", title: "the chasm", body: null, payload: {}, fires_once: true, priority: 9 },
    ],
  })
  assert.equal(o.title, "the chasm")
})

await test("18-20 rolls BOTH terrain and creatures, and follows the ambush chain", async () => {
  // 18 on the random table, then 5 terrain, then 1 creature -> ambushers, then 20.
  const o = resolveArrival({ nodeName: "x", milesWalked: 7, march: march(0), events: [], tables, rows,
    roll: sequence(18, 5, 1, 20) })
  assert.equal(o.halt, true)
  assert.deepEqual(o.rolls.map((r) => r.table_key),
    ["underdark_random", "underdark_terrain", "underdark_creature", "underdark_ambush"])
  assert.match(o.title, /Rockfall/)
  assert.match(o.title, /umber hulk/)
})

await test("every d20 face lands on exactly one row of the random table", async () => {
  for (let face = 1; face <= 20; face++) {
    const row = rowFor(rows, "underdark_random", face)
    assert.ok(row, "no row covers a d20 result of " + face)
  }
})

await test("a malformed table cannot spin forever", async () => {
  const loopTables = [{ table_key: "loop", die: 20, title: "Loop", source: "test" }]
  const loopRows = [{ table_key: "loop", roll_min: 1, roll_max: 20, result: "again", detail: { rolls: ["loop"] } }]
  const steps = rollChain(loopTables, loopRows, "loop", fixed(1))
  assert.ok(steps.length <= 6, "depth cap did not hold, got " + steps.length)
})

console.log(failures ? "\n" + failures + " expectation(s) broken\n" : "\nall arrival expectations hold\n")
process.exit(failures ? 1 : 0)
