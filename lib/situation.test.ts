import { describe, expect, it } from "vitest"
import { buildSituationBlock, isWalkPatch, mergeSituation, parsePatch, sameSituation, situationForChat, startingSituation } from "./situation"

const RUN = "00000000-0000-0000-0000-000000000001"
const T0 = "2026-10-24T18:00:00.000Z"
const T1 = "2026-10-24T18:05:00.000Z"

describe("startingSituation", () => {
  it("is captive in the pen, gate locked, ward up", () => {
    const s = startingSituation(RUN, T0)
    expect(s).toMatchObject({ node_key: "velkynvelve", sub_location: "node-11-slave-pen", stance: "captive", ward_active: true, gate_state: "locked", updated_by: "restart" })
  })
})

describe("the gate and the step outside (Sam, 2026-10-24)", () => {
  it("opening the gate does NOT change the stance", () => {
    const s = mergeSituation(startingSituation(RUN, T0), { event: "gate_open" }, "walk", T1)
    expect(s.gate_state).toBe("open")
    expect(s.stance).toBe("captive")
    expect(s.ward_active).toBe(true)
  })
  it("stepping outside flips captive -> escaping and lifts the ward", () => {
    const opened = mergeSituation(startingSituation(RUN, T0), { event: "gate_open" }, "walk", T1)
    const out = mergeSituation(opened, { event: "step_outside", sub_location: "node-10-guard-tower", sub_label: "Guard Tower" }, "walk", T1)
    expect(out.stance).toBe("escaping")
    expect(out.ward_active).toBe(false)
    expect(out.sub_label).toBe("Guard Tower")
    expect(out.updated_by).toBe("walk")
  })
  it("stepping outside again does not demote a later stance back to escaping", () => {
    const free = mergeSituation(startingSituation(RUN, T0), { stance: "free" }, "dm", T1)
    expect(mergeSituation(free, { event: "step_outside" }, "walk", T1).stance).toBe("free")
  })
  it("a forced gate is broken and an open event cannot un-break it", () => {
    const broken = mergeSituation(startingSituation(RUN, T0), { event: "gate_broken" }, "walk", T1)
    expect(broken.gate_state).toBe("broken")
    expect(mergeSituation(broken, { event: "gate_open" }, "walk", T1).gate_state).toBe("broken")
  })
  it("the DM's explicit fields win over the event", () => {
    const s = mergeSituation(startingSituation(RUN, T0), { event: "step_outside", stance: "captive", ward_active: true }, "dm", T1)
    expect(s.stance).toBe("captive")
    expect(s.ward_active).toBe(true)
  })
})

describe("the surrender (Sam, 2026-10-28)", () => {
  it("recaptured puts an escaping party back in the pen: captive, gate locked, ward up", () => {
    const opened = mergeSituation(startingSituation(RUN, T0), { event: "gate_open" }, "walk", T1)
    const out = mergeSituation(opened, { event: "step_outside", sub_location: "node-10-guard-tower", sub_label: "Guard Tower" }, "walk", T1)
    const back = mergeSituation(out, { event: "recaptured", sub_location: "node-11-slave-pen", sub_label: "Slave Pen", party_present: ["Fifi", "Kenta"] }, "walk", T1)
    expect(back).toMatchObject({ stance: "captive", gate_state: "locked", ward_active: true, sub_label: "Slave Pen", party_present: ["Fifi", "Kenta"], updated_by: "walk" })
  })
  it("re-hangs a forced gate — the drow do not leave a slave pen without a door", () => {
    const broken = mergeSituation(startingSituation(RUN, T0), { event: "gate_broken" }, "walk", T1)
    expect(mergeSituation(broken, { event: "recaptured" }, "walk", T1).gate_state).toBe("locked")
  })
  it("is a walk event: a player's own browser may report it", () => {
    expect(isWalkPatch(parsePatch({ event: "recaptured", sub_location: "node-11-slave-pen" }))).toBe(true)
    expect(parsePatch({ event: "recaptured" })).toEqual({ event: "recaptured" })
  })
})

