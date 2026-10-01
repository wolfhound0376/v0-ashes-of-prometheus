import { describe, expect, it } from "vitest"
import { createViewmodel, type Pose, type Swing, type ViewmodelInput } from "./viewmodel"

const F = 1 / 60
const STILL: ViewmodelInput = { yawRate: 0, pitchRate: 0, speed: 0 }
const SWINGS: Swing[] = ["slash", "thrust", "bludgeon", "cast"]

/** Play one whole attack at a fixed dt and record every frame. */
function play(kind: Swing, dt = F, input: ViewmodelInput = STILL) {
  const vm = createViewmodel()
  vm.swing(kind)
  const frames: { pose: Pose; contact: boolean }[] = []
  for (let i = 0; i < 400 && (i === 0 || !vm.idle()); i++) {
    const r = vm.step(dt, input)
    frames.push({ pose: { ...r.pose }, contact: r.contact })
  }
  return { vm, frames }
}

/** Largest single-frame change in the blade's position and rotation. */
function jump(a: Pose, b: Pose) {
  return Math.max(
    Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z),
    Math.abs(a.pitch - b.pitch), Math.abs(a.yaw - b.yaw), Math.abs(a.roll - b.roll),
  )
}

describe("the contact frame", () => {
  it("fires exactly once per attack", () => {
    for (const k of SWINGS) {
      const { frames } = play(k)
      expect(frames.filter((f) => f.contact)).toHaveLength(1)
    }
  })

  it("shows the contact pose — the frame hitstop is about to hold", () => {
    // The slash's hit pose. The first cut showed roll -0.01 here, because the
    // follow-through started from the windup pose.
    const { frames } = play("slash")
    const hit = frames.find((f) => f.contact)!.pose
    expect(hit.roll).toBeCloseTo(0.85, 5)
    expect(hit.z).toBeCloseTo(-0.13, 5)
  })

  it("still shows the contact pose when one long frame jumps past it", () => {
    const { frames } = play("slash", 0.05)
    expect(frames.find((f) => f.contact)!.pose.roll).toBeCloseTo(0.85, 5)
  })

  it("the thrust reaches full extension and its FOV punch", () => {
    const { frames } = play("thrust")
    const minZ = Math.min(...frames.map((f) => f.pose.z))
    const maxFov = Math.max(...frames.map((f) => f.pose.fov))
    expect(minZ).toBeCloseTo(-0.34, 5)
    expect(maxFov).toBeCloseTo(3.2, 5)
  })
})

describe("continuity", () => {
  it("never teleports the blade between frames at 60fps", () => {
    // The old slash jumped 1.07 rad of roll in a single frame at contact. The
    // fastest honest frame of the new one is the last frame before contact,
    // where the blade crosses ~0.67 rad because it is accelerating into it.
    for (const k of SWINGS) {
      const { frames } = play(k)
      for (let i = 1; i < frames.length; i++) {
        expect(jump(frames[i - 1].pose, frames[i].pose)).toBeLessThan(0.75)
      }
    }
  })

  it("the slash's edge never turns back across the strike", () => {
    // Windup leaves roll at -0.75; the strike rolls it through +0.85 to
    // +1.05. The old cut went up, snapped back to -0.75 at contact, and went
    // up again. Roll must only rise from the top of the windup to the follow.
    const { frames } = play("slash")
    const c = frames.findIndex((f) => f.contact)
    const rolls = frames.slice(0, c).map((f) => f.pose.roll)
    const top = rolls.indexOf(Math.min(...rolls))
    expect(rolls[top]).toBeLessThan(-0.7)
    let peak = top
    while (frames[peak + 1].pose.roll >= frames[peak].pose.roll) peak++
    expect(peak).toBeGreaterThan(c)
    expect(frames[peak].pose.roll).toBeCloseTo(1.05, 5)
  })

  it("the follow-through leaves FROM the contact pose, not from the windup", () => {
    const { frames } = play("slash")
    const c = frames.findIndex((f) => f.contact)
    expect(jump(frames[c].pose, frames[c + 1].pose)).toBeLessThan(0.3)
  })

  it("ends exactly at rest", () => {
    for (const k of SWINGS) {
      const { frames } = play(k)
      const last = frames[frames.length - 1].pose
      expect(last.phase).toBe(-1)
      for (const v of [last.x, last.y, last.z, last.pitch, last.yaw, last.roll, last.fov, last.trail, last.glow]) {
        expect(Math.abs(v)).toBeLessThan(1e-9)
      }
    }
  })
})

describe("the recovery", () => {
  it("swings a little PAST rest and settles, rather than sagging and snapping", () => {
    // The slash follow-through holds roll +1.05; a real overshoot carries it
    // below zero on the way home.
    const { frames } = play("slash")
    const c = frames.findIndex((f) => f.contact)
    const minRoll = Math.min(...frames.slice(c).map((f) => f.pose.roll))
    expect(minRoll).toBeLessThan(-0.02)
    expect(minRoll).toBeGreaterThan(-0.15)
  })
})

