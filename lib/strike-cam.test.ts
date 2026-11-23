// The strike cam's rules (lib/strike-cam.mjs): which blows get a close-up, which scene, and full or short.
// The painted map reads the SAME file (build_walk.py pastes it in), so what passes here is what the map does.
import { describe, expect, it } from "vitest"
import { STRIKE_CAM, strikeCamClock, strikeCamCut, strikeCamMode, strikeCamOnce, strikeCamScene } from "./strike-cam.mjs"

const jab = { att: "freia", tgt: "drow-guard-male", art: "sap", weapon: "Dagger" }
const shot = { att: "freia", tgt: "drow-guard-male", art: "hamstring", weapon: "Hand Crossbow" }
const frost = { att: "kenta", tgt: "drow-guard-male", spell: "Ray of Frost", spellLevel: 0 }

describe("the DM's setting", () => {
  it("is off unless it is one of the three modes", () => {
    expect(strikeCamMode(undefined)).toBe("off")
    expect(strikeCamMode("loud")).toBe("off")
    expect(strikeCamMode("key")).toBe("key")
    expect(strikeCamMode("all")).toBe("all")
  })
  it("off shows nothing, whatever lands", () => {
    for (const ev of [jab, shot, frost]) expect(strikeCamScene({ ...ev, crit: true, mode: "off" })).toBeNull()
    expect(strikeCamScene({ ...jab })).toBeNull()
  })
})

describe("key moments", () => {
  it("a weapon art gets its close-up", () => {
    const s = strikeCamScene({ ...jab, mode: "key" })
    expect(s && s.key).toBe("art:sap")
    expect(s && s.kind).toBe("melee")
    expect(strikeCamScene({ ...shot, mode: "key" })!.kind).toBe("shot")
  })
  it("a cantrip is shown only when it crits", () => {
    expect(strikeCamScene({ ...frost, mode: "key" })).toBeNull()
    expect(strikeCamScene({ ...frost, mode: "key", crit: true })!.kind).toBe("spell")
  })
  it("a plain attack has no close-up at all yet, crit or not (no pose is drawn for it)", () => {
    expect(strikeCamScene({ att: "freia", tgt: "drow-guard-male", weapon: "Dagger", crit: true, mode: "key" })).toBeNull()
  })
  it("nothing in Quick resolve", () => {
    expect(strikeCamScene({ ...jab, mode: "all", quick: true })).toBeNull()
  })
})

describe("poses are drawn on demand", () => {
  it("no pose for the attacker's move, or no hit pose for the target: it plays on the map", () => {
    expect(strikeCamScene({ ...jab, att: "lynkes", mode: "all" })).toBeNull()
    expect(strikeCamScene({ ...jab, tgt: "giant-spider", mode: "all" })).toBeNull()
    expect(strikeCamScene({ ...jab, art: "vex", mode: "all" })).toBeNull()
    expect(strikeCamScene({ att: "kenta", tgt: "drow-guard-male", spell: "Fire Bolt", spellLevel: 0, mode: "all" })).toBeNull()
  })
  it("the pose follows the weapon in hand", () => {
    expect(strikeCamScene({ ...jab, weapon: "Shortsword", mode: "all" })).toBeNull()
    expect(strikeCamScene({ ...shot, weapon: "Shortbow", mode: "all" })).toBeNull()
    expect(strikeCamScene({ ...shot, weapon: "Light Crossbow", mode: "all" })).toBeNull()
  })
  it("every pose names a file, and every strike pose a hand", () => {
    const poses = STRIKE_CAM.poses as Record<string, Record<string, any>>
    for (const slug of Object.keys(poses)) for (const [k, p] of Object.entries(poses[slug])) {
      expect(p.src, `${slug} ${k}`).toMatch(/^closeup-[a-z-]+\.png$/)
      if (!k.startsWith("hit")) expect(p.hand, `${slug} ${k}`).toHaveLength(2)
    }
  })
  it("a caster's pose serves each spell of theirs that has sheets: Samson's Guiding Bolt is a key moment", () => {
    const sc = strikeCamScene({ att: "samson", tgt: "drow-guard-female", spell: "Guiding Bolt", spellLevel: 1, mode: "key" })
    expect(sc?.kind).toBe("spell")
    expect(sc?.key).toBe("spell:Guiding Bolt")
    expect(strikeCamScene({ att: "scott", tgt: "drow-guard-male", spell: "Vicious Mockery", spellLevel: 0, crit: true, mode: "all" })).toBeNull()
  })
  it("a critical hit shows the target's heavier hit pose when it has one", () => {
    expect(strikeCamScene({ ...jab, mode: "key" })?.hard).toBe(false)
    const crit = strikeCamScene({ ...jab, crit: true, mode: "key" })
    expect(crit?.hard).toBe(true)
    expect(crit?.hit.src).toBe("closeup-hit-hard.png")
    expect(strikeCamScene({ ...jab, tgt: "drow-guard-female", crit: true, mode: "key" })?.hard).toBe(false)
  })
})

