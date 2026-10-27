import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"
import {
  MISSES_BEFORE_RESYNC, ONLINE_MS, canon, cleanPatch, driverOf, fingerprint, heartbeatVerdict, mayWriteHero,
  plateId, samePlate, seededRandom, seededRoll, worldDigest, type Seat,
} from "./walk-world"

const seat = (over: Partial<Seat>): Seat => ({ at: 0, slug: null, cid: null, dm: false, seat: null, digest: "", version: 0, status: "in-step", ...over })

describe("canon / worldDigest", () => {
  it("ignores key order at every depth (jsonb does not keep it)", () => {
    const a = { gateOpen: true, rolls: { 3: { hall: 2, guards: 1 } }, talked: { ront: true } }
    const b = { talked: { ront: true }, rolls: { 3: { guards: 1, hall: 2 } }, gateOpen: true }
    expect(canon(a)).toBe(canon(b))
    expect(worldDigest(11, a)).toBe(worldDigest(11, b))
  })
  it("drops undefined like JSON does, so a value that never reached the server does not count", () => {
    expect(canon({ a: 1, b: undefined })).toBe(canon({ a: 1 }))
    expect(canon([1, undefined])).toBe("[1,null]")
  })
  it("tells different worlds apart", () => {
    expect(worldDigest(11, { gateOpen: false })).not.toBe(worldDigest(11, { gateOpen: true }))
    expect(worldDigest(11, {})).not.toBe(worldDigest(10, {}))
  })
  it("treats a missing plate and state as the empty world", () => {
    expect(worldDigest(null, null)).toBe(worldDigest(undefined, {}))
  })
  it("is a stable 8-hex FNV-1a", () => {
    expect(fingerprint("")).toBe("811c9dc5")
    expect(fingerprint("a")).toBe("e40c292c")
  })
})

describe("seeded dice", () => {
  it("rolls the same on every screen for the same run, plate and roll", () => {
    expect(seededRoll("1d4", "14:3:drow")).toBe(seededRoll("1d4", "14:3:drow"))
    const r1 = seededRandom("x"), r2 = seededRandom("x")
    for (let i = 0; i < 20; i++) expect(r1()).toBe(r2())
  })
  it("stays inside the dice", () => {
    for (let i = 0; i < 300; i++) {
      const v = seededRoll("1d4", `run:${i}`)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(4)
    }
    expect(seededRoll("2d6+3", "s")).toBeGreaterThanOrEqual(5)
  })
  it("differs between runs (a new game reshuffles the rooms)", () => {
    const rolls = new Set(Array.from({ length: 40 }, (_, i) => seededRoll("1d20", `${i}:3:hall`)))
    expect(rolls.size).toBeGreaterThan(8)
  })
})

describe("driverOf — exactly one driver per hero", () => {
  const now = 100000
  const fresh = now - 1000, stale = now - ONLINE_MS - 1
  it("is the owner while their browser is connected", () => {
    const seats = { fifi: seat({ at: fresh, seat: 1 }), dm: seat({ at: fresh, dm: true }) }
    expect(driverOf("fifi", seats, now)).toBe("fifi")
  })
  it("falls to the DM when the owner drops off", () => {
    const seats = { fifi: seat({ at: stale, seat: 1 }), dm: seat({ at: fresh, dm: true }), gandalf: seat({ at: fresh, seat: 2 }) }
    expect(driverOf("fifi", seats, now)).toBe("dm")
  })
  it("falls to the lowest connected seat when there is no DM", () => {
    const seats = { fifi: seat({ at: stale, seat: 1 }), gandalf: seat({ at: fresh, seat: 2 }), scott: seat({ at: fresh, seat: 4 }) }
    expect(driverOf("fifi", seats, now)).toBe("gandalf")
    expect(driverOf(null, seats, now)).toBe("gandalf")
  })
  it("is nobody when nobody is connected", () => {
    expect(driverOf("fifi", {}, now)).toBeNull()
  })
  it("never lets a player write a hero someone else drives; the DM always may", () => {
    const seats = { fifi: seat({ at: fresh, seat: 1 }), gandalf: seat({ at: fresh, seat: 2 }) }
    expect(mayWriteHero({ cid: "fifi" }, "gandalf", false, seats, now)).toBe(false)
    expect(mayWriteHero({ cid: "fifi" }, "fifi", false, seats, now)).toBe(true)
    expect(mayWriteHero({ cid: "fifi" }, "dm", true, seats, now)).toBe(true)
  })
})

describe("heartbeatVerdict — the failsafe", () => {
  it("in step when the fingerprints agree", () => {
    expect(heartbeatVerdict({ digest: "a", dirty: false, travelling: false }, { digest: "a" }, 1)).toEqual({ status: "in-step", resync: false, misses: 0 })
  })
  it("waits while the browser still has changes to send", () => {
    expect(heartbeatVerdict({ digest: "a", dirty: true, travelling: false }, { digest: "b" }, 1).resync).toBe(false)
    expect(heartbeatVerdict({ digest: "a", dirty: false, travelling: true }, { digest: "b" }, 1).resync).toBe(false)
  })
  it(`snaps to the server after ${MISSES_BEFORE_RESYNC} disagreements in a row`, () => {
    let misses = 0, resynced = false
    for (let i = 0; i < MISSES_BEFORE_RESYNC; i++) {
      const v = heartbeatVerdict({ digest: "a", dirty: false, travelling: false }, { digest: "b" }, misses)
      misses = v.misses; resynced = v.resync
    }
    expect(resynced).toBe(true)
  })
})

