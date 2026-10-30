import { describe, expect, it } from "vitest"
import {
  ENFORCER_PARTIES, PEN_PLATE, SHAKEDOWN_ROTATIONS, SPARED, WAVES, WAVE_COUNT, WAVE_INTERVAL_MS,
  bannerText, keyResolved, keyTaken, nextWave, noKeyWatch, partySubmits, pendingVoters, pickVictim,
  rollEnforcers, shakedownDue, shakedownHappened, victimPool, wavesDue, wavesStopped,
} from "./shakedown"

// Sam's rulings, 2026-10-30. Design of record: claude/Pen_Key_And_Watch_2026-10-30.md.

const prisoners = () => [
  { name: "Ront" }, { name: "Eldeth Feldrun" }, { name: "Prince Derendil" }, { name: "Sarith Kzekarit" },
  { name: "Buppido" }, { name: "Jimjar" }, { name: "Topsy" }, { name: "Turvy" },
  { name: "Shuushar the Awakened" }, { name: "Stool" },
]
const always = (v: number) => () => v

describe("the key clock", () => {
  it("nothing is due when no key is missing", () => {
    expect(shakedownDue(noKeyWatch(), 99)).toBe(false)
  })

  it("is due exactly two rotations after the theft, not before", () => {
    const w = keyTaken(noKeyWatch(), 1)
    expect(shakedownDue(w, 1)).toBe(false)
    expect(shakedownDue(w, 2)).toBe(false)
    expect(shakedownDue(w, 3)).toBe(true)
    expect(SHAKEDOWN_ROTATIONS).toBe(2)
  })

  // [SAM, 2026-10-30, superseding his earlier answer the same day] "There should only be one shakedown because
  // stealing a key happens once most likely and after that they will likely stop leaning on the door."
  it("plays once per run and never again", () => {
    let w = keyTaken(noKeyWatch(), 0)
    expect(shakedownDue(w, 2)).toBe(true)
    w = shakedownHappened(w)
    expect(shakedownDue(w, 3)).toBe(false)
    expect(shakedownDue(w, 4)).toBe(false)
    expect(shakedownDue(w, 40)).toBe(false)
  })

  it("a second theft after it has played does not re-arm it", () => {
    const done = shakedownHappened(keyTaken(noKeyWatch(), 0))
    const again = keyTaken(done, 10)
    expect(again.done).toBe(true)
    expect(shakedownDue(again, 12)).toBe(false)
    expect(shakedownDue(again, 99)).toBe(false)
  })

  it("stops if the key goes back or is used before it fires", () => {
    const w = keyResolved(keyTaken(noKeyWatch(), 0))
    expect(shakedownDue(w, 2)).toBe(false)
    expect(shakedownDue(w, 40)).toBe(false)
  })

  it("catches up when several rotations pass unobserved", () => {
    expect(shakedownDue(keyTaken(noKeyWatch(), 1), 9)).toBe(true)
  })
})

describe("the consent step", () => {
  const seats = (...v: [string, boolean, boolean][]) => v.map(([id, dead, agreed]) => ({ id, dead, agreed }))

  it("submits only when every living seat has agreed", () => {
    expect(partySubmits(seats(["kenta", false, true], ["fifi", false, true]))).toBe(true)
    expect(partySubmits(seats(["kenta", false, true], ["fifi", false, false]))).toBe(false)
  })

  // [SAM] "They don't count if they are dead."
  it("a dead hero is not a holdout", () => {
    expect(partySubmits(seats(["kenta", false, true], ["scott", true, false]))).toBe(true)
    expect(pendingVoters(seats(["kenta", false, true], ["scott", true, false]))).toEqual([])
  })

  it("names who the submission is still waiting on", () => {
    expect(pendingVoters(seats(["kenta", false, true], ["fifi", false, false], ["scott", true, false]))).toEqual(["fifi"])
  })

  // Not a silent yes: there is nobody left to hand the key over, and the caller is in GAME OVER territory.
  it("a table where every seat is dead does not submit", () => {
    expect(partySubmits(seats(["kenta", true, false], ["fifi", true, false]))).toBe(false)
  })

  it("one living holdout forces the fight however many are dead", () => {
    expect(partySubmits(seats(["kenta", true, true], ["fifi", true, true], ["scott", false, false]))).toBe(false)
  })
})

describe("who walks in", () => {
  it("is one of Sam's two compositions and nothing else", () => {
    expect(ENFORCER_PARTIES).toHaveLength(2)
    expect(rollEnforcers(always(0)).slugs).toEqual(["drow-guard-male", "drow-guard-female", "quaggoth"])
    expect(rollEnforcers(always(0.99)).slugs).toEqual(["drow-guard-male", "drow-elite-warrior"])
  })

  it("the mounted draw is the harder one: elite passive 14 vs 12", () => {
    const [plain, elite] = ENFORCER_PARTIES
    expect(plain.passive).toBe(12)
    expect(plain.mounted).toBe(false)
    expect(elite.passive).toBe(14)
    expect(elite.mounted).toBe(true)
  })

  it("never rolls off the end of the table", () => {
    for (const r of [0, 0.49, 0.5, 0.999]) expect(ENFORCER_PARTIES).toContain(rollEnforcers(always(r)))
  })
})