describe("parsePatch", () => {
  it("drops unknown stances, gates and events", () => {
    expect(parsePatch({ stance: "dead", gate_state: "ajar", event: "teleport", node_key: "velkynvelve" })).toEqual({ node_key: "velkynvelve" })
  })
  it("sanitises labels and caps the roster", () => {
    const p = parsePatch({ sub_label: "<script>Slave Pen</script>", party_present: Array.from({ length: 20 }, (_, i) => `Hero ${i}`) })
    expect(p.sub_label).toBe("scriptSlave Penscript")
    expect(p.party_present).toHaveLength(12)
  })
  it("tells a walk patch from a DM patch", () => {
    expect(isWalkPatch(parsePatch({ sub_location: "node-10-guard-tower", event: "step_outside", party_present: ["Fifi"] }))).toBe(true)
    expect(isWalkPatch(parsePatch({ stance: "free" }))).toBe(false)
    expect(isWalkPatch(parsePatch({ node_key: "sloobludop" }))).toBe(false)
  })
})

describe("sameSituation", () => {
  it("ignores updated_at/updated_by and compares the rest", () => {
    const a = startingSituation(RUN, T0)
    const b = mergeSituation(a, {}, "walk", T1)
    expect(sameSituation(a, b)).toBe(true)
    expect(sameSituation(a, mergeSituation(a, { sub_location: "x" }, "walk", T1))).toBe(false)
  })
})

describe("buildSituationBlock", () => {
  it("captive: names the pen, the locked gate and the ward", () => {
    const text = buildSituationBlock(startingSituation(RUN, T0), "Velkynvelve")
    expect(text).toContain("Velkynvelve — Slave Pen")
    expect(text).toContain("CAPTIVE")
    expect(text).toContain("LOCKED")
    expect(text).toContain("ward sigil still")
    expect(text).not.toContain("Do NOT refer to the party as prisoners")
  })
  it("escaping: forbids the prisoner framing and says the ward is lifted", () => {
    const out = mergeSituation(startingSituation(RUN, T0), { event: "gate_open" }, "walk", T1)
    const s = mergeSituation(out, { event: "step_outside", sub_label: "Guard Tower", party_present: ["Fifi", "Ront"] }, "walk", T1)
    const text = buildSituationBlock(s, "Velkynvelve")
    expect(text).toContain("ESCAPING")
    expect(text).toContain("LEFT the slave pen")
    expect(text).toContain("gate is OPEN")
    expect(text).toContain("no longer binds")
    expect(text).toContain("Present here: Fifi, Ront")
    expect(text).toContain("Do NOT refer to the party as prisoners")
    expect(text).not.toMatch(/manacled/)
  })
  it("away from Velkynvelve it says nothing about the gate", () => {
    const s = mergeSituation(startingSituation(RUN, T0), { node_key: "sloobludop", sub_location: null, sub_label: null, stance: "camped" }, "travel", T1)
    const text = buildSituationBlock(s, "Sloobludop")
    expect(text).toContain("Where: Sloobludop")
    expect(text).toContain("CAMPED")
    expect(text).not.toContain("gate")
  })
})

describe("situationForChat (the chat route's view)", () => {
  it("captive at Velkynvelve: the stage ladder stays on the pen and the block says CAPTIVE", () => {
    const v = situationForChat(startingSituation(RUN, T0), "Velkynvelve (slave pen)")
    expect(v).not.toBeNull()
    expect(v!.where.toLowerCase()).toContain("slave pen")
    expect(v!.note).toContain("CAPTIVE")
    expect(v!.note).toContain("Where: Velkynvelve")
  })
  it("escaping: the ladder moves to the outpost and the block forbids the prisoner framing", () => {
    const out = mergeSituation(startingSituation(RUN, T0), { event: "step_outside", sub_label: "Guard Tower" }, "walk", T1)
    const v = situationForChat(out, "Velkynvelve (slave pen)")
    expect(v!.where).toBe("Velkynvelve outpost")
    expect(v!.where.toLowerCase()).not.toContain("pen")
    expect(v!.note).toContain("Do NOT refer to the party as prisoners")
  })
  it("says nothing when the travel graph has the party somewhere else", () => {
    expect(situationForChat(startingSituation(RUN, T0), "Sloobludop")).toBeNull()
    expect(situationForChat(null, "Velkynvelve")).toBeNull()
  })
})

