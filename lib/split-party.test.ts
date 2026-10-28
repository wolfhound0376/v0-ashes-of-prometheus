import { describe, expect, it } from "vitest"
import { plateInfo, situationForSpeaker, splitForSpeaker, splitNote } from "./split-party"
import { startingSituation } from "./situation"

const FIFI = "d00aa5b8-ced1-477d-9ec8-0861cca55498", GANDALF = "614cac3d-f119-4b35-af78-766ddb510619", LYNKES = "a4b4c7cd-4bd6-45bb-9a32-a19a37bcb774"
const NAMES = { [FIFI]: "Fifi of Waterdeep", [GANDALF]: "Gandalf", [LYNKES]: "Lynkes" }

describe("split party: Malachar hears where the speaker is", () => {
  it("knows the walk's plates by number and by letter", () => {
    expect(plateInfo(11)?.slug).toBe("node-11-slave-pen")
    expect(plateInfo("11")?.name).toBe("Slave Pen")
    expect(plateInfo("10B")?.slug).toMatch(/^node-10b-/)
    expect(plateInfo("nowhere")).toBeNull()
  })

  it("says nothing while the party stands together", () => {
    const heroes = { freia: { plate: "11", cid: FIFI }, gandalf: { plate: "11", cid: GANDALF } }
    expect(splitForSpeaker(heroes, NAMES, FIFI)).toBeNull()
  })

  it("tells the speaker where they are, who is with them and who is elsewhere", () => {
    const heroes = { freia: { plate: "9", cid: FIFI }, gandalf: { plate: "11", cid: GANDALF }, lynkes: { plate: "9", cid: LYNKES } }
    const v = splitForSpeaker(heroes, NAMES, FIFI)!
    expect(v.here.name).toBe("Waterfall")
    expect(v.withSpeaker.sort()).toEqual(["Fifi of Waterdeep", "Lynkes"])
    expect(v.elsewhere).toEqual([{ name: "Gandalf", plate: plateInfo("11") }])
  })

  it("is silent for a speaker with no hero on the map", () => {
    const heroes = { freia: { plate: "9", cid: FIFI }, gandalf: { plate: "11", cid: GANDALF } }
    expect(splitForSpeaker(heroes, NAMES, "someone-else")).toBeNull()
    expect(splitForSpeaker(heroes, NAMES, null)).toBeNull()
  })

  it("retells the party's row for the speaker: their plate, their company, the stance there", () => {
    const row = startingSituation("run-1")                          // captive, in the pen
    const away = splitForSpeaker({ freia: { plate: "9", cid: FIFI }, gandalf: { plate: "11", cid: GANDALF } }, NAMES, FIFI)!
    const s = situationForSpeaker(row, away)
    expect(s.sub_label).toBe("Waterfall")
    expect(s.party_present).toEqual(["Fifi of Waterdeep"])
    expect(s.stance).toBe("escaping")                                // out of the pen is out of the pen
    const home = splitForSpeaker({ freia: { plate: "9", cid: FIFI }, gandalf: { plate: "11", cid: GANDALF } }, NAMES, GANDALF)!
    expect(situationForSpeaker(row, home).stance).toBe("captive")   // still in the pen while the party's row is captive
  })

  it("writes the rule Malachar plays by", () => {
    const v = splitForSpeaker({ freia: { plate: "9", cid: FIFI }, gandalf: { plate: "11", cid: GANDALF } }, NAMES, GANDALF)!
    const note = splitNote(v, "Gandalf")
    expect(note).toContain("Gandalf is at Slave Pen, alone.")
    expect(note).toContain("Fifi of Waterdeep (Waterfall)")
    expect(note).toMatch(/Narrate only what Gandalf can see and hear/)
  })
})
