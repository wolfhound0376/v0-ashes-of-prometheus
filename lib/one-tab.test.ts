import { describe, expect, it } from "vitest"
import { isOneTabPage, shouldStepAside } from "./one-tab"

describe("isOneTabPage", () => {
  it("covers the pages that play as your hero or seat you", () => {
    for (const p of ["/", "/intro", "/choose", "/join", "/dm", "/table", "/rehearsal", "/awaken", "/pit", "/velkynvelve", "/cave", "/camp", "/map", "/camp/", "/map/node"]) {
      expect(isOneTabPage(p), p).toBe(true)
    }
  })
  it("leaves the DM's tool pages and the Forge free to sit beside the game", () => {
    for (const p of ["/cinematics", "/admin", "/forge", "/forge/builder", "/shotlist", "/card-preview", "/bench", "/upload"]) {
      expect(isOneTabPage(p), p).toBe(false)
    }
    expect(isOneTabPage(null)).toBe(false)
  })
  it("a DM rehearsal tab never takes part", () => {
    expect(isOneTabPage("/velkynvelve", "?sandbox=1")).toBe(false)
    expect(isOneTabPage("/velkynvelve", "?x=2&sandbox=1")).toBe(false)
    expect(isOneTabPage("/velkynvelve", "?sandbox=10")).toBe(true)
  })
})

describe("shouldStepAside", () => {
  it("steps aside only for another tab's claim", () => {
    expect(shouldStepAside({ type: "here", tab: "b" }, "a")).toBe(true)
    expect(shouldStepAside({ type: "here", tab: "a" }, "a")).toBe(false)
    expect(shouldStepAside({ type: "other", tab: "b" }, "a")).toBe(false)
    expect(shouldStepAside(null, "a")).toBe(false)
    expect(shouldStepAside("here", "a")).toBe(false)
  })
})
