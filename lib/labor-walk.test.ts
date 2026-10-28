import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
// plain .mjs, pasted into the walk page whole (build_walk.py /*__LABOR__*/)
import * as W from "./labor-walk.mjs"
import { TASKS } from "./labor"

const SPEC = JSON.parse(readFileSync(join(__dirname, "..", "scripts", "velkynvelve-walk", "spec.json"), "utf8"))

describe("where each task is worked", () => {
  it("has a plate for every task the scheduler can draw", () => {
    for (const t of TASKS) expect(SPEC[W.WORK_PLATE[t.key]], t.key).toBeTruthy()
  })

  it("sends the pots and the laundry to the waterfall, not the one-way pool", () => {
    expect(W.WORK_PLATE.pots).toBe("9")
    expect(W.WORK_PLATE.laundry).toBe("9")
  })

  it("walks every task there and back on the real Velkynvelve plates", () => {
    for (const t of TASKS) {
      const r = W.detailRoute(SPEC, t.key)
      expect(r.out, t.key).toBeTruthy()
      const out = r.out!
      expect(out[0]).toBe("11")
      expect(out[out.length - 1]).toBe(r.plate)
      expect(r.back![0]).toBe(r.plate)
      expect(r.back![r.back!.length - 1]).toBe("11")
    }
  })

  it("leaves the pen by its gate", () => {
    const r = W.detailRoute(SPEC, "water")
    expect(W.exitTo(SPEC, r.out![0], r.out![1])!.kind).toBe("gate")
  })

  it("never drops through the falls or takes the lift basket", () => {
    for (const t of TASKS) {
      const { out, back } = W.detailRoute(SPEC, t.key)
      for (const route of [out!, back!]) {
        for (let i = 1; i < route.length; i++) {
          const z = W.exitTo(SPEC, route[i - 1], route[i])
          if (z) expect(["water", "leave"]).not.toContain(z.kind)
        }
      }
    }
  })

  it("comes home the way it went when every door has a way back", () => {
    const { out, back } = W.detailRoute(SPEC, "kitchen")
    expect(back).toEqual([...out!].reverse())
  })

  it("uses a cut only where a door is missing — today, barracks to lift", () => {
    expect(W.cutsIn(SPEC, W.detailRoute(SPEC, "lift").out)).toEqual([["2", "5"]])
    for (const t of ["water", "clean", "pots", "kitchen", "rocks", "supplies", "quaggoth-hair"]) {
      const r = W.detailRoute(SPEC, t)
      expect(W.cutsIn(SPEC, r.out), t).toEqual([])
      expect(W.cutsIn(SPEC, r.back), t).toEqual([])
    }
  })

  it("prefers doors to cuts even when the cut is a shorter way", () => {
    const spec = {
      a: { zones: [{ to: ["b"] }] },
      b: { zones: [{ to: ["c"] }] },
      c: { zones: [{ to: ["d"] }] },
      d: { zones: [{ to: ["a"] }] },
    }
    expect(W.routeBetween(spec, "a", "d", { reverse: true })).toEqual(["a", "b", "c", "d"])
  })
})

describe("the steps of a detail", () => {
  it("goes scheduled → called → escorting → working → returning → done", () => {
    let s = "scheduled"
    for (const [a, n] of [["call", "called"], ["march", "escorting"], ["arrive", "working"], ["return", "returning"], ["done", "done"]]) {
      expect(W.advance(s, a)).toBe(n)
      s = n
    }
  })

  it("refuses a step out of order (two browsers racing to march)", () => {
    expect(W.advance("escorting", "march")).toBeNull()
    expect(W.advance("scheduled", "arrive")).toBeNull()
  })

  it("can be called off until it is done", () => {
    expect(W.advance("working", "abort")).toBe("aborted")
    expect(W.advance("done", "abort")).toBeNull()
    expect(W.advance("aborted", "abort")).toBeNull()
  })

  it("is live only while the party is being taken or is out", () => {
    expect(["called", "escorting", "working", "returning"].every(W.isLive)).toBe(true)
    expect(["scheduled", "done", "aborted"].some(W.isLive)).toBe(false)
  })
})

describe("the call", () => {
  it("warns on a refusal and slows a hero who drags their feet [SAM]", () => {
    expect(W.choiceEffect("refuse")).toMatchObject({ warning: true })
    expect(W.choiceEffect("drag")).toMatchObject({ slow: true, warning: false })
    expect(W.choiceEffect("go")).toMatchObject({ slow: false, warning: false })
  })

  it("has the escort's line for every task", () => {
    for (const t of TASKS) expect(W.LINES.task[t.key], t.key).toBeTruthy()
  })

  it("never names a hero in a call line (the guards don't know their names)", () => {
    for (const l of W.LINES.call) expect(l).not.toMatch(/\{name\}|Fifi|Kenta|Scott|Samson/)
  })
})

