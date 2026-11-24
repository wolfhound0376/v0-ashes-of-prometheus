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
    get state() { return p.state }, get cur() { return p.cur }, get mode() { return p.mode }, get cbt() { return p.cbt },
    owNow: () => p.now, leader: { x: 0, y: 0 }, FIGHT: { mirror: false }, node: { zones: [{ rect: [0, 0, 10, 10], to: ["11"] }] },
    zoneCenter: () => ({ x: 5, y: 5 }), centroid: { x: 0, y: 0 }, nearestWalkable: (x: number, y: number) => ({ x, y }),
    // the real reinforce() is in the block: a wave walks in as a new fight (explore) or joins the one running (combat)
    loadSpriteManifest: async () => true, esc: (t: string) => t, popText: () => {},
    startCombat: (ids: string[], why: string) => { p.waves.push({ ids, why }) },
    foeJoins: (id: string) => { const w = p.waves[p.waves.length - 1]; if (w && w.why === "(joining)") w.ids.push(id); else p.waves.push({ ids: [id], why: "(joining)" }); return {} },
    saveWalk: () => {}, log: (t: string) => { p.logs.push(t) }, toast: () => {}, bank: () => {}, shake: () => {},
    $: () => p.banner, stage: null, document: { createElement: () => p.banner },
  }
  // `with` keeps the page's globals live (mode, cbt, cur change as the test plays), the way they are on the page
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const make = new Function("env", `with (env) { ${BLOCK}; return { alarmTick, renderAlarmBanner, alarmReaches }; }`)
  const api = make(env) as { alarmTick: () => Promise<void>; renderAlarmBanner: () => void; alarmReaches: (n: unknown) => boolean }
  return { p, ...api }
}
const horn = (at: number): Alarm => ({ plate: "11", at, by: "the outpost", name: "warning horn" })
const MIN = 60_000

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
    const { p, alarmTick } = page({ cur: "14", now: t0 + 4 * MIN + 4_000 })
    p.state.alarm = { ...horn(t0), waves: 1, last: t0 + 2 * MIN }
    await alarmTick()
    expect(p.waves).toEqual([])
    expect(p.state.alarm?.off).toBe("14")
    expect(p.state.alarm?.waves).toBe(3)
    // and it stays over: back up the cliff two minutes later, still nobody
    p.cur = "9"; p.now += 2 * MIN
    await alarmTick()
    expect(p.waves).toEqual([])
    expect(p.banner.hidden).toBe(true)
  })
  it("on the outpost's own plates the waves still come, on time", async () => {
    const t0 = 1_000_000
    const { p, alarmTick } = page({ cur: "10c", now: t0 + 2 * MIN })
    p.state.alarm = horn(t0)
    await alarmTick()
    expect(p.waves.map((w) => w.why)).toEqual(["The alarm: wave 1 of 3"])
    expect(p.state.alarm?.waves).toBe(1)
    expect(p.state.alarm?.off).toBeUndefined()
  })
})
