import { describe, expect, it } from "vitest"
import { WALK_ACTION_MAX, isWalkEventSig, parseWalkActionRequest } from "./walk-action"

const ok = { type: "aop:action", id: "a1", text: "Fifi stops at the gate and listens. Wisdom (Perception) 21.", characterId: "c1", ask: true }

describe("parseWalkActionRequest", () => {
  it("accepts a clicked hand-off", () => {
    expect(parseWalkActionRequest(ok)).toEqual({ type: "aop:action", id: "a1", text: ok.text, characterId: "c1", event: false, sig: null, private: false })
  })
  it("ignores a hand-off with neither flag", () => {
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

describe("automatic events", () => {
  const ev = { type: "aop:action", id: "a2", text: "A drow guard spots Fifi. They were sneaking.", characterId: "c1", ask: false, event: true, sig: "ev-1x2y3z" }
  it("accepts an event with a well-formed fingerprint", () => {
    expect(parseWalkActionRequest(ev)).toMatchObject({ event: true, sig: "ev-1x2y3z" })
  })
  it("refuses an event without one, or with a malformed one", () => {
    expect(parseWalkActionRequest({ ...ev, sig: undefined })).toBeNull()
    expect(parseWalkActionRequest({ ...ev, sig: "drop table" })).toBeNull()
    expect(isWalkEventSig("ev-ab")).toBe(false)
    expect(isWalkEventSig("ev-abcd")).toBe(true)
  })
  it("treats a clicked hand-off as a click even if it also carries a fingerprint", () => {
    expect(parseWalkActionRequest({ ...ev, ask: true })).toMatchObject({ event: false })
  })
})

describe("private turns (Sam, 2026-10-01: a prayer is private unless spoken aloud)", () => {
  it("keeps a clicked silent prayer private", () => {
    expect(parseWalkActionRequest({ ...ok, private: true })?.private).toBe(true)
  })
  it("never makes an automatic event private", () => {
    expect(parseWalkActionRequest({ type: "aop:action", id: "a3", text: "x", event: true, sig: "ev-abcd1", private: true })?.private).toBe(false)
  })
})
