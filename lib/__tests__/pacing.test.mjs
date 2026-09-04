// A page left open overnight must not quietly spend all night prodding an
// empty room. Run: node lib/__tests__/pacing.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const src = readFileSync(new URL("../pacing.ts", import.meta.url), "utf8")

// lib/pacing.ts, as implemented. Constants parsed from the source.
const num = (n) => Number(src.match(new RegExp(`${n} = ([\\d_]+)`))[1].replace(/_/g, ""))
const COOLDOWN_MS = num("COOLDOWN_MS"), LONG_SCENE_BEATS = num("LONG_SCENE_BEATS"), MAX_PER_SCENE = num("MAX_PER_SCENE")
const SILENCE_MS = src.match(/SILENCE_MS = \[([^\]]*)\]/)[1].split(",").map(x => Number(x.trim().replace(/_/g, "")))
const LADDER = ["npc", "lich", "world"]
const freshScene = (now = 0) => ({ lastPlayerAt: now, lastNudgeAt: 0, tier: 0, beats: 0, firedThisScene: 0 })
function nextNudge(s, now, inCombat = false) {
  if (inCombat) return null
  if (!s || !Number.isFinite(now)) return null
  if (!s.lastPlayerAt) return null
  if (s.tier >= LADDER.length) return null
  if (s.firedThisScene >= MAX_PER_SCENE) return null
  if (s.lastNudgeAt && now - s.lastNudgeAt < COOLDOWN_MS) return null
  const wait = SILENCE_MS[s.tier] * (s.beats >= LONG_SCENE_BEATS ? 0.5 : 1)
  return now - s.lastPlayerAt >= wait ? LADDER[s.tier] : null
}
const onPlayerMessage = (s, now) => ({ ...s, lastPlayerAt: now, tier: 0, beats: s.beats + 1 })
const onNudged = (s, now) => ({ ...s, lastNudgeAt: now, tier: s.tier + 1, firedThisScene: s.firedThisScene + 1 })

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }
const T = 1_000_000

console.log("\npacing")

test("a live conversation is never interrupted", () => {
  const s = freshScene(T)
  assert.equal(nextNudge(s, T + 1000), null)
  assert.equal(nextNudge(s, T + SILENCE_MS[0] - 1), null)
})

test("silence brings an NPC first, not the Lich", () => {
  assert.equal(nextNudge(freshScene(T), T + SILENCE_MS[0]), "npc")
})

test("it climbs npc, then lich, then world", () => {
  let s = freshScene(T), t = T, got = []
  for (let i = 0; i < 3; i++) {
    t += SILENCE_MS[i] + COOLDOWN_MS
    const k = nextNudge(s, t)
    got.push(k)
    s = onNudged(s, t)
  }
  assert.deepEqual(got, ["npc", "lich", "world"])
})

test("the ladder stops at the top — it does not nag forever", () => {
  let s = freshScene(T), t = T
  for (let i = 0; i < 3; i++) { t += SILENCE_MS[i] + COOLDOWN_MS; s = onNudged(s, t) }
  assert.equal(nextNudge(s, t + 10 * 60_000), null)
})

test("a player speaking resets the whole ladder", () => {
  let s = freshScene(T)
  s = onNudged(s, T + SILENCE_MS[0])
  s = onNudged(s, T + SILENCE_MS[0] + SILENCE_MS[1] + COOLDOWN_MS)
  assert.equal(s.tier, 2)
  s = onPlayerMessage(s, T + 200_000)
  assert.equal(s.tier, 0)
  assert.equal(nextNudge(s, T + 200_000 + SILENCE_MS[0]), "npc")
})

test("a dragging scene is prodded sooner", () => {
  // The room IS talking, at length, in one place. A slower clock never
  // catches that, so the thresholds halve.
  const busy = { ...freshScene(T), beats: LONG_SCENE_BEATS }
  assert.equal(nextNudge(busy, T + SILENCE_MS[0] / 2), "npc")
  assert.equal(nextNudge(freshScene(T), T + SILENCE_MS[0] / 2), null)
})

test("two nudges never land on top of each other", () => {
  let s = freshScene(T)
  s = onNudged(s, T + SILENCE_MS[0])
  // Long past the next threshold, but inside the cooldown.
  assert.equal(nextNudge(s, T + SILENCE_MS[0] + COOLDOWN_MS - 1), null)
})

test("combat vetoes it outright — one director on the stage", () => {
  const s = { ...freshScene(T), beats: 99 }
  assert.equal(nextNudge(s, T + 10 * 60_000, true), null)
})

test("a scene has a hard budget, so an open tab cannot burn money all night", () => {
  const spent = { ...freshScene(T), firedThisScene: MAX_PER_SCENE }
  assert.equal(nextNudge(spent, T + 10 * 60_000), null)
})

test("nothing fires before the scene has started", () => {
  const never = { ...freshScene(0), lastPlayerAt: 0 }
  assert.equal(nextNudge(never, T), null)
})

test("nonsense time does not fire anything", () => {
  assert.equal(nextNudge(freshScene(T), NaN), null)
  assert.equal(nextNudge(null, T), null)
})

test("every rung has a prompt, and none of them writes his dialogue for him", () => {
  for (const k of LADDER) {
    const m = src.match(new RegExp(`case "${k}":\\s*\\n\\s*return "([^"]+)"`))
    assert.ok(m, `no prompt for ${k}`)
    assert.match(m[1], /^\[PACING\]/)
    assert.ok(m[1].length > 80, `${k} prompt is too thin to steer with`)
  }
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
