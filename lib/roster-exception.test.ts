import { describe, expect, it } from "vitest"
import { CANON_HEROES } from "./canon-heroes"
import { decideSeat, exceptionWarning } from "./roster-exception"

const fifi = CANON_HEROES.find((h) => h.slug === "fifi")!.id
const forged = "00000000-0000-0000-0000-000000000001"

describe("decideSeat", () => {
  it("seats anyone while the table is in the lobby", () => {
    expect(decideSeat("lobby", forged, false)).toEqual({ ok: true, exception: false })
  })
  it("refuses everyone while the table is closed, with no override", () => {
    const d = decideSeat("closed", fifi, true)
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.canOverride).toBe(false)
  })
  it("live: a canon hero is refused until the DM confirms, and the refusal says an override exists", () => {
    const d = decideSeat("live", fifi, false)
    expect(d.ok).toBe(false)
    if (!d.ok) { expect(d.code).toBe("roster_locked"); expect(d.canOverride).toBe(true) }
    expect(decideSeat("live", fifi, true)).toEqual({ ok: true, exception: true })
  })
  it("live: a Forge hero stays locked out even with the override", () => {
    const d = decideSeat("live", forged, true)
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.canOverride).toBe(false)
  })
})

it("the warning names the hero and the exception", () => {
  const w = exceptionWarning("Fifi of Waterdeep")
  expect(w).toContain("Fifi of Waterdeep")
  expect(w).toMatch(/exception/)
  expect(w).toMatch(/locked/)
})
