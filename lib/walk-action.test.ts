import { describe, expect, it } from "vitest"
import { WALK_ACTION_MAX, parseWalkActionRequest } from "./walk-action"

const ok = { type: "aop:action", id: "a1", text: "Fifi stops at the gate and listens. Wisdom (Perception) 21.", characterId: "c1", ask: true }

describe("parseWalkActionRequest", () => {
  it("accepts a clicked hand-off", () => {
    expect(parseWalkActionRequest(ok)).toEqual({ type: "aop:action", id: "a1", text: ok.text, characterId: "c1" })
  })
  it("ignores the automatic hand-offs, which carry no ask flag", () => {
    expect(parseWalkActionRequest({ ...ok, ask: undefined })).toBeNull()
    expect(parseWalkActionRequest({ type: "aop:action", text: "Combat has begun." })).toBeNull()
  })
  it("ignores other messages, the dice ones included", () => {
    expect(parseWalkActionRequest({ type: "aop:roll", id: "r1", action: "pen-gate:pick" })).toBeNull()
    expect(parseWalkActionRequest(null)).toBeNull()
    expect(parseWalkActionRequest("aop:action")).toBeNull()
  })
  it("needs an id and some text, and caps the length", () => {
    expect(parseWalkActionRequest({ ...ok, id: "" })).toBeNull()
    expect(parseWalkActionRequest({ ...ok, text: "   " })).toBeNull()
    expect(parseWalkActionRequest({ ...ok, text: "x".repeat(WALK_ACTION_MAX + 1) })).toBeNull()
  })
  it("speaks as nobody in particular when the map knows no character", () => {
    expect(parseWalkActionRequest({ ...ok, characterId: undefined })?.characterId).toBeNull()
  })
})
