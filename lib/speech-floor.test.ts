import { describe, expect, it } from "vitest"
import { createSpeechQueue, type SpeechFloor } from "./speech-queue"

// A fake player: each line "plays" until we end it by hand.
function rig() {
  const ends: Array<(r: "ended") => void> = []
  const q = createSpeechQueue(async () => {
    let end: (r: "ended") => void = () => {}
    const finished = new Promise<"ended">((r) => (end = r))
    ends.push(end)
    return { finished, stop: () => end("ended") } as never
  })
  const seen: Array<SpeechFloor | null> = []
  q.onFloorChange((f) => seen.push(f))
  return { q, ends, seen }
}
const tick = () => new Promise((r) => setTimeout(r, 0))
const blob = new Blob(["x"])

describe("speech floor (drives the Lich on the DM screen)", () => {
  it("reports Malachar while his line plays and clears when it ends", async () => {
    const { q, ends, seen } = rig()
    q.speak({ rank: "dm", speaker: "Malachar", fetch: async () => blob })
    await tick()
    expect(q.getFloor()).toEqual({ rank: "dm", speaker: "Malachar" })
    ends[0]("ended")
    await tick()
    expect(q.getFloor()).toBeNull()
    expect(seen).toEqual([{ rank: "dm", speaker: "Malachar" }, null])
  })

  it("hands the floor to an NPC line queued behind him", async () => {
    const { q, ends } = rig()
    q.speak({ rank: "dm", speaker: "Malachar", fetch: async () => blob })
    q.speak({ rank: "npc", speaker: "Eldeth", fetch: async () => blob })
    await tick()
    expect(q.getFloor()?.speaker).toBe("Malachar")
    ends[0]("ended")
    await tick(); await tick()
    expect(q.getFloor()).toEqual({ rank: "npc", speaker: "Eldeth" })
  })

  it("unsubscribe stops notifications", async () => {
    const { q, ends } = rig()
    const got: unknown[] = []
    const off = q.onFloorChange((f) => got.push(f))
    off()
    q.speak({ rank: "dm", speaker: "Malachar", fetch: async () => blob })
    await tick(); ends[0]("ended"); await tick()
    expect(got).toEqual([])
  })
})