describe("cleanPatch", () => {
  it("accepts a well-formed move", () => {
    const r = cleanPatch({ heroes: { freia: { x: 10, y: 20, tx: 30, ty: 40, face: 2, plate: 11, seq: 5, cid: "d00a" } } }, "d00a")
    expect("patch" in r && r.patch.heroes?.freia.by).toBe("d00a")
  })
  it("refuses the whole patch when any part is malformed", () => {
    expect("error" in cleanPatch({ plate: 11, heroes: { freia: { x: "nope" } } }, "x")).toBe(true)
    expect("error" in cleanPatch({ heroes: { "Bad Slug": { x: 1, y: 1, tx: 1, ty: 1, face: 0, plate: 1, seq: 1 } } }, "x")).toBe(true)
    expect("error" in cleanPatch({ state: [1, 2] }, "x")).toBe(true)
    expect("error" in cleanPatch({}, "x")).toBe(true)
  })
  it("caps the state size", () => {
    expect("error" in cleanPatch({ state: { big: "x".repeat(70000) } }, "x")).toBe(true)
  })
})

// Sam, 2026-10-26: he climbed the ladder 10 -> 10b and was snapped back to 10. walk_world.plate was an integer and
// cleanPatch checked plates with int(), so every letter plate (10b, 10c, 3k, 5c — the labor plates) was refused whole.
describe("letter plates — 10b, 10c, 3k, 5c, tunnels", () => {
  const hero = (plate: unknown) => ({ freia: { x: 10, y: 20, tx: 30, ty: 40, face: 2, plate, seq: 5, cid: "d00a" } })
  it("accepts a hero patch on 10b", () => {
    const r = cleanPatch({ heroes: hero("10b") }, "d00a")
    expect("patch" in r && r.patch.heroes?.freia.plate).toBe("10b")
  })
  it("accepts a plate change and a crossing to a letter plate, and the biome plates", () => {
    for (const p of ["10b", "10c", "3k", "5c", "tunnels"]) {
      const r = cleanPatch({ plate: p, travel: { seq: 1, from: 10, to: p, zone: 0 } }, "dm")
      expect("patch" in r && r.patch.plate).toBe(p)
      expect("patch" in r && r.patch.travel?.to).toBe(p)
      expect("patch" in r && r.patch.travel?.from).toBe("10")
    }
  })
  it("round-trips 10b through the stored row (JSON) unchanged", () => {
    const r = cleanPatch({ plate: "10b", heroes: hero("10b"), travel: { seq: 3, from: "10", to: "10b", zone: 2, cut: true } }, "dm")
    if (!("patch" in r)) throw new Error(r.error)
    const back = JSON.parse(JSON.stringify(r.patch))
    expect(back.plate).toBe("10b")
    expect(back.heroes.freia.plate).toBe("10b")
    expect(back.travel).toMatchObject({ from: "10", to: "10b", cut: true })
    expect(cleanPatch(back, "dm")).toMatchObject({ patch: { plate: "10b" } })
  })
  it("still refuses what is not a plate", () => {
    for (const p of ["", "10 b", "../x", -1, 1.5, 1000, null, {}, "a".repeat(40)]) expect("error" in cleanPatch({ plate: p }, "x")).toBe(true)
    expect("error" in cleanPatch({ heroes: hero("10 b") }, "x")).toBe(true)
  })
  it("treats 10 and \"10\" as the same plate", () => {
    expect(plateId(10)).toBe("10")
    expect(plateId("10B")).toBe("10b")
    expect(samePlate(10, "10")).toBe(true)
    expect(samePlate("10b", "10")).toBe(false)
    expect(samePlate(null, null)).toBe(false)
  })
  it("digests 10 and \"10\" alike, so a page holding 10 is in step with a row holding \"10\" (no resync)", () => {
    const s = { gateOpen: true, rolls: { "10c": { guards: 1 } } }
    expect(worldDigest(10, s)).toBe(worldDigest("10", s))
    let misses = 0
    for (let i = 0; i < MISSES_BEFORE_RESYNC + 1; i++) {
      const v = heartbeatVerdict({ digest: worldDigest(10, s), dirty: false, travelling: false }, { digest: worldDigest("10", s) }, misses)
      expect(v).toEqual({ status: "in-step", resync: false, misses: 0 })
      misses = v.misses
    }
    expect(worldDigest("10b", s)).not.toBe(worldDigest(10, s))
  })
  it("keeps the digest of a numeric plate what it was before plates became text", () => {
    // the pre-change worldDigest was fingerprint(canon({plate, state})) with plate a number
    expect(worldDigest("11", {})).toBe(fingerprint(canon({ plate: 11, state: {} })))
  })
})

describe("public/js/aop-one-world.js — the browser's copy", () => {
  it("fingerprints exactly as the server does", () => {
    const src = readFileSync(join(__dirname, "..", "public", "js", "aop-one-world.js"), "utf8")
    const ctx: Record<string, unknown> = {}
    runInNewContext(src + "\nthis.AopOneWorld = AopOneWorld;", ctx)
    const B = ctx.AopOneWorld as { worldDigest: typeof worldDigest; seededRoll: typeof seededRoll }
    const worlds: [number | string | null, Record<string, unknown>][] = [
      [11, {}], ["11", {}], ["10b", { gateOpen: true }], [3, { gateOpen: true, doorShut: false, rolls: { 3: { hall: 1 } }, talked: { ront: true, eldeth: false } }],
      [null, { company: ["ront", "eldeth"], props: { chest1: { locked: false, open: true } } }],
    ]
    for (const [p, s] of worlds) expect(B.worldDigest(p, s)).toBe(worldDigest(p, s))
    expect(B.seededRoll("1d4", "14:3:drow")).toBe(seededRoll("1d4", "14:3:drow"))
  })
})
