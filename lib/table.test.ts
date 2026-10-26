import { describe, expect, it } from "vitest"
import {
  CLOSED, MAX_SEATS, NOT_INVITED, assignFigures, cannotChooseFigure, cannotSit, dmLight, freeSeatNumber, isComplete, missingOf, readTableState, readinessOf,
  seatLight, sheetComplete, shouldStart, type CharacterRowForReadiness, type Readiness, type TableState,
} from "./table"

const ALL: Readiness = { sprite: true, sheet: true, voice: true, thumbnail: true }
const lobby = (dmReady = false): TableState => ({ status: "lobby", dmReady, session: 1, openedAt: "x", startedAt: null })
const live: TableState = { status: "live", dmReady: true, session: 1, openedAt: "x", startedAt: "y" }

const full: CharacterRowForReadiness = {
  id: "c1", name: "Lynkes", class: "Rogue", level: 1, sheet_species: "Halfling", hp_max: 9, ac: 14,
  str_score: 8, dex_score: 16, con_score: 12, int_score: 10, wis_score: 12, cha_score: 14,
  voice_id: "v", portrait_image_url: "p.png",
}

describe("seat lights (Sam: red = deficiency, yellow = almost, green = ready)", () => {
  it("anything missing is red, even with Ready pressed", () => {
    expect(seatLight({ ...ALL, voice: false }, true)).toBe("red")
  })
  it("complete but not Ready is yellow", () => {
    expect(seatLight(ALL, false)).toBe("yellow")
  })
  it("complete and Ready is green", () => {
    expect(seatLight(ALL, true)).toBe("green")
  })
  it("a complete DM-run companion is green without a Ready press", () => {
    expect(seatLight(ALL, false, true)).toBe("green")
    expect(seatLight({ ...ALL, sprite: false }, false, true)).toBe("red")
  })
  it("names what is missing, in Sam's order", () => {
    expect(missingOf({ sprite: false, sheet: true, voice: false, thumbnail: false })).toEqual(["pixel-art figure", "voice", "portrait thumbnail"])
    expect(isComplete(ALL)).toBe(true)
  })
})

describe("the DM's light", () => {
  it("is dark with no table, yellow in the lobby, green once Start is pressed or live", () => {
    expect(dmLight(CLOSED)).toBeNull()
    expect(dmLight(lobby())).toBe("yellow")
    expect(dmLight(lobby(true))).toBe("green")
    expect(dmLight(live)).toBe("green")
  })
})

describe("the start", () => {
  it("needs the DM green and every seat green", () => {
    expect(shouldStart(lobby(true), ["green", "green"])).toBe(true)
    expect(shouldStart(lobby(false), ["green", "green"])).toBe(false)
    expect(shouldStart(lobby(true), ["green", "yellow"])).toBe(false)
    expect(shouldStart(lobby(true), ["green", "red"])).toBe(false)
  })
  it("never starts an empty table, and never restarts a live one", () => {
    expect(shouldStart(lobby(true), [])).toBe(false)
    expect(shouldStart(live, ["green"])).toBe(false)
    expect(shouldStart(CLOSED, ["green"])).toBe(false)
  })
})

describe("who may sit", () => {
  it("nobody before the DM opens the table", () => {
    expect(cannotSit(CLOSED, 0, false, true)).toMatch(/Dungeon Master/)
  })
  it("nobody new once the session is live (another session is needed)", () => {
    expect(cannotSit(live, 2, false, true)).toMatch(/next one/)
  })
  it("at most five", () => {
    expect(cannotSit(lobby(), MAX_SEATS - 1, false, true)).toBeNull()
    expect(cannotSit(lobby(), MAX_SEATS, false, true)).toMatch(/taken/)
  })
  it("a hero already in their seat is never turned away", () => {
    expect(cannotSit(live, MAX_SEATS, true, false)).toBeNull()
  })
  it("nobody sits until the DM has opened a seat to them (Sam, 2026-10-25)", () => {
    expect(cannotSit(lobby(), 0, false, false)).toBe(NOT_INVITED)
    expect(cannotSit(lobby(), 0, false, true)).toBeNull()
  })
  it("an invitation does not beat a full table or a closed one", () => {
    expect(cannotSit(lobby(), MAX_SEATS, false, true)).toMatch(/taken/)
    expect(cannotSit(CLOSED, 0, false, true)).toMatch(/not set/)
  })
  it("hands out the lowest free chair", () => {
    expect(freeSeatNumber([])).toBe(1)
    expect(freeSeatNumber([1, 3, undefined])).toBe(2)
    expect(freeSeatNumber([1, 2, 3, 4, 5])).toBeNull()
  })
})

