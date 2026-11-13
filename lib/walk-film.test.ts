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

  // The ward sigil. First wired to a successful Study (Sam, 2026-10-30); moved to the moment a caster NOTICES it
  // (Sam, 2026-11-12: "passive perception check of 5 for magic users. If they detect it, the cinematic fires (once)").
  it("fires the sigil film when the screen's own caster notices the sigil, not on the Study", () => {
    expect(html).toMatch(/function sigilNoticeTick\(\)\{[\s\S]*?if \(mine && seen\[mine\.id\] === true && !\(state\.sigilFilmed \|\| \{\}\)\[mine\.id\]\) sigilFilm\(mine\);/)
    expect(html).not.toContain('if (tier.key !== "none") sigilFilm(h);')
    expect(html).toContain("const WARD_NOTICE_DC = 5;")
  })
  it("asks for the ward-sigil cue, once per hero", () => {
    expect(html).toMatch(/function sigilFilm\(h\)\{[\s\S]*?state\.sigilFilmed\[h\.id\] = true;/)
    expect(html).toContain('cue: "ward-sigil"')
  })
  it("every cue the page posts is one this module knows", () => {
    // The fungus cue is built at runtime ("fungus-" + the item), so its literal in the page is a PREFIX of a
    // real cue rather than a whole one. A literal counts as known if it IS a cue or begins one.
    const known = Object.keys(WALK_FILMS)
    for (const m of html.matchAll(/cue: "([a-z-]+)"/g)) {
      expect(known.some((c) => c === m[1] || c.startsWith(m[1]))).toBe(true)
    }
  })
})

describe("the Act 1 moments the map stages itself", () => {
  const ACT1 = ["watch-changes", "jorlan-whisper", "guard-volley", "drow-surgeon", "surrender", "buppido-rises", "key-steal-success", "key-steal-fail"] as const
  it("every one is a cue the map may send, with no roll attached", () => {
    for (const cue of ACT1) {
      expect(parseWalkFilm({ type: "aop:walk-film", cue })).toEqual({ cue, total: null })
      expect(filmEarned(cue, null)).toBe(true)
      expect(walkFilmParams(cue, null).get("state")).toBe(cue)
      expect(walkFilmParams(cue, null).get("location")).toBe(PEN_LOCATION)
    }
  })
  it("the map template asks for each of them, and for nothing the list does not know", () => {
    const tpl = readFileSync("scripts/velkynvelve-walk/template.html", "utf8")
    const asked = [...tpl.matchAll(/mapFilm\("([a-z-]+)"\)/g)].map((m) => m[1])
    expect([...new Set(asked)].sort()).toEqual([...ACT1].sort())
    for (const cue of asked) expect(Object.prototype.hasOwnProperty.call(WALK_FILMS, cue)).toBe(true)
  })
})
