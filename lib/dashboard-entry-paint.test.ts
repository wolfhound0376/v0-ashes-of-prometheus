import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

// NO BLINK ON THE WAY IN (Sam, 2026-11-23: starting a game "blinked to malachar dialogue" — "Full Parley sheet with
// cartoon malachar"). Reproduced against a local build of main: a first arrival at "/" was served the whole Parley
// (with the cartoon lich on its stage) in the HTML and painted it for 8 animation frames before the redirect to the map
// landed. "/" must paint nothing of the Parley until it has decided this arrival stays.
const page = readFileSync("app/page.tsx", "utf8")

describe("the dashboard on the way in", () => {
  it("starts undecided, so neither the server HTML nor the first frame is the Parley", () => {
    expect(page).toContain("const [entryChecked, setEntryChecked] = useState(false)")
    const gate = page.indexOf("if (!entryChecked) return")
    const parley = page.indexOf("<ParleyDashboard")
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(parley)
  })
  it("decides only after both ways on (the intro, and a first arrival's walk to the map) have been ruled out", () => {
    const toIntro = page.indexOf('window.location.replace("/intro")')
    const toMap = page.indexOf("window.location.replace(mapHref(")
    const stays = page.indexOf("setEntryChecked(true)")
    expect(toIntro).toBeGreaterThan(-1)
    expect(toMap).toBeGreaterThan(toIntro)
    expect(stays).toBeGreaterThan(toMap)
  })
  it("a claim link stays, so it is decided too", () => {
    const claim = page.indexOf("fetch('/api/verify-claim', {\n          method: 'POST',\n          headers: { 'Content-Type': 'application/json' },\n          body: JSON.stringify({ characterId: c, claimToken: k }),")
    const decided = page.lastIndexOf("setEntryChecked(true)", claim)
    expect(claim).toBeGreaterThan(-1)
    expect(decided).toBeGreaterThan(page.indexOf("window.location.replace(mapHref("))
  })
})
