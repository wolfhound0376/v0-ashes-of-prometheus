import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const route = readFileSync("app/api/chat/route.ts", "utf8")

// The journal tag shipped broken once because the prompt has TWO places a tag
// has to be declared - the numbered rules AND the STRUCTURED TAGS catalogue -
// and only one was edited. The model imitates the catalogue, so a tag that
// appears in the rules alone is never emitted. These tests exist so that
// mistake cannot be made silently again.

test("[FLAG] is declared in the numbered rules", () => {
  const rules = route.slice(0, route.indexOf("STRUCTURED TAGS"))
  assert.match(rules, /WORLD FLAGS:/)
  assert.match(rules, /\[FLAG: <key>\]/)
})

test("[FLAG] is declared in the STRUCTURED TAGS catalogue", () => {
  const catalogue = route.slice(route.indexOf("STRUCTURED TAGS"))
  assert.match(catalogue, /WORLD FLAGS:/)
  assert.match(catalogue, /\[FLAG: pen-door-open\]/)
})

test("every flag the prompt teaches is one the parser accepts", () => {
  const allowed = new Set(
    (route.match(/const KNOWN_FLAGS = new Set\(\[(.*?)\]\)/s)?.[1] ?? "")
      .match(/"([a-z0-9-]+)"/g)?.map((s) => s.replaceAll('"', "")) ?? [],
  )
  assert.ok(allowed.size > 0, "KNOWN_FLAGS should not be empty")
  // Any key named in the catalogue must be one the server will actually write,
  // or Malachar emits a tag that is silently dropped - the worst failure mode,
  // because the prose says the door opened and nothing changes.
  const taught = [...route.matchAll(/\[FLAG: ([a-z0-9-]+)\]/g)].map((m) => m[1])
  assert.ok(taught.length > 0, "the catalogue should show at least one example")
  for (const key of taught) assert.ok(allowed.has(key), `prompt teaches unknown flag: ${key}`)
})

test("the FLAG tag is stripped from what the player sees", () => {
  assert.match(route, /\.replace\(\/\\\[FLAG:\[\^\\\]\]\*\\\]\/gi, ""\)/)
})