describe("the rest of the trigger list (PR 2)", () => {
  const stab = { att: "freia", tgt: "drow-guard-male", weapon: "Dagger" }
  const claw = { att: "quaggoth", tgt: "freia", weapon: "Claw", foe: true }
  it("Sneak Attack with a dagger is a key moment, once a fight", () => {
    const sc = strikeCamScene({ ...stab, sneak: true, mode: "key" })
    expect(sc?.key).toBe("sneak")
    expect(sc?.once).toBe("sneak")
    expect(sc?.pose.wind?.src).toBe("closeup-flip.png")
    expect(strikeCamScene({ ...stab, mode: "key" })).toBeNull()                       // a plain stab stays on the map
    expect(strikeCamScene({ ...stab, sneak: true, weapon: "Rapier", mode: "key" })).toBeNull()
    const mem = {}
    expect(strikeCamOnce(mem, "freia", "sneak")).toBe(true)
    expect(strikeCamOnce(mem, "freia", "sneak")).toBe(false)
    expect(strikeCamOnce(mem, "freia", null)).toBe(true)
  })
  it("a weapon art that also sneaks keeps the art's own close-up", () => {
    expect(strikeCamScene({ ...jab, sneak: true, mode: "key" })?.key).toBe("art:sap")
  })
  it("a monster's blow on a hero: mirrored, and only when it earns one", () => {
    expect(strikeCamScene({ ...claw, mode: "key" })).toBeNull()                        // an ordinary claw
    const drop = strikeCamScene({ ...claw, drop: true, mode: "key" })
    expect(drop?.key).toBe("attack")
    expect(drop?.flip).toBe(true)
    expect(drop?.once).toBeNull()
    expect(strikeCamScene({ ...claw, crit: true, mode: "key" })?.flip).toBe(true)
    expect(strikeCamScene({ ...claw, signature: true, mode: "key" })?.once).toBe("signature")
    expect(strikeCamScene({ ...claw, foe: false, mode: "all" })).toBeNull()            // not a hero's move
  })
  it("the killing blow is a key moment for a blow that has a scene, and takes the heavier pose", () => {
    const frost = { att: "kenta", tgt: "drow-guard-male", spell: "Ray of Frost", spellLevel: 0 }
    expect(strikeCamScene({ ...frost, mode: "key" })).toBeNull()
    const k = strikeCamScene({ ...frost, kill: true, mode: "key" })
    expect(k?.key).toBe("spell:Ray of Frost")
    expect(k?.hard).toBe(true)
    expect(strikeCamScene({ ...stab, kill: true, mode: "key" })).toBeNull()            // no pose for a plain stab
  })
  it("every hero has a hit pose", () => {
    for (const h of ["freia", "kenta", "samson", "scott", "gandalf", "lynkes"]) expect((STRIKE_CAM.poses as any)[h].hit.src).toBe("closeup-hit.png")
  })
})

describe("full or short", () => {
  it("full the first time a move is used in a fight, short after", () => {
    const mem = {}
    expect(strikeCamCut(mem, "freia", "art:sap", 1)).toBe("full")
    expect(strikeCamCut(mem, "freia", "art:sap", 2)).toBe("short")
    expect(strikeCamCut(mem, "freia", "art:hamstring", 3)).toBe("full")
  })
  it("no more than one full cut a round", () => {
    const mem = {}
    expect(strikeCamCut(mem, "freia", "art:sap", 1)).toBe("full")
    expect(strikeCamCut(mem, "kenta", "spell:Ray of Frost", 1)).toBe("short")
    expect(strikeCamCut(mem, "kenta", "spell:Ray of Frost", 2)).toBe("short")   // its first use was spent on the short one
  })
  it("a new fight starts over", () => {
    expect(strikeCamCut({}, "freia", "art:sap", 1)).toBe("full")
  })
})

describe("the clock", () => {
  it("a shot and a spell hit later than a blow, by their lead", () => {
    expect(strikeCamClock("full", "melee").hit).toBe(250)
    expect(strikeCamClock("full", "shot").hit).toBe(380)
    expect(strikeCamClock("full", "spell").hit).toBe(580)
    expect(strikeCamClock("short", "melee").hold).toBe(520)
  })
  it("the release comes before the hit", () => {
    for (const cut of ["full", "short"]) for (const kind of ["shot", "spell"]) { const c = strikeCamClock(cut, kind); expect(c.rel).toBeLessThan(c.hit); expect(c.rel).toBeGreaterThanOrEqual(c.snap) }
  })
})
