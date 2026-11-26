import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

// THE ALARM AND REINFORCEMENTS, run from the built map itself: the block from `const ALARM_WAVE_MS` to its setInterval is
// lifted out of public/velkynvelve-walk/index.html and run against a stub of the page around it, so what is tested is the
// code the table plays, not a copy of it.
const html = readFileSync("public/velkynvelve-walk/index.html", "utf8")
const from = html.indexOf("const ALARM_WAVE_MS")
const to = html.indexOf("setInterval(() => { alarmTick(); helpArrives(); }, 1000);")
const BLOCK = html.slice(from, to)

type Alarm = { plate: string; at: number; by: string; name: string; waves?: number; last?: number; off?: string; held?: number }
type Page = {
  state: { alarm: Alarm | null }
  cur: string | number
  mode: string
  cbt: { id: string; round: number; mirror?: boolean } | null
  now: number
  waves: { ids: string[]; why: string }[]
  logs: string[]
  banner: { hidden: boolean; textContent: string }
}

function page(init: Partial<Page> = {}) {
  const p: Page = { state: { alarm: null }, cur: "10", mode: "explore", cbt: null, now: 1_000_000, waves: [], logs: [], banner: { hidden: true, textContent: "" }, ...init }
  const env = {
    get state() { return p.state }, get cur() { return p.cur }, get mode() { return p.mode }, get cbt() { return p.cbt }, get now() { return p.now },
    owNow: () => p.now, leader: { x: 0, y: 0 }, FIGHT: { mirror: false }, node: { zones: [{ rect: [0, 0, 10, 10], to: ["11"] }] },
    zoneCenter: () => ({ x: 5, y: 5 }), centroid: { x: 0, y: 0 }, nearestWalkable: (x: number, y: number) => ({ x, y }),
    // the real reinforce() is in the block: a wave walks in as a new fight (explore) or joins the one running (combat)
    loadSpriteManifest: async () => true, esc: (t: string) => t, popText: () => {},
    startCombat: (ids: string[], why: string) => { p.waves.push({ ids, why }) },
    foeJoins: (id: string) => { const w = p.waves[p.waves.length - 1]; if (w && w.why === "(joining)") w.ids.push(id); else p.waves.push({ ids: [id], why: "(joining)" }); return {} },
    saveWalk: () => {}, log: (t: string) => { p.logs.push(t) }, toast: () => {}, bank: () => {}, shake: () => {},
    $: () => p.banner, stage: null, document: { createElement: () => p.banner },
    fname: (f: { name: string }) => f.name, drowSide: (f: { drow?: boolean }) => !!f.drow, handOff: () => {}, APP: false,
  }
  // `with` keeps the page's globals live (mode, cbt, cur change as the test plays), the way they are on the page
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const make = new Function("env", `with (env) { ${BLOCK}; return { alarmTick, renderAlarmBanner, alarmReaches, raiseAlarm, runnerGotOut, helpQueue: () => pendingHelp }; }`)
  const api = make(env) as { alarmTick: () => Promise<void>; renderAlarmBanner: () => void; alarmReaches: (n: unknown) => boolean; raiseAlarm: (f: unknown) => boolean; runnerGotOut: (f: unknown, ex: unknown) => void; helpQueue: () => unknown[] }
  return { p, ...api }
}
const horn = (at: number): Alarm => ({ plate: "11", at, by: "the outpost", name: "warning horn" })
const MIN = 60_000
const WAVE = 5 * MIN                                                     // Sam, 2026-11-25: "Alarm waves should be 5 minutes."

describe("the block was found", () => {
  it("is in the built map", () => {
    expect(from).toBeGreaterThan(-1)
    expect(to).toBeGreaterThan(from)
  })
})

