import { describe, expect, it } from "vitest"
import { addSuggestion, cleanSuggestion, floorFor, floorKey, floorLive, freshSuggestions, heldByAnother, sameNpc, FLOOR_STALE_MS, SUGGESTIONS_KEPT, SUGGESTION_MAX } from "./talk-floor"

const NOW = Date.parse("2026-11-21T01:51:00Z")
const row = (npc: string, speaker: string, agoMs = 1000) => ({ npc: floorKey(npc), speaker, beat_at: new Date(NOW - agoMs).toISOString() })

describe("who an NPC is", () => {
  it("matches a first name to the full name, either way round", () => {
    expect(sameNpc("Jorlan", "Jorlan Duskryn")).toBe(true)
    expect(sameNpc("jorlan duskryn", "Jorlan")).toBe(true)
    expect(sameNpc("  Jorlan   Duskryn ", "jorlan duskryn")).toBe(true)
  })
  it("does not confuse two NPCs who share a first word", () => {
    expect(sameNpc("Drow Guard", "Drow Elite Warrior")).toBe(false)
    expect(sameNpc("Eldeth Feldrun", "Jorlan Duskryn")).toBe(false)
    expect(sameNpc("", "Jorlan")).toBe(false)
  })
})

describe("the floor", () => {
  it("is held while the speaker's screen keeps beating", () => {
    expect(floorLive(row("Jorlan Duskryn", "Kenta of Neverwinter"), NOW)).toBe(true)
    expect(floorLive(row("Jorlan Duskryn", "Kenta of Neverwinter", FLOOR_STALE_MS + 1), NOW)).toBe(false)
    expect(floorLive(null, NOW)).toBe(false)
  })
  it("refuses the second hero and not the first (the Jorlan night)", () => {
    const rows = [row("Jorlan Duskryn", "Kenta of Neverwinter")]
    expect(heldByAnother(rows, "Jorlan Duskryn", "Fifi of Waterdeep", NOW)).toBe("Kenta of Neverwinter")
    expect(heldByAnother(rows, "Jorlan", "Fifi of Waterdeep", NOW)).toBe("Kenta of Neverwinter")
    expect(heldByAnother(rows, "Jorlan Duskryn", "kenta of neverwinter", NOW)).toBeNull()
  })
  it("leaves every other NPC free: two talks at once are allowed", () => {
    const rows = [row("Jorlan Duskryn", "Kenta of Neverwinter")]
    expect(heldByAnother(rows, "Eldeth Feldrun", "Fifi of Waterdeep", NOW)).toBeNull()
  })
  it("frees itself when the speaker's screen goes quiet", () => {
    const rows = [row("Jorlan Duskryn", "Kenta of Neverwinter", FLOOR_STALE_MS + 5000)]
    expect(floorFor(rows, "Jorlan Duskryn", NOW)).toBeNull()
    expect(heldByAnother(rows, "Jorlan Duskryn", "Fifi of Waterdeep", NOW)).toBeNull()
  })
})

describe("suggestions", () => {
  const s = (from: string, text: string, at = "2026-11-21T01:51:10Z") => ({ from, text, at })
  it("are trimmed to one short line", () => {
    expect(cleanSuggestion("  ask   what he\nwants ")).toBe("ask what he wants")
    expect(cleanSuggestion("x".repeat(500)).length).toBe(SUGGESTION_MAX)
  })
  it("keep one per hero, newest last, and only the last few", () => {
    let list = addSuggestion([], s("Fifi", "bribe him"))
    list = addSuggestion(list, s("Scott", "sing"))
    list = addSuggestion(list, s("Fifi", "no, threaten him"))
    expect(list.map((x) => `${x.from}: ${x.text}`)).toEqual(["Scott: sing", "Fifi: no, threaten him"])
    for (let i = 0; i < 10; i++) list = addSuggestion(list, s(`hero${i}`, "x"))
    expect(list.length).toBe(SUGGESTIONS_KEPT)
  })
  it("go stale once the speaker has spoken", () => {
    const list = [s("Fifi", "old", "2026-11-21T01:50:00Z"), s("Scott", "new", "2026-11-21T01:52:00Z")]
    expect(freshSuggestions(list, Date.parse("2026-11-21T01:51:00Z")).map((x) => x.text)).toEqual(["new"])
  })
})
