import { describe, expect, it } from "vitest"
import { guardVerdict, isGuardedPath } from "./session-guard"

describe("isGuardedPath", () => {
  it("guards the in-game pages only", () => {
    for (const p of ["/", "/camp", "/cave", "/map", "/awaken", "/bench", "/camp/"]) expect(isGuardedPath(p), p).toBe(true)
    for (const p of ["/table", "/dm", "/forge", "/intro", "/join", "/velkynvelve", "/admin", "/choose"]) expect(isGuardedPath(p), p).toBe(false)
  })
})

describe("guardVerdict", () => {
  const seat = { id: "fifi" }
  it("a seated player stays while the session is live", () => {
    expect(guardVerdict({ state: { status: "live" }, mine: seat }, "player")).toBe("stay")
  })
  it("after the DM ends it, everyone without the DM key leaves", () => {
    expect(guardVerdict({ state: { status: "closed" }, mine: null }, "player")).toBe("leave")
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
