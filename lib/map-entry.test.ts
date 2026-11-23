import { describe, expect, it } from "vitest"
import { DOOR_NEXT_MS, MAP_HOME, doorIntent, doorResume, doorWaiting, mapHref, shouldEnterOnMap } from "./map-entry"

const p = (q: string) => new URLSearchParams(q)

describe("shouldEnterOnMap", () => {
  it("sends a fresh arrival at / to the map", () => {
    expect(shouldEnterOnMap(p(""), false)).toBe(true)
  })
  it("sends a fresh rehearsal arrival to the map too", () => {
    expect(shouldEnterOnMap(p("sandbox=1"), false)).toBe(true)
  })
  it("leaves / alone once the session has entered", () => {
    expect(shouldEnterOnMap(p(""), true)).toBe(false)
  })
  it.each(["from=map", "from=camp", "talk=Eldeth", "bench=1", "view=compact", "c=x&k=y", "dash=1"])(
    "never bounces a return or an explicit window (%s)",
    (q) => expect(shouldEnterOnMap(p(q), false)).toBe(false),
  )
})

describe("mapHref", () => {
  it("carries the sandbox flag", () => {
    expect(mapHref(false)).toBe(MAP_HOME)
    expect(mapHref(true)).toBe(`${MAP_HOME}?sandbox=1`)
  })
})

describe("the Ruins survive the door", () => {
  const T = 1_000_000
  it("remembers the Ruins' way in, and which side it was entered from", () => {
    expect(JSON.parse(doorIntent(p("ruins=1"), T)!)).toEqual({ q: "?ruins=1", at: T })
    expect(JSON.parse(doorIntent(p("ruins=1&from=map&bag=1"), T)!)).toEqual({ q: "?ruins=1&from=map", at: T })
    expect(JSON.parse(doorIntent(p("ruins=1&road=road-03"), T)!)).toEqual({ q: "?ruins=1&road=road-03", at: T })
    expect(JSON.parse(doorIntent(p("ruins=1&road=evil"), T)!)).toEqual({ q: "?ruins=1", at: T })
    expect(doorResume(doorIntent(p("ruins=1&road=road-03"), T), p(""), T + 1)).toBe("?ruins=1&road=road-03")
  })
  it("remembers nothing for an ordinary arrival", () => {
    expect(doorIntent(p(""), T)).toBeNull()
    expect(doorIntent(p("sandbox=1"), T)).toBeNull()
  })
  it("puts the browser back on its way once the map lets it in", () => {
    expect(doorResume(doorIntent(p("ruins=1&from=map"), T), p(""), T + 60_000)).toBe("?ruins=1&from=map")
    expect(doorWaiting(doorIntent(p("ruins=1"), T), T + 1)).toBe(true)
  })
  it("owes nothing when the address already says Ruins, when it is stale, or when the note is not ours", () => {
    const note = doorIntent(p("ruins=1"), T)
    expect(doorResume(note, p("ruins=1"), T + 1)).toBeNull()
    expect(doorResume(note, p(""), T + DOOR_NEXT_MS + 1)).toBeNull()
    expect(doorResume(null, p(""), T)).toBeNull()
    expect(doorResume("not json", p(""), T)).toBeNull()
    expect(doorResume(JSON.stringify({ q: "?next=https://elsewhere.example", at: T }), p(""), T + 1)).toBeNull()
    expect(doorWaiting(null, T)).toBe(false)
  })
})
