import { describe, expect, it } from "vitest"
import { applyEventsTo, keepPledge, pledgeDaggerDue, pledgeTag, type Stage } from "./stage-roster"

// Sam, 2026-11-12: "Jorlan's yes is a real thing that the game holds. You hear it get unlocked. If persuaded he even
// leaves a dagger." (Kenta said yes; Jorlan said "The gate. Next watch change."; the wait ran; nothing happened.)

const onDuty = (rot = 5): Stage => ({ area: "Velkynvelve", present: {}, gone: {}, watch: null, gate: null, rotations: rot, jorlanAt: 3, updatedAt: "" })
const change = { kind: "watch", state: "changing" } as const

describe("Malachar's tag", () => {
  it("reads who said yes, and the dagger", () => {
    expect(pledgeTag("He turns away. [JORLAN_PLEDGE: Kenta of Neverwinter]")).toEqual({ kind: "pledge", by: "Kenta of Neverwinter", dagger: false })
    expect(pledgeTag("[JORLAN_PLEDGE: Fifi | dagger]")).toEqual({ kind: "pledge", by: "Fifi", dagger: true })
    expect(pledgeTag("[JORLAN_PLEDGE: anyone]")).toEqual({ kind: "pledge", by: null, dagger: false })
    expect(pledgeTag("no tag here")).toBeNull()
  })
})

describe("Jorlan keeps his word at the next watch change", () => {
  it("the night it went wrong: yes at rotation 5, the watch changes, the gate is unlocked", () => {
    const s = onDuty(5)
    applyEventsTo(s, [{ kind: "pledge", by: "Kenta of Neverwinter", dagger: false }], "t1")
    expect(s.gate).toBeNull()                                         // nothing yet: he said the NEXT change
    applyEventsTo(s, [change], "t2")
    expect(s.gate).toEqual({ state: "unlocked", since: "t2" })
    expect(s.jorlanPledge?.keptAt).toBe("t2")
    expect(pledgeDaggerDue(s)).toBe(false)
  })

  it("not at the same change as the yes, even in one turn", () => {
    const s = onDuty(5)
    applyEventsTo(s, [change, { kind: "pledge", by: "Fifi", dagger: false }], "t1")
    expect(s.gate).toBeNull()
    applyEventsTo(s, [change], "t2")
    expect(s.gate?.state).toBe("unlocked")
  })

  it("waits for a change with him on duty", () => {
    const s: Stage = { ...onDuty(1), jorlanAt: 3 }
    applyEventsTo(s, [{ kind: "pledge", by: "Fifi", dagger: false }], "t1")
    applyEventsTo(s, [change], "t2")                                 // rotation 2: he is not on yet
    expect(s.gate).toBeNull()
    applyEventsTo(s, [change], "t3")                                 // rotation 3: he is
    expect(s.gate?.state).toBe("unlocked")
  })

  it("persuaded: the dagger is owed to the floor once kept", () => {
    const s = onDuty()
    applyEventsTo(s, [{ kind: "pledge", by: "Kenta", dagger: false }], "t1")
    applyEventsTo(s, [{ kind: "pledge", by: "Kenta", dagger: true }], "t1b")   // won him over later, before the watch
    expect(pledgeDaggerDue(s)).toBe(false)
    applyEventsTo(s, [change], "t2")
    expect(pledgeDaggerDue(s)).toBe(true)
    s.jorlanPledge!.daggerPlaced = true
    expect(pledgeDaggerDue(s)).toBe(false)
  })

  it("dead men keep nothing; a gate already open is left open; once per run", () => {
    const dead = onDuty(); dead.gone["jorlan-duskryn"] = { name: "Jorlan Duskryn", slug: "jorlan-duskryn", aliases: [], hp: 0, hpMax: 71, since: "", dead: true }
    applyEventsTo(dead, [{ kind: "pledge", by: "Fifi", dagger: true }, change], "t1")
    expect(dead.jorlanPledge ?? null).toBeNull()
    expect(dead.gate).toBeNull()

    const open = onDuty(); open.gate = { state: "open", since: "t0" }
    applyEventsTo(open, [{ kind: "pledge", by: "Fifi", dagger: false }], "t1")
    applyEventsTo(open, [change], "t2")
    expect(open.gate?.state).toBe("open")

    const s = onDuty()
    applyEventsTo(s, [{ kind: "pledge", by: "Fifi", dagger: false }], "t1"); applyEventsTo(s, [change], "t2")
    s.gate = { state: "locked", since: "t3" }
    applyEventsTo(s, [{ kind: "pledge", by: "Kenta", dagger: false }], "t4"); applyEventsTo(s, [change], "t5")
    expect(s.gate.state).toBe("locked")
    expect(keepPledge(s, "t6")).toBe(false)
  })
})
