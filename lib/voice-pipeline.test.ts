// The pipeline's job is to overlap synthesis with playback WITHOUT ever
// reordering a turn. Both halves are asserted here with controlled promises
// rather than sleeps, so the test says what it means and cannot flake.

import { describe, expect, it } from "vitest"
import { runVoicePipeline } from "./voice-pipeline"

/** A promise with its resolver, so a test can decide when a fetch lands. */
function deferred<T>() {
  let settle!: (value: T) => void
  const promise = new Promise<T>((resolve) => { settle = resolve })
  return { promise, settle }
}

type Harness = {
  lines: string[]
  fetched: string[]
  played: string[]
  inFlight: number
  peakInFlight: number
  landFetch: (line: string, audio?: string | null) => void
  endPlay: (line: string) => void
  run: (lookahead?: number) => Promise<void>
  off: () => void
}

function harness(lines: string[]): Harness {
  const fetches = new Map<string, { promise: Promise<string | null>; settle: (v: string | null) => void }>()
  const plays = new Map<string, { promise: Promise<void>; settle: (v: void) => void }>()
  const queue = [...lines]
  let enabled = true
  const h: Harness = {
    lines,
    fetched: [],
    played: [],
    inFlight: 0,
    peakInFlight: 0,
    landFetch(line, audio = `audio:${line}`) { fetches.get(line)!.settle(audio) },
    endPlay(line) { plays.get(line)!.settle() },
    off() { enabled = false },
    run: (lookahead) => runVoicePipeline<string, string>({
      take: () => queue.shift(),
      enabled: () => enabled,
      lookahead,
      fetchVoice: (line) => {
        h.fetched.push(line)
        h.inFlight += 1
        h.peakInFlight = Math.max(h.peakInFlight, h.inFlight)
        const d = deferred<string | null>()
        fetches.set(line, d as never)
        return d.promise.then((v) => { h.inFlight -= 1; return v })
      },
      play: (line, audio) => {
        h.played.push(audio === null ? `${line}:silent` : line)
        const d = deferred<void>()
        plays.set(line, d as never)
        return d.promise
      },
    }),
  }
  return h
}

/** Let every already-settled promise run its callbacks. */
const settleMicrotasks = () => new Promise<void>((r) => setTimeout(r, 0))

describe("runVoicePipeline", () => {
  it("has the next lines in synthesis while the first one plays", async () => {
    const h = harness(["a", "b", "c", "d"])
    const done = h.run(2)
    await settleMicrotasks()

    // Nothing is playing yet, but three lines are already being made.
    expect(h.fetched).toEqual(["a", "b", "c"])
    expect(h.played).toEqual([])

    h.landFetch("a")
    await settleMicrotasks()
    // "a" is in the speakers and "d" has joined the pipeline behind it — the
    // old loop would not have asked for "b" until "a" had finished playing.
    expect(h.played).toEqual(["a"])
    expect(h.fetched).toEqual(["a", "b", "c", "d"])

    h.landFetch("b"); h.landFetch("c"); h.landFetch("d")
    h.endPlay("a"); await settleMicrotasks()
    expect(h.played).toEqual(["a", "b"])   // no wait: "b" was ready
    h.endPlay("b"); await settleMicrotasks()
    h.endPlay("c"); await settleMicrotasks()
    h.endPlay("d"); await settleMicrotasks()
    await done
    expect(h.played).toEqual(["a", "b", "c", "d"])
  })

  it("plays a turn in order however the synthesis lands", async () => {
    const h = harness(["first", "second", "third"])
    const done = h.run(2)
    await settleMicrotasks()

    // The last line comes back first, the first line last.
    h.landFetch("third"); h.landFetch("second"); await settleMicrotasks()
    expect(h.played).toEqual([])           // nothing may jump the queue
    h.landFetch("first"); await settleMicrotasks()

    expect(h.played).toEqual(["first"])
    h.endPlay("first"); await settleMicrotasks()
    h.endPlay("second"); await settleMicrotasks()
    h.endPlay("third"); await settleMicrotasks()
    await done
    expect(h.played).toEqual(["first", "second", "third"])
  })

  it("never has more than lookahead + 1 lines in synthesis", async () => {
    const h = harness(["a", "b", "c", "d", "e", "f"])
    const done = h.run(1)
    await settleMicrotasks()
    expect(h.peakInFlight).toBe(2)

    for (const line of ["a", "b", "c", "d", "e", "f"]) {
      h.landFetch(line); await settleMicrotasks()
      h.endPlay(line); await settleMicrotasks()
      expect(h.peakInFlight).toBeLessThanOrEqual(2)
    }
    await done
    expect(h.played).toEqual(["a", "b", "c", "d", "e", "f"])
  })

  it("stops taking lines once the voices are switched off", async () => {
    const h = harness(["a", "b", "c", "d"])
    const done = h.run(1)
    await settleMicrotasks()
    h.landFetch("a"); await settleMicrotasks()
    expect(h.played).toEqual(["a"])

    h.off()
    h.landFetch("b")
    h.endPlay("a")
    await settleMicrotasks()
    await done
    // "c" was started while "a" was in the speakers — that IS the lookahead,
    // and it is the one line a mid-turn switch-off can waste. "b" and "c" are
    // then simply dropped, and "d" was never asked for at all.
    expect(h.played).toEqual(["a"])
    expect(h.fetched).toEqual(["a", "b", "c"])
  })

  it("skips a line whose audio could not be made and keeps going", async () => {
    const h = harness(["a", "b"])
    const done = h.run(1)
    await settleMicrotasks()
    h.landFetch("a", null); await settleMicrotasks()
    expect(h.played).toEqual(["a:silent"])
    h.endPlay("a")
    h.landFetch("b"); await settleMicrotasks()
    expect(h.played).toEqual(["a:silent", "b"])
    h.endPlay("b"); await settleMicrotasks()
    await done
  })

  it("reports the wait only when nothing else is ready", async () => {
    const waits: number[] = []
    const queue = ["a", "b"]
    const fetches = new Map<string, (v: string) => void>()
    const plays = new Map<string, () => void>()
    let played = 0
    const done = runVoicePipeline<string, string>({
      take: () => queue.shift(),
      enabled: () => true,
      lookahead: 2,
      onWaiting: () => waits.push(played),
      fetchVoice: (line) => new Promise((resolve) => fetches.set(line, resolve)),
      play: (line) => new Promise((resolve) => { played += 1; plays.set(line, resolve as () => void) }),
    })
    await settleMicrotasks()
    // Both lines are in flight, so the pipeline is not "full" behind "a": the
    // table is genuinely waiting on the first synthesis and the spinner is right.
    expect(waits).toEqual([0])
    fetches.get("a")!("audio:a"); fetches.get("b")!("audio:b")
    await settleMicrotasks()
    plays.get("a")!()
    await settleMicrotasks()
    plays.get("b")!()
    await settleMicrotasks()
    await done
    expect(played).toBe(2)
  })
})
