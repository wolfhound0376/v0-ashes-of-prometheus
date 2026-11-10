import { describe, expect, it } from "vitest"
import { guardVerdict, isGuardedPath, wasReset } from "./session-guard"

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