describe("OUT OVER THE FALLS (Sam, 2026-11-23: \"We got out. Timer is off and no further waves.\")", () => {
  it("the outpost's plates are in reach of the horn; the pool and the road are not", () => {
    const { alarmReaches } = page()
    for (const n of ["1", "9", "10", "10c", "11", "12", "13"]) expect(alarmReaches(n)).toBe(true)
    expect(alarmReaches("14")).toBe(false)
    expect(alarmReaches("road-rope-bridge")).toBe(false)
  })
  it("tonight's run: wave 2 was due the second the party landed in the pool — now nobody comes, and the alarm is over", async () => {
    const t0 = 1_000_000
    const { p, alarmTick } = page({ cur: "14", now: t0 + 2 * WAVE + 4_000 })
    p.state.alarm = { ...horn(t0), waves: 1, last: t0 + WAVE }
    await alarmTick()
    expect(p.waves).toEqual([])
    expect(p.state.alarm?.off).toBe("14")
    expect(p.state.alarm?.waves).toBe(3)
    // and it stays over: back up the cliff five minutes later, still nobody
    p.cur = "9"; p.now += WAVE
    await alarmTick()
    expect(p.waves).toEqual([])
    expect(p.banner.hidden).toBe(true)
  })
  it("on the outpost's own plates the waves still come, on time", async () => {
    const t0 = 1_000_000
    const { p, alarmTick } = page({ cur: "10c", now: t0 + WAVE })
    p.state.alarm = horn(t0)
    await alarmTick()
    expect(p.waves.map((w) => w.why)).toEqual(["The alarm: wave 1 of 3"])
    expect(p.state.alarm?.waves).toBe(1)
    expect(p.state.alarm?.off).toBeUndefined()
  })
})

describe("THE ALARM HOLDS IN A FIGHT (Sam, 2026-11-23: \"The alarm timer looked like it was still counting down while we were in combat\")", () => {
  it("tonight's 49-second wave-1 fight: the banner holds through a round, steps 6 s a round, and the next wave waits", async () => {
    const t0 = 1_000_000
    const { p, alarmTick } = page({ cur: "10c", now: t0 + WAVE })
    p.state.alarm = horn(t0)
    await alarmTick()                                                    // wave 1 walks in and opens a fight
    expect(p.waves.map((w) => w.why)).toEqual(["The alarm: wave 1 of 3"])
    p.mode = "combat"; p.cbt = { id: "f1", round: 1 }
    const seen: Record<number, string> = {}
    for (let s = 1; s <= 49; s++) {
      p.now += 1000
      if (s === 20) p.cbt.round = 2
      if (s === 40) p.cbt.round = 3
      await alarmTick()
      seen[s] = p.banner.textContent
    }
    expect(seen[5]).toBe(seen[19])                                       // round 1: the clock holds
    expect(seen[19]).toContain("wave 2 of 3 in 4:59")
    expect(seen[20]).toContain("in 4:53")                                // round 2 opens: 6 s
    expect(seen[49]).toContain("in 4:47")                                // round 3: 12 s of rounds (+1 s before the fight)
    p.mode = "explore"; p.cbt = null; p.now += 1000
    await alarmTick()                                                    // the fight is over: 49 s real, 3 rounds = 18 s
    expect(p.state.alarm?.held).toBe(49_000 - 18_000)
    p.now = t0 + 2 * WAVE + 30_000
    await alarmTick()
    expect(p.waves.length).toBe(1)                                       // on the wall clock wave 2 was due 30 s ago
    p.now = t0 + 2 * WAVE + 32_000
    await alarmTick()
    expect(p.waves.map((w) => w.why)).toEqual(["The alarm: wave 1 of 3", "The alarm: wave 2 of 3"])
  })
  it("out of a fight the alarm keeps the wall clock, as before", async () => {
    const t0 = 1_000_000
    const { p, alarmTick } = page({ cur: "10", now: t0 + WAVE - 1000 })
    p.state.alarm = horn(t0)
    await alarmTick()
    expect(p.waves).toEqual([])
    expect(p.banner.textContent).toContain("wave 1 of 3 in 0:01")
    p.now += 1000
    await alarmTick()
    expect(p.waves.length).toBe(1)
    expect(p.state.alarm?.held).toBeUndefined()
  })
  it("a screen showing someone else's fight holds its banner but writes nothing", async () => {
    const t0 = 1_000_000
    const { p, alarmTick } = page({ cur: "10", now: t0 + 30_000, mode: "combat" })
    p.state.alarm = horn(t0)
    p.cbt = { id: "theirs", round: 1, mirror: true }
    for (let s = 0; s < 30; s++) { p.now += 1000; await alarmTick() }
    p.mode = "explore"; p.cbt = null; p.now += 1000
    await alarmTick()
    expect(p.state.alarm?.held).toBeUndefined()
  })
})

