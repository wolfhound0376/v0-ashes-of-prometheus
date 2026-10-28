import { describe, expect, it } from "vitest"
import { FILM_GATE_PATHS, filmToPlay, heroFilmSeenKey, isFilmGatePath } from "./hero-film"

const LYNKES = "a4b4c7cd-4bd6-45bb-9a32-a19a37bcb774"
const FILM = "/videos/heroes/lynkes.mp4"

describe("heroFilmSeenKey", () => {
  it("is a per-character world flag", () => {
    expect(heroFilmSeenKey(LYNKES)).toBe(`hero_film_seen:${LYNKES}`)
  })
})

describe("filmToPlay", () => {
  it("plays on a first game (no flag yet)", () => {
    expect(filmToPlay({ film: FILM, seen: false }, "player")).toBe(FILM)
  })
  it("plays again after a restart (the restart deletes the flag, so seen is false again)", () => {
    expect(filmToPlay({ film: FILM, seen: false }, null)).toBe(FILM)
  })
  it("does not play twice in one run", () => {
    expect(filmToPlay({ film: FILM, seen: true }, "player")).toBeNull()
  })
  it("never plays for the DM browser", () => {
    expect(filmToPlay({ film: FILM, seen: false }, "dm")).toBeNull()
  })
  it("plays nothing for a hero without a film, or an unreadable reply", () => {
    expect(filmToPlay({ film: null, seen: false }, "player")).toBeNull()
    expect(filmToPlay(null, "player")).toBeNull()
    expect(filmToPlay({ error: "x" } as never, "player")).toBeNull()
  })
})

describe("isFilmGatePath", () => {
  it("covers every in-game page except /awaken, which plays it itself", () => {
    for (const p of FILM_GATE_PATHS) expect(isFilmGatePath(p)).toBe(true)
    expect(isFilmGatePath("/velkynvelve/")).toBe(true)
    expect(isFilmGatePath("/camp/fire")).toBe(true)
    expect(isFilmGatePath("/awaken")).toBe(false)
  })
  it("stays off the doors", () => {
    for (const p of ["/table", "/join", "/intro", "/choose", "/forge", "/dm", "/admin"]) expect(isFilmGatePath(p)).toBe(false)
    expect(isFilmGatePath("/mapper")).toBe(false)
    expect(isFilmGatePath(null)).toBe(false)
  })
})
