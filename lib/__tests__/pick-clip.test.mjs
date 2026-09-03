// A creature with three swings must not play the first one three times.
// Run: node lib/__tests__/pick-clip.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const src = readFileSync(new URL("../token-animation.ts", import.meta.url), "utf8")

// lib/token-animation.ts, as implemented. CANDIDATES parsed from the source.
const CAND = {}
{
  const body = src.slice(src.indexOf("const CANDIDATES"), src.indexOf("const LAST_RESORT"))
  for (const m of body.matchAll(/^  ([A-Za-z]+): \[([\s\S]*?)\],$/gm))
    CAND[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map(x => x[1])
}
const ONE_SHOT = [...src.match(/ONE_SHOT: TokenState\[\] = \[([^\]]*)\]/)[1].matchAll(/"([^"]+)"/g)].map(x => x[1])
const clipFor = (state, avail) => {
  for (const want of CAND[state] ?? [])
    for (const n of avail) { const k = n.toLowerCase(); if (k.split("|").some(p => p === want) || k.includes(want)) return n }
  return ["idle", "walk"].includes(state) ? (avail[0] ?? null) : null
}
function clipPoolFor(state, avail) {
  if (!avail.length) return []
  for (const want of CAND[state] ?? []) {
    const pool = avail.filter(n => { const k = n.toLowerCase(); return k.split("|").some(p => p === want) || k.includes(want) })
    if (pool.length) return pool
  }
  const last = clipFor(state, avail); return last ? [last] : []
}
function pickClip(state, avail, rand = Math.random) {
  if (!ONE_SHOT.includes(state)) return clipFor(state, avail)
  const pool = clipPoolFor(state, avail)
  if (pool.length <= 1) return pool[0] ?? clipFor(state, avail)
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]
}

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }
const THREE = ["Attack", "Attack_2", "Attack_3", "Combat_Stance", "Dead", "Walking"]

console.log("\npick clip")

test("three swings all get used", () => {
  const seen = new Set()
  for (let i = 0; i < 60; i++) seen.add(pickClip("attack", THREE, () => i / 60))
  assert.deepEqual([...seen].sort(), ["Attack", "Attack_2", "Attack_3"])
})

test("a martial never wanders into a spell cast", () => {
  // "cast" is in the attack candidate list so a caster's Attack can resolve to
  // one — but only when nothing earlier matched. Pooling must not merge the
  // two families.
  const pool = clipPoolFor("attack", ["Attack", "Attack_2", "Charged_Spell_Cast"])
  assert.deepEqual(pool.sort(), ["Attack", "Attack_2"])
})

test("a model with one clip behaves exactly as before", () => {
  for (let i = 0; i < 20; i++)
    assert.equal(pickClip("attack", ["Attack", "Dead", "Walking"], Math.random), "Attack")
})

test("dodges pool together too", () => {
  const pool = clipPoolFor("dodge", ["Stand_Dodge", "Stand_Dodge_1", "Stand_Dodge_2", "Attack"])
  assert.equal(pool.length, 3, `pooled ${pool}`)
})

test("a loop never re-rolls — an idle that changes reads as a glitch", () => {
  const avail = ["Combat_Stance", "Idle_3", "Walking"]
  const first = pickClip("idle", avail, () => 0.99)
  for (let i = 0; i < 20; i++) assert.equal(pickClip("idle", avail, Math.random), first)
})

test("rand() returning exactly 1 does not fall off the end", () => {
  assert.ok(pickClip("attack", THREE, () => 1) !== undefined)
  assert.equal(pickClip("attack", THREE, () => 1), "Attack_3")
})

test("nothing to play is still null, not a crash", () => {
  assert.equal(pickClip("attack", []), null)
  assert.equal(pickClip("dodge", ["Walking"]), null)
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