describe("FIVE MINUTES, AND ONLY A DROW WHO GETS AWAY (Sam, 2026-11-25)", () => {
  const drow = () => ({ id: "drow-guard-male", name: "Drow guard", drow: true, task: "runner", c: { hp: 13, hpMax: 13 } })
  it("the waves are five minutes apart", async () => {
    const t0 = 1_000_000
    const { p, alarmTick } = page({ cur: "10", now: t0 + 5 * MIN - 1000 })
    p.state.alarm = horn(t0)
    await alarmTick()
    expect(p.waves).toEqual([])
    expect(p.banner.textContent).toContain("wave 1 of 3 in 0:01")
    p.now += 1000
    await alarmTick()
    expect(p.waves.length).toBe(1)
    p.mode = "explore"; p.now += 5 * MIN - 1000
    await alarmTick()
    expect(p.waves.length).toBe(1)
    p.now += 1000
    await alarmTick()
    expect(p.waves.length).toBe(2)
  })
  it("a drow who gets off the map in the outpost raises the alarm: first wave in 5:00, and no runner's help on top", async () => {
    const { p, runnerGotOut, renderAlarmBanner, helpQueue } = page({ cur: "10" })
    runnerGotOut(drow(), { x: 1, y: 1, to: "11" })
    expect(p.state.alarm?.at).toBe(p.now)
    expect(p.state.alarm?.by).toBe("Drow guard")
    renderAlarmBanner()
    expect(p.banner.textContent).toContain("wave 1 of 3 in 5:00")
    expect(helpQueue()).toEqual([])
  })
  it("it is raised once: a second drow getting out changes nothing", () => {
    const { p, raiseAlarm } = page({ cur: "10" })
    expect(raiseAlarm(drow())).toBe(true)
    const first = p.state.alarm
    p.now += 60_000
    expect(raiseAlarm(drow())).toBe(false)
    expect(p.state.alarm).toBe(first)
  })
  it("someone who is not a drow getting away raises nothing", () => {
    const { p, raiseAlarm } = page({ cur: "10" })
    expect(raiseAlarm({ ...drow(), drow: false })).toBe(false)
    expect(p.state.alarm).toBeNull()
  })
  it("beyond the outpost there is no alarm: the runner fetches two drow, as before", () => {
    const { p, runnerGotOut, helpQueue } = page({ cur: "road-rope-bridge" })
    runnerGotOut(drow(), { x: 1, y: 1, to: "road-15" })
    expect(p.state.alarm).toBeNull()
    expect(helpQueue().length).toBe(1)
  })
  it("nothing in a fight blows a horn any more", () => {
    expect(BLOCK).not.toContain("function alarmTurn")
    expect(BLOCK).not.toContain("function guardTakesHorn")
  })
})

// THE RIGHT FEET PER TURN: retreatTurn lifted from the built map, its run priced by what the turn really has.
describe("a fleeing drow runs the feet its turn allows (Sam, 2026-11-25: \"the correct movements number per turn\")", () => {
  const a = html.indexOf("function retreatTurn(f){"), b = html.indexOf("// every reach the runner leaves")
  const run = (c: { move?: number; turnFt?: number; sheet: { speed: number } }) => {
    let budget = -1
    const env = {
      exitFor: () => ({ x: 500, y: 0, to: "11" }), findPath: () => [{ x: 500, y: 0 }], ruleFt: () => 1, log: () => {}, esc: (t: string) => t, fname: () => "Drow guard",
      cutPath: (_f: unknown, _p: unknown, ft: number) => { budget = ft; return { pts: [], usedFt: ft } }, oaGauntlet: () => {}, combatBusy: false, foeTurn: () => {},
    }
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function("env", "f", `with (env) { ${html.slice(a, b)}; retreatTurn(f) }`)(env, { x: 0, y: 0, c })
    return budget
  }
  it("was found in the built map", () => { expect(a).toBeGreaterThan(-1); expect(b).toBeGreaterThan(a) })
  it("a drow at full speed Dashes 60 ft (30 + 30)", () => expect(run({ move: 30, turnFt: 30, sheet: { speed: 30 } })).toBe(60))
  it("grappled or restrained (speed 0) goes nowhere — it used to run 60 ft", () => expect(run({ move: 0, turnFt: 0, sheet: { speed: 30 } })).toBe(0))
  it("slowed by 10 ft: 40 ft", () => expect(run({ move: 20, turnFt: 20, sheet: { speed: 30 } })).toBe(40))
  it("just up from prone (half the move spent standing): 45 ft", () => expect(run({ move: 15, turnFt: 30, sheet: { speed: 30 } })).toBe(45))
})
