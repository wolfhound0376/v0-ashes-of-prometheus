import { describe, expect, it } from "vitest"
import { ACTIVITIES, describeSituation, parseSituationInput, situationRow } from "./situation"

const RUN = "11111111-2222-3333-4444-555555555555"

const walkPayload = {
  activity: "talking",
  place: "Velkynvelve",
  areaKey: "node-08-shoor-quarters",
  areaNo: 8,
  areaName: "Shoor's Quarters",
  talkingTo: "Jorlan Duskryn",
  leader: "Kenta",
  party: [
    { slug: "kenta", name: "Kenta", characterId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", down: false },
    { slug: "scott", name: "Scott", characterId: null, down: true },
  ],
  company: [{ slug: "eldeth", name: "Eldeth" }, { slug: "sarith", name: "Sarith" }],
  nearby: [
    { slug: "jorlan", name: "Jorlan Duskryn", hostile: false, down: false, body: false },
    { slug: "drow-guard-male", name: "Drow guard", hostile: true, down: false, body: false },
    { slug: "quaggoth", name: "Quaggoth", hostile: true, down: true, body: true },
  ],
  flags: { gateOpen: true, clearedHere: false, penKey: true },
  note: "The pen gate swings open.",
}

describe("parseSituationInput", () => {
  it("accepts what the walk sends and keeps it as sent", () => {
    const r = parseSituationInput(walkPayload)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.activity).toBe("talking")
    expect(r.value.talkingTo).toBe("Jorlan Duskryn")
    expect(r.value.areaNo).toBe(8)
    expect(r.value.party).toHaveLength(2)
    expect(r.value.party[0].characterId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    expect(r.value.party[1].down).toBe(true)
    expect(r.value.company.map((c) => c.slug)).toEqual(["eldeth", "sarith"])
    expect(r.value.nearby[2]).toEqual({ slug: "quaggoth", name: "Quaggoth", hostile: true, down: true, body: true })
    expect(r.value.flags).toEqual({ gateOpen: true, clearedHere: false, penKey: true })
  })

  it("rejects an unknown activity and a missing area", () => {
    expect(parseSituationInput({ ...walkPayload, activity: "sleeping" })).toMatchObject({ ok: false })
    expect(parseSituationInput({ ...walkPayload, areaKey: "" })).toMatchObject({ ok: false })
    expect(parseSituationInput(null)).toMatchObject({ ok: false })
    expect(parseSituationInput([])).toMatchObject({ ok: false })
  })

  it("requires a partner while talking, and drops the partner otherwise", () => {
    expect(parseSituationInput({ ...walkPayload, talkingTo: "" })).toMatchObject({ ok: false })
    const r = parseSituationInput({ ...walkPayload, activity: "exploring" })
    expect(r.ok && r.value.talkingTo).toBe(null)
  })

  it("clamps strings, caps lists and ignores junk", () => {
    const long = "x".repeat(500)
    const r = parseSituationInput({
      ...walkPayload,
      activity: "fighting",
      note: long,
      areaNo: "12",
      party: Array.from({ length: 20 }, (_, i) => ({ slug: `p${i}`, name: `P${i}`, characterId: "not-a-uuid" })),
      nearby: [null, 5, { name: "no slug" }, { slug: "ok" }],
      flags: { gateOpen: "yes", bogus: true },
      extra: "dropped",
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.note).toHaveLength(240)
    expect(r.value.areaNo).toBe(12)
    expect(r.value.party).toHaveLength(8)
    expect(r.value.party[0].characterId).toBe(null)
    expect(r.value.nearby).toEqual([{ slug: "ok", name: "ok", hostile: false, down: false, body: false }])
    expect(r.value.flags).toEqual({ gateOpen: true })
    expect((r.value as unknown as Record<string, unknown>).extra).toBeUndefined()
  })

  it("knows every activity in the vocabulary", () => {
    for (const a of ACTIVITIES) {
      const r = parseSituationInput({ ...walkPayload, activity: a, talkingTo: a === "talking" ? "Jorlan" : null })
      expect(r.ok, a).toBe(true)
    }
  })
})

describe("situationRow", () => {
  it("maps the input onto the table's columns for one run", () => {
    const r = parseSituationInput(walkPayload)
    if (!r.ok) throw new Error(r.error)
    const row = situationRow(r.value, RUN)
    expect(row.campaign_run_id).toBe(RUN)
    expect(row.source).toBe("walk")
    expect(row.area_key).toBe("node-08-shoor-quarters")
    expect(row.area_no).toBe(8)
    expect(row.talking_to).toBe("Jorlan Duskryn")
    expect(row.party).toBe(r.value.party)
    expect(Date.parse(row.updated_at)).not.toBeNaN()
  })
})

describe("describeSituation", () => {
  it("is null for no row", () => {
    expect(describeSituation(null)).toBe(null)
  })

  it("says only what the row says, in one paragraph", () => {
    const r = parseSituationInput(walkPayload)
    if (!r.ok) throw new Error(r.error)
    const text = describeSituation(situationRow(r.value, RUN))!
    expect(text).toContain("Velkynvelve — Shoor's Quarters (area 8).")
    expect(text).toContain("Kenta leads.")
    expect(text).toContain("Scott is down.")
    expect(text).toContain("Walking with them: Eldeth and Sarith.")
    expect(text).toContain("Also here: Jorlan Duskryn and Drow guard (hostile).")
    expect(text).toContain("Dead on the ground: Quaggoth.")
    expect(text).toContain("They are talking with Jorlan Duskryn.")
    expect(text).toContain("The pen gate is open.")
    expect(text).toContain("They hold the pen key.")
    expect(text).toContain("Last: The pen gate swings open.")
    expect(text.split("\n")).toHaveLength(1)
  })

  it("names the rest of the party after the leader", () => {
    const r = parseSituationInput({ ...walkPayload, activity: "exploring", party: [...walkPayload.party, { slug: "samson", name: "Samson" }] })
    if (!r.ok) throw new Error(r.error)
    const text = describeSituation(situationRow(r.value, RUN))!
    expect(text).toContain("Kenta leads, with Samson.")
    expect(text).toContain("They are looking around.")
  })
})