describe("Branch A — the one who dies", () => {
  it("spares Buppido, always", () => {
    expect(SPARED).toEqual(["Buppido"])
    expect(victimPool(prisoners())).not.toContain("Buppido")
    for (let i = 0; i < 50; i++) expect(pickVictim(prisoners(), () => i / 50)).not.toBe("Buppido")
  })

  it("never picks someone already dead or gone", () => {
    const pool = victimPool([{ name: "Ront", dead: true }, { name: "Jimjar", gone: true }, { name: "Stool" }])
    expect(pool).toEqual(["Stool"])
  })

  it("picks from the living pool", () => {
    expect(pickVictim(prisoners(), always(0))).toBe("Ront")
    expect(pickVictim(prisoners(), always(0.999))).toBe("Stool")
  })

  // The pen can run out of people. Returning null is what lets the caller skip the killing rather than
  // throwing, or worse, falling back to Buppido.
  it("returns null when only Buppido is left, rather than killing him", () => {
    expect(pickVictim([{ name: "Buppido" }], always(0.5))).toBeNull()
    expect(pickVictim([{ name: "Buppido" }, { name: "Ront", dead: true }], always(0))).toBeNull()
  })

  it("returns null when the pen is empty", () => {
    expect(pickVictim([], always(0))).toBeNull()
  })

  // A player character must never be in the pool. The caller passes prisoner NPCs only, and this pins the
  // consequence of that contract: nothing in here can delete someone's hero.
  it("only ever names who it was given", () => {
    const only = [{ name: "Eldeth Feldrun" }]
    for (let i = 0; i < 20; i++) expect(pickVictim(only, () => i / 20)).toBe("Eldeth Feldrun")
  })
})

describe("Branch B — the alarm waves", () => {
  it("is three waves, two minutes apart", () => {
    expect(WAVE_COUNT).toBe(3)
    expect(WAVES).toHaveLength(3)
    expect(WAVE_INTERVAL_MS).toBe(120000)
    expect(WAVES.map((w) => w.atMs)).toEqual([120000, 240000, 360000])
  })

  it("commits 6 drow and 2 quaggoths and no more", () => {
    const all = WAVES.flatMap((w) => w.slugs)
    expect(all.filter((s) => s.startsWith("drow-guard"))).toHaveLength(6)
    expect(all.filter((s) => s === "quaggoth")).toHaveLength(2)
  })

  it("sends nothing before the first two minutes", () => {
    expect(wavesDue(0, 0)).toEqual([])
    expect(wavesDue(119999, 0)).toEqual([])
    expect(wavesDue(120000, 0).map((w) => w.n)).toEqual([1])
  })

  it("does not re-send a wave that already landed", () => {
    expect(wavesDue(400000, 3)).toEqual([])
    expect(wavesDue(400000, 1).map((w) => w.n)).toEqual([2, 3])
  })

  it("stops for good after the third", () => {
    expect(nextWave(3)).toBeNull()
    expect(wavesDue(60 * 60 * 1000, 3)).toEqual([])
  })
})

describe("the countdown banner", () => {
  it("counts down to the first spears", () => {
    expect(bannerText(0, 0)).toBe("ALARM RAISED — first spears in 2:00")
    expect(bannerText(60000, 0)).toBe("ALARM RAISED — first spears in 1:00")
    expect(bannerText(119000, 0)).toBe("ALARM RAISED — first spears in 0:01")
  })

  it("names the wave once the first has landed", () => {
    expect(bannerText(120000, 1)).toBe("WAVE 2 in 2:00")
    expect(bannerText(230000, 1)).toBe("WAVE 2 in 0:10")
  })

  it("pads the seconds", () => {
    expect(bannerText(115000, 0)).toBe("ALARM RAISED — first spears in 0:05")
  })

  it("never shows a negative countdown when a wave is overdue", () => {
    expect(bannerText(999999, 0)).toBe("ALARM RAISED — first spears in 0:00")
  })

  // A countdown to nothing is a lie the players would plan around.
  it("goes away once nothing more is coming", () => {
    expect(bannerText(400000, 3)).toBeNull()
  })
})

describe("the alarm stops sending when they get out", () => {
  it("keeps sending while they are still in the pen", () => {
    expect(wavesStopped(PEN_PLATE, 0)).toBe(false)
    expect(wavesStopped(PEN_PLATE, 5)).toBe(false)
  })

  it("stops once they are off the pen plate and one beyond", () => {
    expect(wavesStopped("10", 1)).toBe(true)
    expect(wavesStopped("5", 3)).toBe(true)
  })

  it("does not stop merely for stepping off and back", () => {
    expect(wavesStopped("10", 0)).toBe(false)
  })
})
