import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { GAME_OVER_RULES, GAME_OVER_LINES, gameOverActive, gameOverNoteDeath, gameOverLine, gameOverAfter, gameOverIsReplay } from "./game-over.mjs"

describe("when the game is over", () => {
  it("is over only when every seated hero is dead", () => {
    expect(gameOverActive(["kenta", "freia"], ["kenta", "freia"])).toBe(true)
    expect(gameOverActive(["kenta", "freia"], ["kenta"])).toBe(false)
  })
  it("ignores the dead who were never seated (a companion, a hero not at the table this session)", () => {
    expect(gameOverActive(["kenta"], ["kenta", "ront", "samson"])).toBe(true)
    expect(gameOverActive(["kenta", "scott"], ["ront", "eldeth", "kenta"])).toBe(false)
  })
  it("never fires on an empty table or a missing list", () => {
    expect(gameOverActive([], [])).toBe(false)
    expect(gameOverActive([], ["kenta"])).toBe(false)
    expect(gameOverActive(undefined, undefined)).toBe(false)
    expect(gameOverActive(["kenta"], undefined)).toBe(false)
  })
})

describe("the fallen list", () => {
  it("adds a hero once", () => {
    expect(gameOverNoteDeath([], "kenta")).toEqual(["kenta"])
    expect(gameOverNoteDeath(["kenta"], "kenta")).toEqual(["kenta"])
    expect(gameOverNoteDeath(undefined, "scott")).toEqual(["scott"])
  })
  it("never writes into the list it was given", () => {
    const f = ["kenta"]
    gameOverNoteDeath(f, "scott")
    expect(f).toEqual(["kenta"])
  })
})

describe("Malachar's line", () => {
  it("is one of his lines, and the same for the same record on every screen", () => {
    for (const seed of ["g1", "gabc", "", 42]) {
      expect(GAME_OVER_LINES).toContain(gameOverLine(seed))
      expect(gameOverLine(seed)).toBe(gameOverLine(seed))
    }
  })
})

describe("after the letters", () => {
  it("the real game goes to the title screen", () => {
    expect(gameOverAfter({ sandbox: false, app: true })).toEqual({ kind: "title", auto: true })
    expect(GAME_OVER_RULES.title).toBe("/intro")
  })
  it("a sandbox resets the scenario, as does the stand-alone preview", () => {
    expect(gameOverAfter({ sandbox: true, app: true }).kind).toBe("reset")
    expect(gameOverAfter({ sandbox: false, app: false }).kind).toBe("reset")
  })
  it("the DM's screen waits for him in the real game, but a rehearsal resets for him too", () => {
    expect(gameOverAfter({ sandbox: false, app: true, dm: true })).toEqual({ kind: "title", auto: false })
    expect(gameOverAfter({ sandbox: true, app: true, dm: true })).toEqual({ kind: "reset", auto: true })
  })
})

describe("a reload after the end", () => {
  it("plays in full only when fresh", () => {
    expect(gameOverIsReplay(1000, 1000 + 5000)).toBe(false)
    expect(gameOverIsReplay(1000, 1000 + GAME_OVER_RULES.replayMs + 1)).toBe(true)
    expect(gameOverIsReplay(undefined, 5000)).toBe(true)
  })
})

describe("the map carries it", () => {
  it("the template pastes the rules and uses them", () => {
    const t = readFileSync("scripts/velkynvelve-walk/template.html", "utf8")
    expect(t).toContain("/*__GAME_OVER__*/")
    for (const name of ["gameOverActive(", "gameOverNoteDeath(", "gameOverLine(", "gameOverAfter(", "gameOverIsReplay("]) expect(t).toContain(name)
  })
})
