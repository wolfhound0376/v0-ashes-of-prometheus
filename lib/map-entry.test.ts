import { describe, expect, it } from "vitest"
import { MAP_HOME, mapHref, shouldEnterOnMap } from "./map-entry"

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
