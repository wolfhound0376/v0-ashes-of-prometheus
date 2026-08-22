// Every tag the route PARSES must be documented where the model will read it.
//
// This exists because of a real miss: [JOURNAL: ...] was added to the numbered
// rules, the parser, and the strip list — but not to the STRUCTURED TAGS
// catalogue, which is the section with formats and examples that the model
// actually imitates. The result looked like a working feature and emitted
// nothing. A tag the code can read but the model was never shown is dead.
//
// WHAT THIS CANNOT DO: prove the model will actually comply. [JOURNAL] was in
// the numbered rules and still never fired; what changed it was moving it into
// the catalogue beside a worked example. No test can assert obedience. These
// only catch the mechanical failures — a tag never taught, or a tag taught and
// never stripped — and the route logs a per-turn tag scan for the rest.
//
// Run: node lib/__tests__/prompt-tags-documented.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const src = readFileSync("app/api/chat/route.ts", "utf8")

// Tags the route parses out of the model's reply.
const parsed = new Set()
for (const m of src.matchAll(/rawText\s*\.?\s*match(?:All)?\(\s*\/\\\[([A-Z_]+)/g)) parsed.add(m[1])
for (const m of src.matchAll(/matchAll\(\/\\\[([A-Z_]+)_?[A-Z]*:/g)) parsed.add(m[1])

// The catalogue the model reads: the block headed "STRUCTURED TAGS".
const catalogueStart = src.indexOf("STRUCTURED TAGS")
assert.ok(catalogueStart > 0, "the STRUCTURED TAGS catalogue has moved or been renamed — this test needs updating")
const catalogue = src.slice(catalogueStart, catalogueStart + 12000)

let failures = 0
const test = (name, fn) => {
  try { fn(); console.log("  PASS ", name) }
  catch (e) { failures++; console.log("  FAIL ", name); console.log("        " + String(e.message).split("\n")[0]) }
}

console.log("\nprompt tags are documented where the model reads them")

test("the catalogue documents [JOURNAL: ...] with an example", () => {
  assert.ok(/\[JOURNAL:/.test(catalogue), "JOURNAL is parsed by the route but absent from STRUCTURED TAGS")
  assert.ok(/Example:\s*\[JOURNAL:/.test(catalogue), "JOURNAL has no worked example; the model imitates examples")
})

test("every tag the route parses is taught somewhere in the prompt", () => {
  // Deliberately NOT "must be in the catalogue". Four tags — NPC_SPEECH,
  // NPC_DAMAGE, NPC_DISPOSITION, CINEMATIC — are taught in their own sections
  // and fire perfectly well, so demanding the catalogue would be a false rule.
  // What must never happen is a tag the code can read and the model was never
  // told about at all: that is a feature that silently does nothing.
  const instructional = src
    .split("\n")
    .filter((l) => !/\.match\(|\.matchAll\(|\.replace\(/.test(l))
    .join("\n")
  const undocumented = [...parsed].filter((tag) => !instructional.includes("[" + tag))
  assert.deepEqual(undocumented, [], "parsed by the route, never taught to the model: " + undocumented.join(", "))
})

test("the strip list covers every tag the catalogue teaches", () => {
  const taught = new Set([...catalogue.matchAll(/\[([A-Z][A-Z_]*):/g)].map((m) => m[1]))
  const stripBlock = src.slice(src.indexOf("Strip control tags"))
  const leaky = [...taught].filter((t) => !stripBlock.includes("\\[" + t))
  assert.deepEqual(leaky, [], "taught to the model but never stripped, so it prints at the table: " + leaky.join(", "))
})

console.log(failures ? "\n" + failures + " expectation(s) broken\n" : "\nall prompt-tag expectations hold\n")
process.exit(failures ? 1 : 0)
