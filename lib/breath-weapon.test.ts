import { describe, expect, it } from "vitest"
import { breathArea, breathDamageType, breathFor, isBreathWeapon, isSporeBreath, mouthCell } from "./breath-weapon"
import { areaCells } from "./aoe"
import { areaVisualForBreath, decalSheet } from "./aoe-visual"

// The Ancient Deep Dragon's action, exactly as the live bestiary row holds it.
const NIGHTMARE = {
  name: "Nightmare Breath (Recharge 5-6)",
  desc: "The dragon exhales a cloud of spores in a 90-foot cone. Each creature in that area must make a DC 19 Wisdom saving throw. On a failed save, the creature takes 49 (9d10) psychic damage, and it is frightened of the dragon for 1 minute. On a successful save, the creature takes half as much damage with no additional effects.",
}

describe("isBreathWeapon", () => {
  it("knows a breath by its name", () => {
    expect(isBreathWeapon("Nightmare Breath (Recharge 5-6)")).toBe(true)
    expect(isBreathWeapon("Fire Breath (Recharge 5–6)")).toBe(true)
    expect(isBreathWeapon("Breath Weapons (Recharge 5–6)")).toBe(true)
  })
  it("is not fooled by breathing or by attacks", () => {
    expect(isBreathWeapon("Water Breathing")).toBe(false)
    expect(isBreathWeapon("Bite")).toBe(false)
    expect(isBreathWeapon(null)).toBe(false)
  })
})

describe("breathArea", () => {
  it("reads Nightmare Breath as a 90-foot cone from the creature", () => {
    expect(breathArea(NIGHTMARE.desc)).toEqual({ shape: "cone", sizeFt: 90, origin: "self" })
  })
  it("reads a line and its width", () => {
    expect(breathArea("exhales acid in a 60-foot line that is 5 feet wide."))
      .toEqual({ shape: "line", sizeFt: 60, widthFt: 5, origin: "self" })
    expect(breathArea("exhales lightning in a 120-foot line that is 10 feet wide."))
      .toEqual({ shape: "line", sizeFt: 120, widthFt: 10, origin: "self" })
  })
  it("reads the abbreviated and the radius forms", () => {
    expect(breathArea("in a 15-ft. cone")).toEqual({ shape: "cone", sizeFt: 15, origin: "self" })
    expect(breathArea("in a 20-foot-radius sphere")).toEqual({ shape: "sphere", sizeFt: 20, origin: "self" })
    expect(breathArea("in a 30-foot cube")).toEqual({ shape: "cube", sizeFt: 30, origin: "self" })
  })
  it("draws nothing when the text names no shape", () => {
    expect(breathArea("The dragon exhales menacingly.")).toBeNull()
    expect(breathArea(null)).toBeNull()
  })
})

describe("breathDamageType / isSporeBreath", () => {
  it("reads the breath's own damage word", () => {
    expect(breathDamageType(NIGHTMARE.desc)).toBe("psychic")
    expect(breathDamageType("takes 63 (18d6) fire damage")).toBe("fire")
    expect(breathDamageType("must succeed or be paralyzed")).toBeNull()
  })
  it("knows spores from the text", () => {
    expect(isSporeBreath(NIGHTMARE.name, NIGHTMARE.desc)).toBe(true)
    expect(isSporeBreath("Fire Breath", "exhales fire in a 60-foot cone")).toBe(false)
  })
})

describe("mouthCell", () => {
  it("a Medium creature breathes from its own square", () => {
    expect(mouthCell({ x: 5, y: 5 }, { x: 9, y: 5 }, 1)).toEqual({ x: 5, y: 5 })
  })
  it("a Gargantuan creature breathes from the edge of its body, facing the aim", () => {
    expect(mouthCell({ x: 10, y: 10 }, { x: 20, y: 10 }, 4)).toEqual({ x: 11, y: 10 })
    expect(mouthCell({ x: 10, y: 10 }, { x: 10, y: 0 }, 4)).toEqual({ x: 10, y: 9 })
    // Diagonal: leaves from the corner.
    expect(mouthCell({ x: 10, y: 10 }, { x: 20, y: 20 }, 4)).toEqual({ x: 11, y: 11 })
  })
  it("never steps past a target standing right against the body", () => {
    expect(mouthCell({ x: 10, y: 10 }, { x: 10, y: 10 }, 4)).toEqual({ x: 10, y: 10 })
  })
})

describe("breathFor", () => {
  const actions = [
    { name: "Multiattack", desc: "The dragon makes three attacks." },
    { name: "Bite", desc: "Melee Weapon Attack: +14 to hit." },
    NIGHTMARE,
  ]
  it("finds the named breath and reads it", () => {
    expect(breathFor(actions, "Nightmare Breath (Recharge 5-6)")).toEqual({
      name: "Nightmare Breath (Recharge 5-6)",
      area: { shape: "cone", sizeFt: 90, origin: "self" },
      damageType: "psychic",
      spores: true,
    })
  })
  it("is null for an attack, a missing action, or no stat block", () => {
    expect(breathFor(actions, "Bite")).toBeNull()
    expect(breathFor(actions, "Fire Breath (Recharge 5-6)")).toBeNull()
    expect(breathFor(null, NIGHTMARE.name)).toBeNull()
  })
  it("the 90-foot cone leaves the dragon's body and runs 18 squares", () => {
    const b = breathFor(actions, NIGHTMARE.name)!
    const centre = { x: 5, y: 20 }
    const aim = { x: 30, y: 20 }
    const mouth = mouthCell(centre, aim, 4)
    const cells = areaCells(b.area, mouth, aim)
    const xs = cells.map((c) => c.x)
    expect(Math.min(...xs)).toBe(mouth.x + 1)
    expect(Math.max(...xs)).toBe(mouth.x + 18)
    // Nothing behind the mouth — the cone does not bloom inside the dragon.
    expect(cells.every((c) => c.x > mouth.x)).toBe(true)
  })
})

describe("areaVisualForBreath", () => {
  it("Nightmare Breath is a violet billowing spore cloud with motes", () => {
    const v = areaVisualForBreath({ damageType: "psychic", spores: true })
    expect(v.decal).toBe("spores")
    expect(v.form).toBe("cloud")
    expect(v.lingers).toBe(false)
    expect(v.motes).toBeDefined()
    // Violet: blue and red well above green. Never fire-orange.
    const r = (v.tint >> 16) & 0xff, g = (v.tint >> 8) & 0xff, bl = v.tint & 0xff
    expect(bl).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(g)
    expect(bl).toBeGreaterThan(r)
    expect(decalSheet(v.decal)).toBe("groundMiasma")
  })
  it("other breaths keep their damage type's existing look", () => {
    expect(areaVisualForBreath({ damageType: "fire", spores: false }).decal).toBe("scorch")
    expect(areaVisualForBreath({ damageType: "cold", spores: false }).decal).toBe("frost")
    expect(areaVisualForBreath({ damageType: "poison", spores: false }).decal).toBe("miasma")
    expect(areaVisualForBreath({ damageType: null, spores: false }).decal).toBe("arcane")
    expect(areaVisualForBreath({ damageType: "fire", spores: false }).motes).toBeUndefined()
  })
})
