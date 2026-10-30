import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { GATE_LOOK_DC, PEN_LOCATION, WALK_FILMS, filmEarned, parseWalkFilm, walkFilmParams } from "./walk-film"

describe("parseWalkFilm", () => {
  it("accepts the two pen gate looks, with the roll that bought them", () => {
    expect(parseWalkFilm({ type: "aop:walk-film", cue: "look-around", total: 14 })).toEqual({ cue: "look-around", total: 14 })
    expect(parseWalkFilm({ type: "aop:walk-film", cue: "count-guards", total: 9 })).toEqual({ cue: "count-guards", total: 9 })
  })
  it("reads a missing or junk total as no roll at all", () => {
    expect(parseWalkFilm({ type: "aop:walk-film", cue: "look-around" })).toEqual({ cue: "look-around", total: null })
    expect(parseWalkFilm({ type: "aop:walk-film", cue: "look-around", total: "12" })).toEqual({ cue: "look-around", total: null })
    expect(parseWalkFilm({ type: "aop:walk-film", cue: "look-around", total: Number.NaN })).toEqual({ cue: "look-around", total: null })
  })
  it("refuses anything else", () => {
    expect(parseWalkFilm({ type: "aop:walk-film", cue: "lockpick-success" })).toBeNull()
    expect(parseWalkFilm({ type: "aop:walk-film", cue: "toString" })).toBeNull()
    expect(parseWalkFilm({ type: "aop:action", cue: "look-around" })).toBeNull()
    expect(parseWalkFilm(null)).toBeNull()
  })
})

describe("filmEarned", () => {
  it("meeting the DC earns the look; short of it does not", () => {
    expect(filmEarned("look-around", GATE_LOOK_DC)).toBe(true)
    expect(filmEarned("look-around", GATE_LOOK_DC + 7)).toBe(true)
    expect(filmEarned("look-around", GATE_LOOK_DC - 1)).toBe(false)
    expect(filmEarned("count-guards", 3)).toBe(false)
  })
  it("a cue that was sent with no roll never buys a film that wants one", () => {
    expect(filmEarned("look-around", null)).toBe(false)
  })
  it("a cue with no DC always asks", () => {
    for (const [cue, f] of Object.entries(WALK_FILMS)) {
      if (f.dc === null) expect(filmEarned(cue as keyof typeof WALK_FILMS, null)).toBe(true)
    }
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
    expect(html).toMatch(/label: "Look around"[^\n]*gateLookFilm\("look-around", lookCloser\(/)
    expect(html).toMatch(/label: "Count the guards"[^\n]*gateLookFilm\("count-guards", lookCloser\(/)
  })
  it("sends the check's total with the cue, and lookCloser hands it back", () => {
    expect(html).toContain('postMessage({type: "aop:walk-film", cue, total}')
    expect(html).toMatch(/function lookCloser\(what\)\{[\s\S]*?return k;/)
  })
  it("only asks for cues the page knows", () => {
    for (const m of html.matchAll(/gateLookFilm\("([a-z-]+)"/g)) expect(Object.keys(WALK_FILMS)).toContain(m[1])
  })
})
