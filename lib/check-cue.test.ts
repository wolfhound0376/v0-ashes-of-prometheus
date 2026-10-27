import { describe, expect, it } from "vitest"
import { CHECK_CUES, WALK_CHECK_CUES, parseWalkCheckCue } from "./check-cue"

describe("parseWalkCheckCue", () => {
  it("accepts the pen gate look from the map", () => {
    expect(parseWalkCheckCue({ type: "aop:check-cue", state: "count-guards", scope: "solo", location: "Scene_1_Velkynvelve (slave pen)" }))
      .toEqual({ state: "count-guards", scope: "solo", location: "Scene_1_Velkynvelve (slave pen)", caption: undefined })
  })
  it("refuses a cue the map may not name", () => {
    expect(parseWalkCheckCue({ type: "aop:check-cue", state: "lockpick-success", scope: "solo" })).toBeNull()
    expect(parseWalkCheckCue({ type: "aop:check-cue", state: "made-up", scope: "solo" })).toBeNull()
  })
  it("ignores other messages", () => {
    expect(parseWalkCheckCue({ type: "aop:action", state: "count-guards" })).toBeNull()
    expect(parseWalkCheckCue(null)).toBeNull()
    expect(parseWalkCheckCue("count-guards")).toBeNull()
  })
  it("defaults to a solo film", () => {
    expect(parseWalkCheckCue({ type: "aop:check-cue", state: "count-guards" })?.scope).toBe("solo")
  })
  it("every map cue is a catalogued check cue", () => {
    for (const c of WALK_CHECK_CUES) expect(Object.keys(CHECK_CUES)).toContain(c)
  })
})

describe("the built map asks for the gate film", () => {
  it("posts count-guards when someone looks closer at the pen gate", async () => {
    const fs = await import("node:fs")
    const html = fs.readFileSync("public/velkynvelve-walk/index.html", "utf8")
    expect(html).toMatch(/if \(GATE_LOOK_RE\.test\(what\)\) gateLookFilm\(\);/)
    expect(html).toMatch(/type: "aop:check-cue", state: "count-guards", scope: "solo"/)
    const story = JSON.parse(fs.readFileSync("scripts/velkynvelve-walk/story.json", "utf8"))
    const names: string[] = []
    JSON.stringify(story, (k, v) => { if (k === "name" && typeof v === "string") names.push(v); return v })
    expect(names.some((n) => /pen gate/i.test(n))).toBe(true)
  })
})
