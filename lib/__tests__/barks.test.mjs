// A bark that fires every time is not a bark, it is noise.
// Run: node lib/__tests__/barks.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const src = readFileSync(new URL("../barks.ts", import.meta.url), "utf8")

// lib/barks.ts, as implemented.
const BARKS = {}
{
  const body = src.slice(src.indexOf("const BARKS"), src.indexOf("/** Every creature that has anything to say. */"))
  for (const m of body.matchAll(/^  (?:"([^"]+)"|([a-z]+)):\s*\[([\s\S]*?)\],$/gm)) {
    const key = m[1] ?? m[2]
    BARKS[key] = [...m[3].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((l) => l[1])
  }
}
const BARKING = Object.keys(BARKS)
const BARK_EVERY = 3
const hashOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
function barkKeyFor(label) {
  const name = String(label ?? "").trim().toLowerCase()
  if (!name) return null
  if (BARKS[name]) return name
  const byLength = BARKING.slice().sort((a, b) => b.length - a.length)
  return byLength.find((k) => name.includes(k)) ?? null
}
function barkFor(label, round) {
  const key = barkKeyFor(label)
  if (!key || !Number.isFinite(round) || round < 1) return null
  const lines = BARKS[key]
  if (!lines.length) return null
  const seed = hashOf(String(label))
  if ((round + (seed % BARK_EVERY)) % BARK_EVERY !== 0) return null
  const step = Math.floor((round + (seed % BARK_EVERY)) / BARK_EVERY)
  return lines[(step + (seed % lines.length)) % lines.length]
}

const RECORDED = new Set(["drow", "prince derendil", "jimjar"])
function barkAudioFor(speaker, text) {
  const key = barkKeyFor(speaker)
  if (!key || !RECORDED.has(key)) return null
  const i = BARKS[key].indexOf(String(text ?? "").trim())
  if (i < 0) return null
  return `barks/${key.replace(/\s+/g, "-")}_${i}`
}

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\nbarks")

test("the three Sam named all have something to say", () => {
  for (const who of ["Drow", "Prince Derendil", "Jimjar"]) {
    const said = [1,2,3,4,5,6,7,8,9].map((r) => barkFor(who, r)).filter(Boolean)
    assert.ok(said.length > 0, `${who} never speaks`)
  }
})

test("nobody speaks every round — that would be noise", () => {
  for (const who of BARKING) {
    const rounds = [1,2,3,4,5,6,7,8,9]
    const spoke = rounds.filter((r) => barkFor(who, r)).length
    assert.ok(spoke <= rounds.length / BARK_EVERY, `${who} speaks ${spoke}/9 rounds`)
    assert.ok(spoke >= 2, `${who} speaks only ${spoke}/9 rounds`)
  }
})

test("a creature never says the same thing twice running", () => {
  for (const who of BARKING) {
    const said = Array.from({ length: 60 }, (_, i) => barkFor(who, i + 1)).filter(Boolean)
    for (let i = 1; i < said.length; i++) {
      assert.notEqual(said[i], said[i - 1], `${who} repeated "${said[i]}"`)
    }
  }
})

test("a creature eventually uses its whole repertoire", () => {
  for (const who of BARKING) {
    const said = new Set(Array.from({ length: 120 }, (_, i) => barkFor(who, i + 1)).filter(Boolean))
    assert.equal(said.size, BARKS[barkKeyFor(who)].length, `${who} never uses all its lines`)
  }
})

test("the roster does not speak in one voice on one round", () => {
  // With three phases a given PAIR may legitimately share one — that is what
  // a hash does. What must not happen is the whole room speaking together and
  // then falling silent together, which is the thing that reads as canned.
  const phases = new Set(BARKING.map((who) => {
    for (let r = 1; r <= BARK_EVERY; r++) if (barkFor(who, r)) return r
    return -1
  }))
  assert.ok(phases.size > 1, `every creature speaks on the same round (${[...phases]})`)
  // And no single round carries the entire roster.
  for (let r = 1; r <= 9; r++) {
    const speaking = BARKING.filter((who) => barkFor(who, r)).length
    assert.ok(speaking < BARKING.length, `round ${r}: all ${speaking} speak at once`)
  }
})

test("the longest key wins — an elite is not just a drow", () => {
  assert.equal(barkKeyFor("Drow Elite Warrior"), "drow elite warrior")
  assert.equal(barkKeyFor("Drow Priestess of Lolth"), "drow priestess of lolth")
  assert.equal(barkKeyFor("Drow"), "drow")
})

test("a creature with nothing written stays silent", () => {
  // Silence is correct for anything unwritten. A generic pool would put the
  // same three lines in every mouth on the board.
  assert.equal(barkFor("Hook Horror", 3), null)
  assert.equal(barkFor("Giant Spider", 6), null)
  assert.equal(barkFor("", 3), null)
  assert.equal(barkFor(null, 3), null)
})

test("round zero and nonsense rounds say nothing", () => {
  assert.equal(barkFor("Jimjar", 0), null)
  assert.equal(barkFor("Jimjar", -4), null)
  assert.equal(barkFor("Jimjar", NaN), null)
})

test("every line is short enough to read between dice", () => {
  for (const [who, lines] of Object.entries(BARKS)) {
    for (const l of lines) assert.ok(l.length <= 60, `${who}: "${l}" is ${l.length} chars`)
  }
})

test("a recorded line resolves to the file that was cut for it", () => {
  // The index IS the filename — that is how the twelve files were split and
  // named, so an off-by-one here is a drow saying the wrong sentence aloud.
  assert.equal(barkAudioFor("Drow", BARKS["drow"][0]), "barks/drow_0")
  assert.equal(barkAudioFor("Drow", BARKS["drow"][3]), "barks/drow_3")
  assert.equal(barkAudioFor("Jimjar", BARKS["jimjar"][2]), "barks/jimjar_2")
  assert.equal(
    barkAudioFor("Prince Derendil", BARKS["prince derendil"][1]),
    "barks/prince-derendil_1",
  )
})

test("every recorded creature has a file for every one of its lines", () => {
  // A half-recorded creature would speak aloud on one round and silently on
  // the next, which is worse than staying quiet.
  for (const key of RECORDED) {
    assert.ok(BARKS[key], `${key} is marked recorded but has no lines`)
    BARKS[key].forEach((line, i) => {
      assert.equal(barkAudioFor(key, line), `barks/${key.replace(/\s+/g, "-")}_${i}`)
    })
  }
})

test("an unrecorded creature stays a printed line", () => {
  assert.equal(barkAudioFor("Buppido", BARKS["buppido"][0]), null)
  assert.equal(barkAudioFor("Ront", BARKS["ront"][0]), null)
  // The elite has its OWN lines and its own key, so it must not borrow the
  // plain drow's recordings and say something it never said.
  assert.equal(barkAudioFor("Drow Elite Warrior", BARKS["drow elite warrior"][0]), null)
})

test("a line that is not a bark plays nothing", () => {
  assert.equal(barkAudioFor("Drow", "Drow hits Fifi with Shortsword for 5 damage."), null)
  assert.equal(barkAudioFor("Drow", ""), null)
  assert.equal(barkAudioFor(null, null), null)
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