describe("work details (Hard Labor)", () => {
  const start = () => startingSituation("run-1", "2026-10-26T00:00:00Z")
  it("labor_out keeps the party captive but out of the ward", () => {
    const s = mergeSituation(start(), parsePatch({ event: "labor_out", sub_location: "node-10-guard-tower" }), "walk")
    expect(s.stance).toBe("captive")
    expect(s.ward_active).toBe(false)
  })
  it("labor_back puts the ward back over them", () => {
    const out = mergeSituation(start(), { event: "labor_out" }, "walk")
    expect(mergeSituation(out, { event: "labor_back" }, "walk").ward_active).toBe(true)
  })
  it("labor_back never re-wards a party that has escaped", () => {
    const esc = mergeSituation(start(), { event: "step_outside" }, "walk")
    const s = mergeSituation(esc, { event: "labor_back" }, "walk")
    expect(s.stance).toBe("escaping")
    expect(s.ward_active).toBe(false)
  })
  it("is something a player's own browser may send", () => {
    expect(isWalkPatch(parsePatch({ event: "labor_out" }))).toBe(true)
    expect(isWalkPatch(parsePatch({ event: "labor_back" }))).toBe(true)
  })
})

// THE WARD SIGIL CUT OPEN (Sam, 2026-10-30)
describe("the ward sigil", () => {
  const start = () => startingSituation(RUN, T0)
  it("ward_broken lifts the ward", () => {
    const s = mergeSituation(start(), parsePatch({ event: "ward_broken" }), "walk")
    expect(s.ward_active).toBe(false)
  })
  it("ward_broken leaves the party where it is: it is the ward that changed, not the stance or the gate", () => {
    const s = mergeSituation(start(), { event: "ward_broken" }, "walk")
    expect(s.stance).toBe("captive")
    expect(s.gate_state).toBe("locked")
  })
  it("a botched cut leaves the ward holding", () => {
    const s = mergeSituation(start(), parsePatch({ event: "ward_touched" }), "walk")
    expect(s.ward_active).toBe(true)
  })
  it("a drow reading the red scar changes nothing on the row", () => {
    const s = mergeSituation(start(), parsePatch({ event: "ward_seen" }), "walk")
    expect(s.ward_active).toBe(true)
    expect(s.stance).toBe("captive")
  })
  it("labor_back raises the ward again, and the walk's re-assert puts it back down", () => {
    // the row has no memory of the cut, so the walk re-sends ward_broken after labor_back (reportSituation)
    const broken = mergeSituation(start(), { event: "ward_broken" }, "walk")
    const back = mergeSituation(mergeSituation(broken, { event: "labor_out" }, "walk"), { event: "labor_back" }, "walk")
    expect(back.ward_active).toBe(true)
    expect(mergeSituation(back, { event: "ward_broken" }, "walk").ward_active).toBe(false)
  })
  it("recaptured raises it too, and the same re-assert answers it", () => {
    const re = mergeSituation(start(), { event: "recaptured" }, "walk")
    expect(re.ward_active).toBe(true)
    expect(mergeSituation(re, { event: "ward_broken" }, "walk").ward_active).toBe(false)
  })
  it("all three are things a player's own browser may send", () => {
    expect(isWalkPatch(parsePatch({ event: "ward_broken" }))).toBe(true)
    expect(isWalkPatch(parsePatch({ event: "ward_touched" }))).toBe(true)
    expect(isWalkPatch(parsePatch({ event: "ward_seen" }))).toBe(true)
  })
  it("ward_active itself is still not a field the walk may set", () => {
    expect(isWalkPatch(parsePatch({ ward_active: false }))).toBe(false)
  })
})
