import { describe, expect, it } from "vitest"
import { BENCH_CLIPS, BENCH_CRIT_FILM, BENCH_FILMS, RUNE_FILMS, brewFilms, drinkFilm, methodFilm, preparedArt } from "./alchemy-art"
import { EXTRACTION_METHOD } from "./extraction"

describe("approved bench art", () => {
  it("has all six approved reaction clips", () => {
    expect(Object.keys(BENCH_CLIPS).sort()).toEqual(["idle", "inert", "mixing", "purify", "smoke", "success"])
  })

  it("has prepared art for every ingredient — Nightlight on the approved redo B", () => {
    const withArt = Object.keys(EXTRACTION_METHOD).filter((s) => preparedArt(s))
    expect(withArt.length).toBe(33)
    expect(preparedArt("nightlight-fungus")).toMatch(/nightlight-fungus-b\.png$/)
    expect(preparedArt("not-an-ingredient")).toBeNull()
  })
})

// Which approved film plays after which roll (Sam, 2026-10-01: "make sure the
// videos are wired to the result of the alchemy step").
describe("bench step films", () => {
  it("a brew that takes: the fire, then the pour", () => {
    expect(brewFilms("success", null)).toEqual([BENCH_FILMS.brewFire, BENCH_FILMS.decant])
  })
  it("a rune with a film plays between the fire and the pour", () => {
    expect(brewFilms("success", "necromancy")).toEqual([BENCH_FILMS.brewFire, RUNE_FILMS.necromancy, BENCH_FILMS.decant])
  })
  it("a rune with no film yet keeps the drawn sigil only", () => {
    expect(brewFilms("success", "evocation")).toEqual([BENCH_FILMS.brewFire, BENCH_FILMS.decant])
  })
  it("an inert brew: the fire, and nothing worth pouring", () => {
    expect(brewFilms("inert", "necromancy")).toEqual([BENCH_FILMS.brewFire])
  })
  it("a natural 1: the fire, then the failure film", () => {
    const reel = brewFilms("critical_failure", "necromancy")
    expect(reel).toHaveLength(2)
    expect(reel[0]).toBe(BENCH_FILMS.brewFire)
    expect(reel[1].mp4).toBe(BENCH_CRIT_FILM.mp4)
  })
  it("liquor comes off the still; beer and wine are decanted", () => {
    expect(drinkFilm("liquor")).toBe(BENCH_FILMS.distill)
    expect(drinkFilm("beer")).toBe(BENCH_FILMS.decant)
    expect(drinkFilm("wine")).toBe(BENCH_FILMS.decant)
  })
  it("extraction: grinding and decanting have films, cutting and pressing do not", () => {
    expect(methodFilm("grind")).toBe(BENCH_FILMS.grind)
    expect(methodFilm("decant")).toBe(BENCH_FILMS.decant)
    expect(methodFilm("cut")).toBeNull()
    expect(methodFilm("press")).toBeNull()
  })
})
