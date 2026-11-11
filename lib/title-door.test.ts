import { describe, expect, it } from "vitest"
import { doorMenu, doorTableOf, shouldPlayFilm, HOST_LINK_LABEL, REHEARSAL_HREF, REHEARSAL_LINK_LABEL } from "./title-door"

describe("doorMenu — a browser nobody has played on", () => {
  it("offers New Hero first and Saved Game second, whatever the table is doing", () => {
    for (const t of ["unknown", "closed", "lobby", "live"] as const) {
      const m = doorMenu("none", t)
      expect(m.primary.label).toBe("New Hero")
      expect(m.primary.href).toBe("/choose")
      expect(m.others.map((b) => b.label)).toEqual(["Saved Game"])
      expect(m.others[0].href).toBe("/join")
    }
  })
  it("never uses the label Sam turned down", () => {
    const all = (["none", "player", "dm"] as const).flatMap((w) => (["unknown", "closed", "lobby", "live"] as const).flatMap((t) => { const m = doorMenu(w, t); return [m.primary, ...m.others] }))
    expect(all.some((b) => /my words/i.test(b.label))).toBe(false)
  })
})

describe("doorMenu — a returning player", () => {
  it("table open: Take Your Seat goes straight to the table", () => {
    const m = doorMenu("player", "lobby", { seated: false, away: false }, "Fifi of Waterdeep")
    expect(m.primary.label).toBe("Take Your Seat")
    expect(m.primary.href).toBe("/table")
    expect(m.primary.sub).toContain("Fifi of Waterdeep")
    expect(m.status).toEqual({ open: true, text: "The table is open" })
  })
  it("table dark: Wait at the Table, and the pill says dark", () => {
    const m = doorMenu("player", "closed")
    expect(m.primary.label).toBe("Wait at the Table")
    expect(m.primary.href).toBe("/table")
    expect(m.status).toEqual({ open: false, text: "The table is dark" })
  })
  it("live and seated: Return to the Game", () => {
    const m = doorMenu("player", "live", { seated: true, away: false })
    expect(m.primary.label).toBe("Return to the Game")
    expect(m.primary.href).toBe("/")
  })
  it("live but stepped out by the host: waits at the table, told why", () => {
    const m = doorMenu("player", "live", { seated: true, away: true })
    expect(m.primary.label).toBe("Wait at the Table")
    expect(m.primary.sub).toContain("stepped you out")
  })
  it("live without a seat: waits at the table, told the session began without them", () => {
    const m = doorMenu("player", "live", { seated: false, away: false })
    expect(m.primary.label).toBe("Wait at the Table")
    expect(m.primary.sub).toContain("began without you")
  })
  it("table unreadable: still lets them through to the table, with no status pill", () => {
    const m = doorMenu("player", "unknown")
    expect(m.primary.href).toBe("/table")
    expect(m.status.open).toBeNull()
  })
  it("can always play someone else", () => {
    expect(doorMenu("player", "lobby").others.map((b) => b.href)).toEqual(["/choose", "/join"])
  })
})

describe("doorMenu — the DM's browser (unchanged until the host PR)", () => {
  it("keeps Continue to the dashboard", () => {
    const m = doorMenu("dm", "lobby")
    expect(m.primary.label).toBe("Continue")
    expect(m.primary.href).toBe("/")
  })
  it("the corner link is Host a Game", () => { expect(HOST_LINK_LABEL).toBe("Host a Game") })
  it("the second corner link is Rehearsal, and it goes to its own door, not the host screen", () => {
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

describe("doorMenu — the host", () => {
  it("table dark: Open the Table", () => {
    const m = doorMenu("player", "closed", { seated: false, away: false }, "Fifi of Waterdeep", true)
    expect(m.primary.label).toBe("Open the Table")
    expect(m.primary.href).toBe("/table")
  })
  it("live and seated: Return to the Game first, The Table second", () => {
    const m = doorMenu("player", "live", { seated: true, away: false }, null, true)
    expect(m.primary.label).toBe("Return to the Game")
    expect(m.others[0]).toMatchObject({ label: "The Table", href: "/table" })
  })
  it("table open: takes a seat like anyone else", () => {
    expect(doorMenu("player", "lobby", { seated: false, away: false }, null, true).primary.label).toBe("Take Your Seat")
  })
  it("a player who is not the host never sees Open the Table", () => {
    expect(doorMenu("player", "closed").primary.label).toBe("Wait at the Table")
  })
})
