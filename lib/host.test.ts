import { describe, expect, it } from "vitest"
import { HOST_ACTIONS, actorFor, readHostValue } from "./host"

const nobody = { dm: false, dmCookie: false, host: false }
const host = { ...nobody, host: true }
const dmCookie = { dm: true, dmCookie: true, host: false }
const dmHeader = { dm: true, dmCookie: false, host: false }

describe("actorFor — the host", () => {
  it("may run the table with their hero's claim alone", () => {
    for (const a of HOST_ACTIONS) expect(actorFor(a, host)).toEqual({ actor: "host" })
  })
  it("may NOT reset the campaign or name a host: that needs the key", () => {
    expect(actorFor("new", host)).toHaveProperty("refused")
    expect(actorFor("host", host)).toHaveProperty("refused")
  })
})

describe("actorFor — the DM code", () => {
  it("the door cookie can do everything, the reset included", () => {
    for (const a of [...HOST_ACTIONS, "new", "host"]) expect(actorFor(a, dmCookie)).toEqual({ actor: "dm" })
  })
  it("the older header still cannot open, reset or name a host", () => {
    for (const a of ["open", "new", "host"]) expect(actorFor(a, dmHeader)).toHaveProperty("refused")
    expect(actorFor("start", dmHeader)).toEqual({ actor: "dm" })
    expect(actorFor("end", dmHeader)).toEqual({ actor: "dm" })
  })
  it("a header-DM who is also the host opens the table as the host", () => {
    expect(actorFor("open", { dm: true, dmCookie: false, host: true })).toEqual({ actor: "host" })
  })
})

describe("actorFor — everyone else", () => {
  it("a player who is not the host can do none of it", () => {
    for (const a of [...HOST_ACTIONS, "new", "host"]) expect(actorFor(a, nobody)).toHaveProperty("refused")
  })
})

describe("readHostValue", () => {
  it("reads a host and rejects junk", () => {
    expect(readHostValue({ id: "a", name: "Fifi", at: "t" })).toEqual({ id: "a", name: "Fifi", at: "t" })
    expect(readHostValue(null)).toBeNull()
    expect(readHostValue({ name: "x" })).toBeNull()
    expect(readHostValue("a")).toBeNull()
  })
})