describe("reading the stored flag", () => {
  it("an absent or garbled row is a closed table", () => {
    expect(readTableState(null)).toEqual(CLOSED)
    expect(readTableState({ status: "party" })).toEqual(CLOSED)
  })
  it("a closed table is never ready", () => {
    expect(readTableState({ status: "closed", dmReady: true }).dmReady).toBe(false)
  })
  it("keeps the session number", () => {
    expect(readTableState({ status: "lobby", session: 4 }).session).toBe(4)
  })
})

describe("readiness (Sam: pixel art, complete sheet, voice, thumbnail)", () => {
  it("a Forge hero without a baked figure is not ready, even fully written up", () => {
    const r = readinessOf(full, {})
    expect(r).toEqual({ sprite: false, sheet: true, voice: true, thumbnail: true })
  })
  it("a Forge hero listed in heroes.json has their figure", () => {
    expect(readinessOf(full, { c1: "lynkes" }).sprite).toBe(true)
  })
  it("the four canon heroes have theirs by id, whatever they are called", () => {
    expect(readinessOf({ ...full, id: "d00aa5b8-ced1-477d-9ec8-0861cca55498", name: "Fifi of Waterdeep" }, {}).sprite).toBe(true)
    expect(readinessOf({ ...full, id: "51e4202d-b4d5-4658-a9c1-6102713e77f1", name: "Kenta of Neverwinter" }, {}).sprite).toBe(true)
    // A Forge hero who merely shares a canon name does not borrow the figure.
    expect(readinessOf({ ...full, id: "x", name: "Kenta" }, {}).sprite).toBe(false)
  })
  it("any of the three portrait columns is a thumbnail; none is not", () => {
    expect(readinessOf({ ...full, portrait_image_url: null, avatar_image_url: "a" }, {}).thumbnail).toBe(true)
    expect(readinessOf({ ...full, portrait_image_url: "  " }, {}).thumbnail).toBe(false)
  })
  it("no voice id is no voice", () => {
    expect(readinessOf({ ...full, voice_id: null }, {}).voice).toBe(false)
  })
  it("a sheet missing an ability score or a species is not complete", () => {
    expect(sheetComplete({ ...full, wis_score: null })).toBe(false)
    expect(sheetComplete({ ...full, sheet_species: "" })).toBe(false)
    expect(sheetComplete(full)).toBe(true)
  })
})

describe("who you sit as (the seven cartoon players)", () => {
  it("a player's own choice wins", () => {
    const f = assignFigures([{ id: "a", seat: 1, figure: 4 }, { id: "b", seat: 2 }])
    expect(f.get("a")).toBe(4)
    expect(f.get("b")).not.toBe(4)
  })
  it("no two people at one table share a figure, even with five seats and clashing ids", () => {
    const seats = ["x1", "x2", "x3", "x4", "x5"].map((id, i) => ({ id, seat: i + 1 }))
    const f = assignFigures(seats)
    expect(new Set(f.values()).size).toBe(5)
  })
  it("the same hero gets the same figure every session", () => {
    expect(assignFigures([{ id: "kenta-id", seat: 3 }]).get("kenta-id")).toBe(assignFigures([{ id: "kenta-id", seat: 1 }]).get("kenta-id"))
  })
  it("refuses a figure someone else holds, or one that does not exist", () => {
    const seats = [{ id: "a", figure: 2 }, { id: "b" }]
    expect(cannotChooseFigure(2, "b", seats)).toMatch(/already/)
    expect(cannotChooseFigure(2, "a", seats)).toBeNull()
    expect(cannotChooseFigure(7, "b", seats)).toMatch(/not at this table/)
    expect(cannotChooseFigure("3", "b", seats)).toMatch(/not at this table/)
  })
})