describe("who is who", () => {
  it("maps the prisoners' row names to their sprites", () => {
    expect(W.PRISONERS.map(W.prisonerSlug)).toEqual(["ront", "eldeth", "derendil", "sarith", "buppido", "jimjar", "topsy", "turvy", "shuushar", "stool"])
  })
})

describe("the stations (PR 3)", () => {
  it("finishes a task in two good goes", () => {
    const a = W.workStep("water", 0, true, false)
    expect(a).toMatchObject({ progress: 1, done: false, redo: false })
    expect(W.workStep("water", a.progress, true, false)).toMatchObject({ done: true })
  })

  it("makes them do it again after a failed check, without losing what they had", () => {
    expect(W.workStep("lift", 1, false, false)).toMatchObject({ progress: 1, redo: true, done: false, line: "fail" })
  })

  it("redoes the cruelty work once, whatever the result — the drow's arbitrary standards [BOOK]", () => {
    for (const t of W.CRUELTY) {
      const first = W.workStep(t, 1, true, false)
      expect(first, t).toMatchObject({ redo: true, done: false, line: "whim", progress: 0 })
      expect(W.workStep(t, 1, true, true), t).toMatchObject({ done: true })
      expect((W.WORK_LINES.whim as Record<string, string>)[t], t).toBeTruthy()
    }
  })

  it("never redoes real work on a whim", () => {
    for (const t of ["water", "lift", "pots", "kitchen", "clean", "dishes", "laundry"]) expect(W.workStep(t, 1, true, false).done, t).toBe(true)
  })

  it("rolls only checks the dashboard knows", async () => {
    const { WALK_ACTIONS } = await import("./walk-roll")
    for (const k of Object.values(W.WORK_ROLL) as string[]) expect(WALK_ACTIONS, k).toHaveProperty(k)
    for (const k of ["labor:look", "labor:pocket", "labor:pocket-jorlan"]) expect(WALK_ACTIONS).toHaveProperty(k)
  })

  it("pockets against Jorlan's eyes when he is the escort, a drow's otherwise", () => {
    expect(W.pocketRoll(["jorlan-duskryn", "quaggoth"])).toBe("labor:pocket-jorlan")
    expect(W.pocketRoll(["drow", "quaggoth"])).toBe("labor:pocket")
    expect(W.pocketRoll([])).toBe("labor:pocket")
  })

  it("has something to see on every plate a detail works on, each with its source", () => {
    for (const t of TASKS) {
      const seed = (W.LOOK_SEEDS as Record<string, { text: string; source: string; falls?: boolean }>)[(W.WORK_PLATE as Record<string, string>)[t.key]]
      expect(seed, t.key).toBeTruthy()
      expect(seed.source, t.key).toBeTruthy()
    }
    expect(W.LOOK_SEEDS["9"].falls).toBe(true)
  })
})

describe("caught, searched, defying (PR 4)", () => {
  it("hides against Jorlan's eyes when he is the escort, a drow's otherwise", () => {
    expect(W.hideRoll(["jorlan-duskryn"])).toBe("labor:hide-jorlan")
    expect(W.hideRoll(["drow", "quaggoth"])).toBe("labor:hide")
  })

  it("knows what cannot hide in rags [Sam's suspicion list]", () => {
    expect(W.tooBigToHide({ name: "Shortsword", item_type: "weapon", weight: 2 })).toBe(true)
    expect(W.tooBigToHide({ name: "Hand Crossbow", item_type: "weapon", weight: 3 })).toBe(true)
    expect(W.tooBigToHide({ name: "Dagger", item_type: "weapon", weight: 1 })).toBe(false)
    expect(W.tooBigToHide({ name: "Slave pen key", item_type: "misc", weight: 0 })).toBe(false)
    expect(W.tooBigToHide({ name: "Drow poison", item_type: "consumable", weight: 0.5 })).toBe(false)
    expect(W.tooBigToHide({ name: "Silk rope", item_type: "gear", weight: 5 })).toBe(true)
    expect(W.tooBigToHide(null)).toBe(false)
  })

  it("has a hand-over line and a why-I-did-it line for every prisoner", () => {
    for (const n of W.PRISONERS.map(W.prisonerSlug)) {
      expect(W.lineFor(W.DEFUSE_HANDOVER, n), n).toBeTruthy()
      expect(W.lineFor(W.DEFUSE_TALK, n), n).toBeTruthy()
    }
    expect(W.lineFor(W.DEFUSE_TALK, "someone-new")).toBe(W.DEFUSE_TALK._)
  })

  it("carries Sam's own words in the talk", () => {
    expect(W.DEFUSE_TALK.eldeth).toMatch(/live another day/i)
    expect(W.DEFUSE_TALK.ront).toMatch(/not worth it/i)
  })

  it("rolls the hide on the dashboard", async () => {
    const { WALK_ACTIONS } = await import("./walk-roll")
    expect(WALK_ACTIONS["labor:hide"].dc).toBe(12)
    expect(WALK_ACTIONS["labor:hide-jorlan"].dc).toBe(14)
  })
})

