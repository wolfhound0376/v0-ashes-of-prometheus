// Turn-taking is the whole point of the queue, and its one hard rule is that a
// line's completion fires EXACTLY ONCE — the first cut of this shipped without
// that guarantee and double-advanced the dialogue sequence in production.
//
//   node lib/__tests__/speech-queue.test.mjs
//
// Run against the compiled module so the test exercises the shipped code.

import assert from "node:assert/strict"
import { createSpeechQueue } from "./speech-queue.build.mjs"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** A player that "plays" for a fixed time and records what it was asked. */
function fakePlayer(log) {
  return async (blob, offset) => {
    log.push(`play:${blob.name}@${offset.toFixed(1)}`)
    let settle
    const finished = new Promise((r) => (settle = r))
    const timer = setTimeout(() => settle("ended"), blob.ms)
    return {
      finished,
      stop: () => {
        clearTimeout(timer)
        settle("stopped")
      },
    }
  }
}

const clip = (name, ms) => ({ name, ms })

async function test(name, fn) {
  try {
    await fn()
    console.log("  PASS  " + name)
  } catch (e) {
    console.error("  FAIL  " + name + "\n        " + e.message)
    process.exitCode = 1
  }
}

console.log("speech queue")

await test("an NPC interrupted by the DM finishes afterwards, and ends once", async () => {
  const log = []
  const ends = []
  const q = createSpeechQueue(fakePlayer(log))
  q.speak({ rank: "npc", fetch: async () => clip("eldeth", 900), onEnd: (r) => ends.push("npc:" + r) })
  // Well into the line: the queue rewinds 0.25s on resume so the cut word is
  // heard again, which means an interruption inside that first quarter-second
  // simply restarts. Interrupt past it to exercise a genuine resume.
  await sleep(500)
  q.speak({ rank: "dm", fetch: async () => clip("malachar", 150), onEnd: (r) => ends.push("dm:" + r) })
  await sleep(1400)
  assert.equal(ends.filter((e) => e.startsWith("npc")).length, 1, "NPC must end exactly once, got: " + ends.join(","))
  assert.deepEqual(ends, ["dm:ended", "npc:ended"], "DM finishes first, then the NPC resumes: " + ends.join(","))
  assert.ok(log.some((l) => l.startsWith("play:eldeth@0.0")), "NPC starts at 0")
  const resumed = log.filter((l) => l.startsWith("play:eldeth"))
  assert.equal(resumed.length, 2, "she is played twice: once cut off, once resumed")
  const at = Number(resumed[1].split("@")[1])
  assert.ok(at > 0.1, "resumes part-way in rather than from the top, got " + at)
  assert.ok(at < 0.5, "rewinds a beat so the cut word is heard again, got " + at)
})

await test("a player outranks Malachar", async () => {
  const order = []
  const q = createSpeechQueue(fakePlayer([]))
  q.speak({ rank: "dm", fetch: async () => clip("dm", 200), onEnd: () => order.push("dm") })
  await sleep(50)
  q.speak({ rank: "player", fetch: async () => clip("pc", 100), onEnd: () => order.push("player") })
  await sleep(700)
  assert.deepEqual(order, ["player", "dm"], "player takes the floor: " + order.join(","))
})

await test("same rank queues, never interrupts", async () => {
  const order = []
  const q = createSpeechQueue(fakePlayer([]))
  q.speak({ rank: "npc", fetch: async () => clip("a", 120), onEnd: () => order.push("a") })
  await sleep(30)
  q.speak({ rank: "npc", fetch: async () => clip("b", 60), onEnd: () => order.push("b") })
  await sleep(600)
  assert.deepEqual(order, ["a", "b"], "first speaker keeps the floor: " + order.join(","))
})

await test("a cancelled line ends once and never plays", async () => {
  const log = []
  const ends = []
  const q = createSpeechQueue(fakePlayer(log))
  q.speak({ rank: "npc", fetch: async () => clip("holding", 200), onEnd: (r) => ends.push("held:" + r) })
  const doomed = q.speak({ rank: "npc", fetch: async () => clip("doomed", 200), onEnd: (r) => ends.push("doomed:" + r) })
  doomed.cancel()
  await sleep(600)
  assert.equal(ends.filter((e) => e.startsWith("doomed")).length, 1, "cancelled line ends once: " + ends.join(","))
  assert.ok(!log.some((l) => l.includes("doomed")), "cancelled line never fetched or played")
})

await test("three interruptions still yield one completion each", async () => {
  const ends = []
  const q = createSpeechQueue(fakePlayer([]))
  q.speak({ rank: "npc", fetch: async () => clip("npc", 400), onEnd: (r) => ends.push("npc") })
  await sleep(60)
  q.speak({ rank: "dm", fetch: async () => clip("dm1", 80), onEnd: () => ends.push("dm1") })
  await sleep(40)
  q.speak({ rank: "player", fetch: async () => clip("pc", 80), onEnd: () => ends.push("pc") })
  await sleep(1200)
  assert.equal(ends.filter((e) => e === "npc").length, 1, "NPC ends once through repeated interruption: " + ends.join(","))
  assert.equal(ends.length, 3, "every line ends exactly once: " + ends.join(","))
})

if (!process.exitCode) console.log("\nall speech-queue expectations hold")
