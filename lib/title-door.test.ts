import { describe, expect, it } from "vitest"
import { doorMenu, doorTableOf, shouldPlayFilm, HOST_TABLE_LINK, REHEARSAL_HREF, REHEARSAL_LINK_LABEL } from "./title-door"

const keys = (m: ReturnType<typeof doorMenu>) => m.buttons.map((b) => b.key)
const join = (m: ReturnType<typeof doorMenu>) => m.buttons[0]
const host = (m: ReturnType<typeof doorMenu>) => m.host.buttons[0]
const WHO = ["none", "player", "dm"] as const
const TABLE = ["unknown", "closed", "lobby", "live"] as const

describe("doorMenu — one door (Sam, 2026-11-25: \"Remove Continue from the intro and load game\")", () => {
  it("players see Join a Table and nothing else, whoever they are and whatever the table is doing", () => {
    for (const w of WHO) for (const t of TABLE) {
      const m = doorMenu(w, t)
      expect(keys(m)).toEqual(["join"])
      expect(m.primary).toBe("join")
    }
  })
  it("no button anywhere says Continue, Load Game, New Campaign, New Hero, Saved Game or Rehearsal", () => {
    const all = WHO.flatMap((w) => TABLE.flatMap((t) => [false, true].flatMap((h) => { const m = doorMenu(w, t, undefined, null, h); return [...m.buttons, ...m.host.buttons, ...m.host.links] })))
    expect(all.some((b) => /continue|load game|new campaign|new hero|saved game|my words|rehearsal/i.test(b.label))).toBe(false)
  })
  it("a stranger must type the code: an empty box goes nowhere, and they are told they make a hero next", () => {
    for (const t of TABLE) {
      expect(join(doorMenu("none", t)).href).toBeNull()
      expect(join(doorMenu("none", t)).sub).toMatch(/new here/i)
    }
  })
  it("the host section is one door, Host a Table", () => {
    for (const w of WHO) expect(doorMenu(w, "closed").host.buttons.map((b) => b.key)).toEqual(["host"])
    expect(host(doorMenu("none", "closed")).label).toBe("Host a Table")
    expect(doorMenu("none", "closed").host.sub).toMatch(/Dungeon Master's code/)
    expect(doorMenu("player", "closed", undefined, null, true).host.sub).toMatch(/you host/i)
  })
  it("Host a Table: the host goes straight to their table; anyone else through the door with the code", () => {
    const h = host(doorMenu("player", "closed", undefined, null, true))
    expect(h.href).toBe("/table")
    expect(h.door).toBeFalsy()
    expect(host(doorMenu("player", "closed"))).toMatchObject({ href: "/dm", door: true })
    expect(host(doorMenu("none", "closed"))).toMatchObject({ href: "/dm", door: true })
  })
  it("a dark table earns no pill (Sam: \"The table is dark is also redundant\"); open and live still say so", () => {
    expect(doorMenu("player", "closed").status.open).toBeNull()
    expect(doorMenu("player", "unknown").status.open).toBeNull()
    expect(doorMenu("player", "lobby").status).toEqual({ open: true, text: "The table is open" })
    expect(doorMenu("none", "live").status).toEqual({ open: true, text: "A session is underway" })
  })
})

describe("Join a Table with the box left empty — a device the game already knows", () => {
  it("table open: to the table, naming the hero", () => {
    const j = join(doorMenu("player", "lobby", { seated: false, away: false }, "Fifi of Waterdeep"))
    expect(j.href).toBe("/table")
    expect(j.sub).toContain("Fifi of Waterdeep")
    expect(j.sub).toMatch(/take your seat/i)
  })
  it("table dark: waits at the table", () => {
    const j = join(doorMenu("player", "closed"))
    expect(j.href).toBe("/table")
    expect(j.sub).toMatch(/wait at the table/i)
  })
  it("the host on a dark table: to their table, and nothing opens by itself", () => {
    const j = join(doorMenu("player", "closed", undefined, null, true))
    expect(j.href).toBe("/table")
    expect(j.intent).toBeUndefined()
    expect(j.sub).toMatch(/you are the host/i)
  })
  it("live and seated: back into the game", () => {
    expect(join(doorMenu("player", "live", { seated: true, away: false })).href).toBe("/")
  })
  it("live but stepped out by the host: waits at the table, told why", () => {
    const j = join(doorMenu("player", "live", { seated: true, away: true }))
    expect(j.href).toBe("/table")
    expect(j.sub).toContain("stepped you out")
  })
  it("live without a seat: told the session began without them", () => {
    expect(join(doorMenu("player", "live")).sub).toContain("began without you")
  })
  it("table unreadable: still lets them through to the table", () => {
    expect(join(doorMenu("player", "unknown")).href).toBe("/table")
  })
  it("the DM's browser: back behind the screen", () => {
    expect(join(doorMenu("dm", "lobby")).href).toBe("/")
  })
})

describe("Rehearsal", () => {
  it("keeps its own door, reached from Settings, and is no longer a link on the title", () => {
    expect(REHEARSAL_LINK_LABEL).toBe("Rehearsal")
    expect(REHEARSAL_HREF).toBe("/rehearsal")
    for (const w of WHO) for (const t of TABLE) expect(doorMenu(w, t).host.links.some((l) => l.href === REHEARSAL_HREF)).toBe(false)
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
    expect(join(m).href).toBe("/")
    expect(m.host.links).toEqual([HOST_TABLE_LINK])
  })
  it("nobody else gets it", () => {
    expect(doorMenu("player", "live", { seated: true, away: false }).host.links).toEqual([])
    expect(doorMenu("none", "live").host.links).toEqual([])
  })
})
