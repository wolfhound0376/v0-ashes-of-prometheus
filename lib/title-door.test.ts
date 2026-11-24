import { describe, expect, it } from "vitest"
import { doorMenu, doorTableOf, shouldPlayFilm, HOST_TABLE_LINK, NEW_HERO_LINK, REHEARSAL_HREF, REHEARSAL_LINK_LABEL, SAVED_GAME_LINK } from "./title-door"

const keys = (m: ReturnType<typeof doorMenu>) => m.buttons.map((b) => b.key)
const btn = (m: ReturnType<typeof doorMenu>, k: string) => m.buttons.find((b) => b.key === k)!

describe("doorMenu — the four buttons (Sam, 2026-11-23: PR3)", () => {
  it("a browser nobody has played on: no Continue, and Join a Table is the lit one", () => {
    for (const t of ["unknown", "closed", "lobby", "live"] as const) {
      const m = doorMenu("none", t)
      expect(keys(m)).toEqual(["new", "load", "join"])
      expect(m.primary).toBe("join")
      expect(btn(m, "join").href).toBeNull()
    }
  })
  it("always in the same order, Continue first when there is one", () => {
    expect(keys(doorMenu("player", "lobby"))).toEqual(["continue", "new", "load", "join"])
    expect(keys(doorMenu("dm", "closed"))).toEqual(["continue", "new", "load", "join"])
    expect(doorMenu("player", "lobby").primary).toBe("continue")
  })
  it("New Campaign goes through the DM door and asks for the code", () => {
    const b = btn(doorMenu("player", "closed", undefined, null, true), "new")
    expect(b.href).toBe("/dm")
    expect(b.door).toBe(true)
    expect(b.intent).toBe("new")
    expect(b.sub).toMatch(/code/i)
  })
  it("Load Game: the host goes straight to the shelf; anyone else through the door with the code", () => {
    const host = btn(doorMenu("player", "closed", undefined, null, true), "load")
    expect(host).toMatchObject({ href: "/table", intent: "load" })
    expect(host.door).toBeFalsy()
    const other = btn(doorMenu("player", "closed"), "load")
    expect(other).toMatchObject({ href: "/dm", door: true, intent: "load" })
  })
  it("never uses the label Sam turned down", () => {
    const all = (["none", "player", "dm"] as const).flatMap((w) => (["unknown", "closed", "lobby", "live"] as const).flatMap((t) => doorMenu(w, t).buttons))
    expect(all.some((b) => /my words/i.test(b.label))).toBe(false)
    expect(SAVED_GAME_LINK.label).toBe("Saved Game")
    expect(SAVED_GAME_LINK.href).toBe("/join")
    expect(NEW_HERO_LINK.href).toBe("/choose")
  })
})

describe("Continue — a returning player", () => {
  it("table open: to the table, naming the hero", () => {
    const c = btn(doorMenu("player", "lobby", { seated: false, away: false }, "Fifi of Waterdeep"), "continue")
    expect(c.href).toBe("/table")
    expect(c.sub).toContain("Fifi of Waterdeep")
    expect(c.sub).toMatch(/take your seat/i)
    expect(doorMenu("player", "lobby").status).toEqual({ open: true, text: "The table is open" })
  })
  it("table dark: waits at the table, and the pill says dark", () => {
    const m = doorMenu("player", "closed")
    expect(btn(m, "continue").href).toBe("/table")
    expect(btn(m, "continue").intent).toBeUndefined()
    expect(m.status).toEqual({ open: false, text: "The table is dark" })
  })
  it("the host on a dark table: the table opens itself on arrival", () => {
    const c = btn(doorMenu("player", "closed", undefined, null, true), "continue")
    expect(c).toMatchObject({ href: "/table", intent: "open" })
  })
  it("live and seated: back into the game", () => {
    expect(btn(doorMenu("player", "live", { seated: true, away: false }), "continue").href).toBe("/")
  })
  it("live but stepped out by the host: waits at the table, told why", () => {
    const c = btn(doorMenu("player", "live", { seated: true, away: true }), "continue")
    expect(c.href).toBe("/table")
    expect(c.sub).toContain("stepped you out")
  })
  it("live without a seat: told the session began without them", () => {
    expect(btn(doorMenu("player", "live"), "continue").sub).toContain("began without you")
  })
  it("table unreadable: still lets them through to the table, with no status pill", () => {
    const m = doorMenu("player", "unknown")
    expect(btn(m, "continue").href).toBe("/table")
    expect(m.status.open).toBeNull()
  })
  it("the DM's browser: Continue goes behind the screen", () => {
    expect(btn(doorMenu("dm", "lobby"), "continue").href).toBe("/")
  })
})

describe("the corner", () => {
  it("Rehearsal goes to its own door, not the host screen", () => {
    expect(REHEARSAL_LINK_LABEL).toBe("Rehearsal")
    expect(REHEARSAL_HREF).toBe("/rehearsal")
  })
})

describe("doorTableOf", () => {
  it("passes the three states and treats anything else as unknown", () => {
    expect(doorTableOf("closed")).toBe("closed")
    expect(doorTableOf("lobby")).toBe("lobby")
    expect(doorTableOf("live")).toBe("live")
    expect(doorTableOf(undefined)).toBe("unknown")
    expect(doorTableOf("paused")).toBe("unknown")
  })
})

describe("shouldPlayFilm — once per device per run", () => {
  const base = { cinematics: true, seenThisSession: false, seenRun: null as string | null, currentRun: "run-2" as string | null }
  it("plays on a device that has never seen it", () => { expect(shouldPlayFilm(base)).toBe(true) })
  it("plays on a fresh device even when the run cannot be read", () => { expect(shouldPlayFilm({ ...base, currentRun: null })).toBe(true) })
  it("does not replay under the same run", () => { expect(shouldPlayFilm({ ...base, seenRun: "run-2" })).toBe(false) })
  it("plays once more after a New Game", () => { expect(shouldPlayFilm({ ...base, seenRun: "run-1" })).toBe(true) })
  it("does not replay when it was seen and the run cannot be read", () => { expect(shouldPlayFilm({ ...base, seenRun: "run-1", currentRun: null })).toBe(false) })
  it("never plays with Cinematics off, or twice in one browser session", () => {
    expect(shouldPlayFilm({ ...base, cinematics: false })).toBe(false)
    expect(shouldPlayFilm({ ...base, seenThisSession: true })).toBe(false)
  })
})

describe("doorMenu — the host mid-session", () => {
  it("keeps a small link back to the table", () => {
    const m = doorMenu("player", "live", { seated: true, away: false }, null, true)
    expect(btn(m, "continue").href).toBe("/")
    expect(m.links[0]).toEqual(HOST_TABLE_LINK)
  })
  it("nobody else gets it", () => {
    expect(doorMenu("player", "live", { seated: true, away: false }).links).toEqual([SAVED_GAME_LINK, NEW_HERO_LINK])
    expect(doorMenu("none", "live").links).toEqual([SAVED_GAME_LINK, NEW_HERO_LINK])
  })
})
