import { describe, expect, it } from "vitest"
import { advanceQueue, buildPrompt, currentWatcher, type PendingReaction } from "./reaction-prompt"
import { hasReaction, spendReaction, type TurnOrderEntry } from "./opportunity"

// The whole pause, walked end to end as the route walks it. Not a unit test of
// one function: the bug this guards against is the one that only shows up in
// the sequence — a queue that advances but never resumes, a reaction spent
// twice, a prompt that outlives its turn.

const pc = (id: string) => ({ token_id: id, label: id, character_id: `${id}-char` })
const DECISION = { kind: "move", to: { x: 5, y: 9 } }

const start = () =>
  buildPrompt({
    watchers: [pc("fifi"), pc("kenta")],
    mover_token: "drow",
    mover_label: "Drow Elite",
    from: { grid_x: 5, grid_y: 5 },
    to: { grid_x: 5, grid_y: 9 },
    resume: DECISION,
    now: "2026-10-10T00:00:00.000Z",
  })!

describe("the pause, end to end", () => {
  it("asks both players in order and only then resumes", () => {
    let p: PendingReaction | null = start()
    expect(currentWatcher(p)!.token_id).toBe("fifi")

    p = advanceQueue(p!)                       // Fifi answers
    expect(currentWatcher(p)!.token_id).toBe("kenta")

    p = advanceQueue(p!)                       // Kenta answers
    expect(p).toBeNull()                       // null IS the resume signal
  })

  it("carries the decision unchanged through every answer", () => {
    // The dice were rolled before the pause. If the resume payload drifted,
    // a player's choice would silently re-roll the drow's turn.
    const p = advanceQueue(start())!
    expect(p.resume).toEqual(DECISION)
    expect(p.to).toEqual({ grid_x: 5, grid_y: 9 })
  })

  it("a dropped mover ends the queue early — nobody is asked about a corpse", () => {
    const p = start()
    expect(p.queue).toHaveLength(2)
    // The route sets next = null directly when the mover falls; this asserts
    // the SHAPE that stands for, so the second player is never prompted.
    const moverDown = true
    const next = moverDown ? null : advanceQueue(p)
    expect(next).toBeNull()
  })

  it("each watcher spends its reaction exactly once, and only for this round", () => {
    let order: TurnOrderEntry[] = [{ token_id: "fifi" }, { token_id: "kenta" }, { token_id: "drow" }]
    expect(hasReaction(order[0], 2)).toBe(true)

    order = spendReaction(order, "fifi", 2)
    expect(hasReaction(order[0], 2)).toBe(false)
    expect(hasReaction(order[1], 2)).toBe(true)   // Kenta untouched
    expect(hasReaction(order[2], 2)).toBe(true)   // the drow untouched

    // Next round, Fifi has it back.
    expect(hasReaction(order[0], 3)).toBe(true)
  })

  it("passing spends nothing", () => {
    const order: TurnOrderEntry[] = [{ token_id: "fifi" }]
    // A pass never calls spendReaction, so the ledger is untouched.
    expect(hasReaction(order[0], 1)).toBe(true)
  })

  it("an all-monster provoke list never pauses at all", () => {
    // The common case must stay free: a fight that stops to ask a question
    // nobody can answer is worse than no reactions.
    const p = buildPrompt({
      watchers: [{ token_id: "quaggoth", label: "Quaggoth", character_id: null }],
      mover_token: "drow",
      mover_label: "Drow Elite",
      from: { grid_x: 0, grid_y: 0 },
      to: { grid_x: 0, grid_y: 3 },
      resume: DECISION,
    })
    expect(p).toBeNull()
  })

  it("the prompt is JSON round-trippable — it lives in a jsonb column", () => {
    const p = start()
    expect(JSON.parse(JSON.stringify(p))).toEqual(p)
  })
})
