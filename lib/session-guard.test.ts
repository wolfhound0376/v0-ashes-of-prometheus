import { describe, expect, it } from "vitest"
import { guardVerdict, isGuardedPath, needsWaking, wasReset } from "./session-guard"

describe("isGuardedPath", () => {
  it("guards the in-game pages only", () => {
    for (const p of ["/", "/camp", "/cave", "/map", "/awaken", "/bench", "/camp/"]) expect(isGuardedPath(p), p).toBe(true)
    for (const p of ["/table", "/dm", "/forge", "/intro", "/join", "/velkynvelve", "/admin", "/choose"]) expect(isGuardedPath(p), p).toBe(false)
  })
})

describe("guardVerdict", () => {
  const seat = { id: "fifi", away: false }
  it("a seated player stays while the session is live", () => {
    expect(guardVerdict({ state: { status: "live" }, mine: seat }, "player")).toBe("stay")
  })
  it("after the DM ends it, everyone without the DM key leaves", () => {
    expect(guardVerdict({ state: { status: "closed" }, mine: null }, "player")).toBe("leave")
    // Stepped out by the DM: the chair is held, but the player is out of the game until he lets them back in.
    expect(guardVerdict({ state: { status: "live" }, mine: { away: true } }, "player")).toBe("leave")
    expect(guardVerdict({ state: { status: "live" }, mine: { away: false } }, "player")).toBe("stay")
    expect(guardVerdict({ state: { status: "live" }, mine: null }, null)).toBe("leave")
  })
  it("the DM stays, but only on the browser signed in as DM", () => {
    expect(guardVerdict({ state: { status: "closed" }, isDm: true }, "dm")).toBe("stay")
    expect(guardVerdict({ state: { status: "closed" }, isDm: true }, "player")).toBe("leave")
  })
  it("never kicks on a read failure", () => {
    expect(guardVerdict({ error: "boom" }, "player")).toBe("stay")
    expect(guardVerdict(null, "player")).toBe("stay")
  })
})

describe("wasReset", () => {
  it("a screen that loaded under one run and hears of another was reset", () => {
    expect(wasReset("run-51", { run: "run-52" })).toBe(true)
    expect(wasReset("run-52", { run: "run-52" })).toBe(false)
  })
  it("the DM gets no exception: his screens close too", () => {
    expect(wasReset("run-51", { run: "run-52", isDm: true, state: { status: "lobby" } })).toBe(true)
  })
  it("cannot tell is never a reset", () => {
    expect(wasReset(null, { run: "run-52" })).toBe(false)       // first look: nothing to compare against
    expect(wasReset("run-51", { run: null })).toBe(false)       // the run could not be read
    expect(wasReset("run-51", { error: "boom" })).toBe(false)
    expect(wasReset("run-51", null)).toBe(false)
  })
})

describe("needsWaking", () => {
  const live = { state: { status: "live" }, mine: { id: "lynkes", away: false } }
  it("a seated player who has not reached the gate this session is sent to the awakening", () => {
    expect(needsWaking({ ...live, woke: false }, "player")).toBe(true)
  })
  it("a hero who has woken is never sent again (a refresh, back from the dashboard)", () => {
    expect(needsWaking({ ...live, woke: true }, "player")).toBe(false)
  })
  it("an answer that does not say sends nobody", () => {
    expect(needsWaking(live, "player")).toBe(false)
    expect(needsWaking({ error: "boom", woke: false }, "player")).toBe(false)
    expect(needsWaking(null, "player")).toBe(false)
  })
  it("the DM, a DM-run companion and a stepped-out player are not sent", () => {
    expect(needsWaking({ ...live, isDm: true, woke: false }, "dm")).toBe(false)
    expect(needsWaking({ state: { status: "live" }, mine: { id: "kenta", dm: true }, woke: false }, "player")).toBe(false)
    expect(needsWaking({ state: { status: "live" }, mine: { id: "fifi", away: true }, woke: false }, "player")).toBe(false)
  })
  it("only while the session is live, and only with a seat", () => {
    expect(needsWaking({ state: { status: "lobby" }, mine: { id: "lynkes" }, woke: false }, "player")).toBe(false)
    expect(needsWaking({ state: { status: "live" }, mine: null, woke: false }, "player")).toBe(false)
  })
  it("a DM cookie left on a player's browser does not excuse the player", () => {
    expect(needsWaking({ ...live, isDm: true, woke: false }, "player")).toBe(true)
  })
})
