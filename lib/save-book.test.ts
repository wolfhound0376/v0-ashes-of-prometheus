import { describe, expect, it } from "vitest"
import { bookOf, playedFor, sessionSeconds } from "./save-book"
import { plateArt } from "./plate-art"
import type { SaveRow } from "./saves"

const row = (o: Partial<SaveRow> & { id: string; saved_at: string }): SaveRow => ({
  name: o.id, created_at: o.saved_at, session_no: 1, place: null, host: null, party: [], is_loaded: false, ...o,
})

describe("bookOf", () => {
  it("one card per campaign, its checkpoints under it, newest first", () => {
    const book = bookOf([
      row({ id: "A", kind: "head", campaign_id: "A", saved_at: "2026-11-20T00:00:00Z" }),
      row({ id: "B", kind: "head", campaign_id: "B", saved_at: "2026-11-21T00:00:00Z" }),
      row({ id: "a1", kind: "auto", campaign_id: "A", saved_at: "2026-11-22T00:00:00Z" }),
      row({ id: "a2", kind: "named", campaign_id: "A", saved_at: "2026-11-19T00:00:00Z" }),
    ])
    expect(book.map((c) => c.id)).toEqual(["A", "B"]) // A's newest checkpoint is newer than B
    expect(book[0].checkpoints.map((c) => c.id)).toEqual(["a1", "a2"])
    expect(book[0].lastPlayed).toBe("2026-11-22T00:00:00Z")
    expect(book[1].checkpoints).toEqual([])
  })
  it("old rows without a kind are campaigns of their own; orphaned checkpoints are not shown", () => {
    const book = bookOf([row({ id: "old", saved_at: "2026-11-01T00:00:00Z" }), row({ id: "x", kind: "auto", campaign_id: "gone", saved_at: "2026-11-02T00:00:00Z" })])
    expect(book.map((c) => c.id)).toEqual(["old"])
    expect(book[0].kind).toBe("head")
  })
})

describe("play time", () => {
  it("reads in hours and minutes", () => {
    expect(playedFor(0)).toBe("")
    expect(playedFor(59)).toBe("")
    expect(playedFor(45 * 60)).toBe("45 m")
    expect(playedFor(3 * 3600 + 20 * 60)).toBe("3 h 20 m")
    expect(playedFor(null)).toBe("")
  })
  it("a session counts from going live to End, at most a day", () => {
    const now = Date.parse("2026-11-23T04:00:00Z")
    expect(sessionSeconds("2026-11-23T01:30:00Z", now)).toBe(9000)
    expect(sessionSeconds(null, now)).toBe(0)
    expect(sessionSeconds("2026-11-20T00:00:00Z", now)).toBe(86400)
    expect(sessionSeconds("garbage", now)).toBe(0)
  })
})

describe("plateArt", () => {
  it("a plate with its own picture is served from the site; the rest from the bucket by slug", () => {
    expect(plateArt("ruins-great-hall")).toEqual({ name: "The Ruins: the great hall", art: "/velkynvelve-walk/img/ruins-great-hall.jpg" })
    const pen = plateArt("11")
    expect(pen.name).toBe("Slave Pen")
    expect(pen.art).toMatch(/vtt-assets\/scenes\/velkynvelve\/walk\/img\/node-11-slave-pen\.jpg$/)
  })
  it("unknown or missing plates have no picture", () => {
    expect(plateArt("nowhere")).toEqual({ name: null, art: null })
    expect(plateArt(null)).toEqual({ name: null, art: null })
  })
})