describe("weight", () => {
  it("a hammer stops dead on contact and its trail goes out", () => {
    const { frames } = play("bludgeon")
    const c = frames.findIndex((f) => f.contact)
    expect(jump(frames[c].pose, frames[c + 1].pose)).toBeLessThan(1e-12)
    expect(frames[c + 1].pose.trail).toBe(0)
  })

  it("a blade follows through past contact", () => {
    const { frames } = play("slash")
    const c = frames.findIndex((f) => f.contact)
    expect(jump(frames[c].pose, frames[c + 1].pose)).toBeGreaterThan(0)
  })

  it("the held weapon sets the lag, idle or not", () => {
    // Turn and measure how far the weapon has fallen behind after 4 frames:
    // a mace should lag further than a sword while nothing is swinging.
    const lagAfter = (held: Swing) => {
      const vm = createViewmodel(held)
      let x = 0
      for (let i = 0; i < 4; i++) x = vm.step(F, { yawRate: 2, pitchRate: 0, speed: 0 }).pose.x
      return Math.abs(x)
    }
    expect(lagAfter("bludgeon")).toBeLessThan(lagAfter("slash"))
    const vm = createViewmodel("slash")
    vm.hold("bludgeon")
    let x = 0
    for (let i = 0; i < 4; i++) x = vm.step(F, { yawRate: 2, pitchRate: 0, speed: 0 }).pose.x
    expect(Math.abs(x)).toBeCloseTo(lagAfter("bludgeon"), 12)
  })
})

describe("sway stability", () => {
  it("settles on its target at 60fps, 30fps and on long frames", () => {
    // The Euler cut reached 8.6e20 at 30fps and 1.4e34 at 0.05s.
    for (const dt of [1 / 144, 1 / 60, 1 / 30, 0.05]) {
      const vm = createViewmodel()
      let x = 0
      for (let i = 0; i < 120; i++) x = vm.step(dt, { yawRate: 2, pitchRate: 0, speed: 0 }).pose.x
      expect(x).toBeCloseTo(-0.1, 4) // clamped target: -2 * 0.055 → -0.1
    }
  })

  it("never overshoots its target — critically damped", () => {
    const vm = createViewmodel()
    for (let i = 0; i < 60; i++) {
      const x = vm.step(1 / 30, { yawRate: 2, pitchRate: 0, speed: 0 }).pose.x
      expect(x).toBeGreaterThanOrEqual(-0.1 - 1e-12)
    }
  })

  it("rides on top of an attack instead of replacing it", () => {
    const turning = play("slash", F, { yawRate: 2, pitchRate: 0, speed: 0 }).frames
    const still = play("slash").frames
    const c = still.findIndex((f) => f.contact)
    expect(turning[c].pose.roll).toBeCloseTo(still[c].pose.roll, 12)
    expect(turning[c].pose.x).not.toBeCloseTo(still[c].pose.x, 3)
  })
})

describe("hitstop — the two clocks", () => {
  it("frozen holds the weapon while the sway keeps moving", () => {
    const vm = createViewmodel()
    vm.swing("slash")
    let r = vm.step(F, STILL)
    while (!r.contact) r = vm.step(F, STILL)
    const held = { ...r.pose }
    const turn = { yawRate: 2, pitchRate: 0, speed: 0, frozen: true }
    const a = { ...vm.step(F, turn).pose }
    const b = { ...vm.step(F, turn).pose }
    // attack pose held...
    expect(a.roll).toBe(held.roll)
    expect(b.roll).toBe(held.roll)
    expect(b.phase).toBe(held.phase)
    // ...presentation still live.
    expect(b.x).not.toBe(a.x)
    // and it never fires a second contact.
    expect(vm.step(F, STILL).contact).toBe(false)
  })
})

describe("input", () => {
  it("ignores a press early in an attack", () => {
    const vm = createViewmodel()
    vm.swing("slash")
    vm.step(F, STILL)
    expect(vm.swing("thrust")).toBe(false)
  })

  it("queues a press in the last moments of the recovery and plays it next", () => {
    const vm = createViewmodel()
    vm.swing("slash")
    // slash runs 0.70s; step to 0.60s, inside the 0.15s buffer.
    for (let i = 0; i < 36; i++) vm.step(F, STILL)
    expect(vm.swing("thrust")).toBe(true)
    let contacts = 0
    for (let i = 0; i < 120; i++) if (vm.step(F, STILL).contact) contacts++
    expect(contacts).toBe(1) // the queued thrust landed
    expect(vm.idle()).toBe(true)
  })

  it("reset drops a queued press", () => {
    const vm = createViewmodel()
    vm.swing("slash")
    for (let i = 0; i < 36; i++) vm.step(F, STILL)
    vm.swing("thrust")
    vm.reset()
    for (let i = 0; i < 60; i++) expect(vm.step(F, STILL).contact).toBe(false)
  })
})

describe("cast", () => {
  it("the light ramps over the windup, peaks on release, and dies", () => {
    const { frames } = play("cast")
    const c = frames.findIndex((f) => f.contact)
    expect(frames[c].pose.glow).toBe(1)
    expect(frames[5].pose.glow).toBeGreaterThan(0)
    expect(frames[5].pose.glow).toBeLessThan(0.6)
    expect(frames[frames.length - 1].pose.glow).toBe(0)
  })

  it("no other swing lights the hands", () => {
    for (const k of ["slash", "thrust", "bludgeon"] as const) {
      expect(play(k).frames.every((f) => f.pose.glow === 0)).toBe(true)
    }
  })
})
