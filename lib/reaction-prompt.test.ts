import { describe, expect, it } from "vitest"
import {
  advanceQueue,
  buildPrompt,
  currentWatcher,
  mayAnswer,
  promptNarration,
  type PendingReaction,
  type Watcher,
} from "./reaction-prompt"

const pc = (id: string, ch = `${id}-char`): Watcher => ({ token_id: id, label: id, character_id: ch })
const npc = (id: string): Watcher => ({ token_id: id, label: id, character_id: null })

const base = {
  mover_token: "drow",
  mover_label: "Drow Elite",
  from: { grid_x: 5, grid_y: 5 },
  to: { grid_x: 5, grid_y: 8 },
  resume: { kind: "move", to: { x: 5, y: 8 } },
  now: "2026-10-10T00:00:00.000Z",
}

describe("buildPrompt", () => {
  it("raises nothing when there is nobody to ask — the common case stays free", () => {
    expect(buildPrompt({ ...base, watchers: [] })).toBeNull()
  })

  it("never prompts for a monster — the server decides those inline", () => {
    expect(buildPrompt({ ...base, watchers: [npc("quaggoth")] })).toBeNull()
  })

  it("keeps only the player characters when the provokers are mixed", () => {
    const p = buildPrompt({ ...base, watchers: [npc("quaggoth"), pc("fifi")] })
    expect(p!.queue.map((w) => w.token_id)).toEqual(["fifi"])
  })

  it("carries the interrupted decision verbatim", () => {
    const p = buildPrompt({ ...base, watchers: [pc("fifi")] })
    expect(p!.resume).toEqual(base.resume)
  })

  it("preserves board order for several provokers", () => {
    const p = buildPrompt({ ...base, watchers: [pc("fifi"), pc("kenta"), pc("samson")] })
    expect(p!.queue.map((w) => w.token_id)).toEqual(["fifi", "kenta", "samson"])
  })
})

describe("the queue", () => {
  const three = buildPrompt({ ...base, watchers: [pc("fifi"), pc("kenta"), pc("samson")] })!

  it("asks the head first", () => {
    expect(currentWatcher(three)!.token_id).toBe("fifi")
  })

  it("advances one at a time", () => {
    const next = advanceQueue(three)!
    expect(currentWatcher(next)!.token_id).toBe("kenta")
    expect(next.queue).toHaveLength(2)
  })

  it("returns null when the last one has answered — the signal to resume", () => {
    let p: PendingReaction | null = three
    p = advanceQueue(p!)
    p = advanceQueue(p!)
    expect(advanceQueue(p!)).toBeNull()
  })

  it("keeps the resume payload across every advance", () => {
    expect(advanceQueue(advanceQueue(three)!)!.resume).toEqual(base.resume)
  })

  it("never mutates the prompt it was handed", () => {
    const before = JSON.stringify(three)
    advanceQueue(three)
    expect(JSON.stringify(three)).toBe(before)
  })

  it("currentWatcher survives null and an empty queue", () => {
    expect(currentWatcher(null)).toBeNull()
    expect(currentWatcher(undefined)).toBeNull()
    expect(currentWatcher({ ...three, queue: [] })).toBeNull()
  })
})

describe("who may answer", () => {
  const p = buildPrompt({ ...base, watchers: [pc("fifi", "fifi-char"), pc("kenta", "kenta-char")] })!

  it("the character being asked may", () => {
    expect(mayAnswer(p, { characterId: "fifi-char" })).toBe(true)
  })

  it("a different player may NOT answer for them", () => {
    expect(mayAnswer(p, { characterId: "kenta-char" })).toBe(false)
  })

  it("the DM may always answer — a live table needs an escape hatch", () => {
    expect(mayAnswer(p, { isDm: true })).toBe(true)
    expect(mayAnswer(p, { characterId: "someone-else", isDm: true })).toBe(true)
  })

  it("an unclaimed browser may not", () => {
    expect(mayAnswer(p, {})).toBe(false)
    expect(mayAnswer(p, { characterId: null })).toBe(false)
  })

  it("nobody may answer a prompt that is not open", () => {
    expect(mayAnswer(null, { isDm: true })).toBe(false)
  })
})

describe("the log line", () => {
  it("names both sides so the transcript shows why the fight stopped", () => {
    const p = buildPrompt({ ...base, watchers: [pc("Fifi")] })!
    expect(promptNarration(p)).toContain("Drow Elite")
    expect(promptNarration(p)).toContain("Fifi")
  })

  it("is empty rather than broken when the queue has run out", () => {
    const p = buildPrompt({ ...base, watchers: [pc("Fifi")] })!
    expect(promptNarration({ ...p, queue: [] })).toBe("")
  })
})
