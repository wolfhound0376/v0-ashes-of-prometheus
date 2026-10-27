import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { PEN_LOCATION, WALK_FILMS, parseWalkFilm, walkFilmParams } from "./walk-film"

describe("parseWalkFilm", () => {
  it("accepts the two pen gate looks", () => {
    expect(parseWalkFilm({ type: "aop:walk-film", cue: "look-around" })).toBe("look-around")
    expect(parseWalkFilm({ type: "aop:walk-film", cue: "count-guards" })).toBe("count-guards")
  })
  it("refuses anything else", () => {
    expect(parseWalkFilm({ type: "aop:walk-film", cue: "lockpick-success" })).toBeNull()
    expect(parseWalkFilm({ type: "aop:walk-film", cue: "toString" })).toBeNull()
    expect(parseWalkFilm({ type: "aop:action", cue: "look-around" })).toBeNull()
    expect(parseWalkFilm(null)).toBeNull()
  })
})

describe("walkFilmParams", () => {
  it("Look around asks for the pen's environment film, as a player's look", () => {
    const p = walkFilmParams("look-around", "c1")
    expect(Object.fromEntries(p)).toEqual({ location: PEN_LOCATION, kind: "environment", scope: "party", trigger_type: "player_initiated", character_id: "c1" })
  })
  it("Count the guards asks for the count-guards action film", () => {
    const p = walkFilmParams("count-guards", null)
    expect(p.get("state")).toBe("count-guards")
    expect(p.get("kind")).toBe("action")
    expect(p.has("character_id")).toBe(false)
  })
})

describe("the built map", () => {
  const html = readFileSync("public/velkynvelve-walk/index.html", "utf8")
  it("the pen gate's Look closer opens the choice", () => {
    expect(html).toContain("GATE_LOOK_RE.test(look) ? openGateLook(look) : lookCloser(look)")
    expect(html).toMatch(/label: "Look around"[^\n]*gateLookFilm\("look-around"\)/)
    expect(html).toMatch(/label: "Count the guards"[^\n]*gateLookFilm\("count-guards"\)/)
  })
  it("only asks for cues the page knows", () => {
    for (const m of html.matchAll(/gateLookFilm\("([a-z-]+)"\)/g)) expect(Object.keys(WALK_FILMS)).toContain(m[1])
  })
})