describe("props, poses, voice, music (assets)", () => {
  const SPRITES = join(__dirname, "..", "public", "sprites")
  const AUDIO = join(__dirname, "..", "public", "audio", "labor")
  const exists = (p: string) => { try { readFileSync(p); return true } catch { return false } }

  it("gives every task a pose and a prop list", () => {
    for (const t of TASKS) {
      expect(["carry", "scrub"], t.key).toContain((W.WORK_POSE as Record<string, string>)[t.key])
      expect(Array.isArray((W.STATION_PROPS as Record<string, string[]>)[t.key]), t.key).toBe(true)
    }
  })

  it("has a sprite for every prop, and room for every station's props", () => {
    for (const list of Object.values(W.STATION_PROPS) as string[][]) {
      expect(list.length).toBeLessThanOrEqual(W.PROP_OFFSETS.length)
      for (const p of list) expect(exists(join(SPRITES, p, "sprite.json")), p).toBe(true)
    }
  })

  it("gave the five main players the three labor sheets", () => {
    for (const h of ["kenta", "freia", "scott", "samson", "lynkes"]) {
      const m = JSON.parse(readFileSync(join(SPRITES, h, "sprite.json"), "utf8"))
      for (const a of ["scrub", "heave", "carry"]) {
        expect(m.animations[a], `${h} ${a}`).toBeTruthy()
        expect(exists(join(SPRITES, h, `${a}.png`)), `${h} ${a}.png`).toBe(true)
      }
      expect(m.animations.heave.loop).toBe(false)
      expect(m.animations.carry.loop).toBe(true)
    }
  })

  it("has a clip for each of the quaggoth's lines, and the takes alternate", () => {
    for (const l of W.LINES.quaggoth) {
      expect(W.quaggothClip(l, 0), l).toBeTruthy()
      expect(W.quaggothClip(l, 0)).not.toBe(W.quaggothClip(l, 1))
      for (const c of W.QUAGGOTH_CLIPS[l as keyof typeof W.QUAGGOTH_CLIPS]) expect(exists(join(AUDIO, `${c}.mp3`)), c).toBe(true)
    }
    expect(W.quaggothClip("Something it never says.", 0)).toBeNull()
  })

  it("has the work song", () => {
    expect(exists(join(AUDIO, `${W.WORK_SONG}.mp3`))).toBe(true)
  })
})

describe("painted stations (Sam, 2026-10-27)", () => {
  const SPEC = JSON.parse(readFileSync(join(__dirname, "..", "scripts", "velkynvelve-walk", "spec.json"), "utf8"))
  const GW = Math.ceil(2400 / 20)
  const walkable = (plate: string, [x, y]: number[]) => {
    const n = SPEC[plate]
    if (n.mask) {
      const m: number[] = []; let v = 0
      for (const r of String(n.mask).split(",")) { for (let i = 0; i < Number(r); i++) m.push(v); v ^= 1 }
      return m[Math.floor(y / 20) * GW + Math.floor(x / 20)] === 1
    }
    const inPoly = (poly: number[][]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c } return c }
    const inside = n.floors.some((f: { poly?: number[][] }) => f.poly && inPoly(f.poly))
    const blocked = (n.obstacles || []).some((o: { cx: number; cy: number; rx: number; ry: number }) => ((x - o.cx) / o.rx) ** 2 + ((y - o.cy) / o.ry) ** 2 < 1)
    return inside && !blocked
  }
  it("is only on the plates the task is worked on", () => {
    for (const [plate, tasks] of Object.entries(W.PAINTED_STATIONS)) for (const task of Object.keys(tasks)) expect(String(W.WORK_PLATE[task as keyof typeof W.WORK_PLATE])).toBe(plate)
  })
  it("puts every standing spot and drop on walkable floor", () => {
    for (const [plate, tasks] of Object.entries(W.PAINTED_STATIONS)) for (const list of Object.values(tasks) as { at: number[]; to?: number[] }[][])
      for (const st of list) { expect(walkable(plate, st.at), `${plate} at ${st.at}`).toBe(true); if (st.to) expect(walkable(plate, st.to), `${plate} to ${st.to}`).toBe(true) }
  })
  it("gives a carry task somewhere to carry to, and leaves rocks to the props", () => {
    for (const [plate, tasks] of Object.entries(W.PAINTED_STATIONS)) for (const [task, list] of Object.entries(tasks) as [string, { to?: number[] }[]][])
      if (W.WORK_POSE[task as keyof typeof W.WORK_POSE] === "carry") for (const st of list) expect(st.to, `${plate} ${task}`).toBeTruthy()
    expect(W.paintedStations("10b", "rocks")).toBeNull()
    expect(W.paintedStations("10c", "supplies")?.length).toBe(4)
  })
})
