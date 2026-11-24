import { describe, expect, it } from "vitest"
import { DOOR_INTENT_MS, intentValue, readIntent } from "./door-intent"

describe("door intent", () => {
  const now = 1_800_000_000_000
  it("round-trips the three intents", () => {
    for (const i of ["open", "new", "load"] as const) expect(readIntent(intentValue(i, now), now + 5)).toBe(i)
  })
  it("goes stale after half an hour", () => {
    expect(readIntent(intentValue("new", now), now + DOOR_INTENT_MS + 1)).toBeNull()
  })
  it("ignores junk", () => {
    expect(readIntent("reset@1", now)).toBeNull()
    expect(readIntent("new", now)).toBeNull()
    expect(readIntent(null, now)).toBeNull()
    expect(readIntent(intentValue("open", now + 3_600_000), now)).toBeNull()
  })
})
