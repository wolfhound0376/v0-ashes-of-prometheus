import { describe, expect, it } from "vitest"
import { routeFor } from "@/components/tactical/spell-vfx-kit"

// ============================================================================
// DELIVERY IS A PROPERTY OF THE SPELL, NOT OF THE DAMAGE TYPE.
//
// This file exists because of a bug that shipped to review: the frost shard
// was put on the `cold` TYPE, which turned every cold spell into a flying
// dagger -- Ray of Frost included, which 5e describes as a frigid BEAM of
// blue-white light.
//
// The spellbook cannot settle this one on its own. Ray of Frost and Ice Knife
// are both `attack_roll: true, attack_type: "ranged"`, so the attack-roll
// promotion inside routeFor() reads them identically. The difference is
// stated by name in DELIVERY_BY_SPELL, and these tests are what stop someone
// collapsing it back into the type later.
// ============================================================================

describe("cold delivery", () => {
  it("keeps Ray of Frost a beam -- it is a ray, not a thrown object", () => {
    // The ROUTE is what this file is about. Which sheet a beam carries is
    // art, and lib/cast-art.test.ts owns that.
    const spec = routeFor("cold", "Ray of Frost")
    expect(spec?.route).toBe("beam")
    expect(spec?.travel).toBeTruthy()
  })

  it("throws Ice Knife as a shard", () => {
    const spec = routeFor("cold", "Ice Knife")
    expect(spec?.route).toBe("ball")
    expect(spec?.travel).toBe("frostShard")
    expect(spec?.motion).toBe("dart")
  })

  it("drops Ice Storm and Sleet Storm from above, carrying nothing across", () => {
    // SRD 5.1: Ice Storm "pounds to the ground ... centered on a point within
    // range"; Sleet Storm falls "in a 20-foot tall cylinder". Weather arrives
    // overhead, so neither should stretch a beam to get there.
    for (const name of ["Ice Storm", "Sleet Storm"]) {
      const spec = routeFor("cold", name)
      expect(spec?.route).toBe("sky")
      expect(spec?.travel).toBeUndefined()
    }
  })

  it("does not throw a shard at anything that is not Ice Knife", () => {
    for (const name of ["Ray of Frost", "Cone of Cold", "Ice Storm", "Sleet Storm"]) {
      expect(routeFor("cold", name)?.travel).not.toBe("frostShard")
    }
  })

  it("KNOWN GAP: Cone of Cold still draws a beam", () => {
    // SRD 5.1: "A blast of cold air erupts from your hands" in a 60-foot cone.
    // That is neither a beam nor a thing that falls, and the kit has no cone
    // route. This test records the gap so it is visible rather than forgotten
    // -- change it when a cone route exists, do not delete it.
    expect(routeFor("cold", "Cone of Cold")?.route).toBe("beam")
  })

  it("gives every cold spell the inward gather and the heavy splinters", () => {
    for (const name of ["Ray of Frost", "Ice Knife", "Cone of Cold", "Ice Storm"]) {
      const spec = routeFor("cold", name)
      expect(spec?.gather).toBeTruthy()        // which sheet: cast-art.test.ts
      expect(spec?.burst?.rise).toBe(0.1)
    }
  })

  it("defaults to the beam when no spell name is given at all", () => {
    expect(routeFor("cold")?.route).toBe("beam")
  })
})

describe("the attack-roll promotion still works", () => {
  // The behaviour that was already there before the cold change. If the
  // delivery table ever starts short-circuiting this, these catch it.
  it("promotes Guiding Bolt off its type's sky route", () => {
    expect(routeFor("radiant", "Guiding Bolt")?.route).toBe("ball")
  })

  it("leaves Sacred Flame falling from above", () => {
    expect(routeFor("radiant", "Sacred Flame")?.route).toBe("sky")
  })
})

describe("burst.rise defaults", () => {
  it("is undefined for everything except cold, so no other type moves", () => {
    for (const t of ["fire", "force", "psychic", "lightning"] as const) {
      expect(routeFor(t)?.burst?.rise).toBeUndefined()
    }
  })
})

// ============================================================================
// THE REST OF THE TABLE, read out of the SRD rather than out of memory.
//
// Sam: "What about the other spells like healing, poisoning, necrotic, etc?"
// Every expectation below quotes the rules text it comes from. Where the SRD
// has no text -- Toll the Dead, Ice Knife -- nothing was changed on a guess.
// ============================================================================

describe("necrotic stops being a beam", () => {
  // Not one necrotic spell in the spellbook is a beam.
  it("puts Chill Touch's hand in the victim's own space", () => {
    // "You create a ghostly, skeletal hand in the space of a creature."
    const spec = routeFor("necrotic", "Chill Touch")
    expect(spec?.route).toBe("impact-only")
    expect(spec?.travel).toBeUndefined()
  })

  it("keeps Inflict Wounds at melee reach", () => {
    // "Make a melee spell attack against a creature you can reach."
    expect(routeFor("necrotic", "Inflict Wounds")?.route).toBe("impact-only")
  })

  it("does not let the attack-roll promotion override a stated delivery", () => {
    // Both of the above resolve as "attack", which the promotion would
    // otherwise turn into a thrown ball. The stated delivery is the more
    // specific fact and has to win.
    for (const n of ["Chill Touch", "Inflict Wounds"]) {
      expect(routeFor("necrotic", n)?.route).not.toBe("ball")
    }
  })
})

describe("healing stops falling out of the sky", () => {
  it("does not drop a column on someone the cleric is touching", () => {
    // "A creature you touch regains a number of hit points."
    const spec = routeFor("healing", "Cure Wounds")
    expect(spec?.route).toBe("impact-only")
    expect(spec?.route).not.toBe("sky")
  })

  it("lands Healing Word on the ally with no column", () => {
    expect(routeFor("healing", "Healing Word")?.route).toBe("impact-only")
  })
})

describe("the rest of the audit", () => {
  it("creates Cloudkill at its point instead of lobbing it", () => {
    // "a 20-foot radius sphere ... centered on a point you choose."
    expect(routeFor("poison", "Cloudkill")?.route).toBe("impact-only")
  })

  it("keeps Shocking Grasp in melee", () => {
    // Range: Touch. "Make a melee spell attack against the target."
    expect(routeFor("lightning", "Shocking Grasp")?.route).toBe("impact-only")
  })

  it("fans Burning Hands out of the caster's own hands", () => {
    // Range: Self (15-foot cone). "a thin sheet of flames shoots forth from
    // your outstretched fingertips" -- the same shape Thunderwave uses.
    expect(routeFor("fire", "Burning Hands")?.route).toBe("radiate")
  })

  it("surrounds the victim with Hellish Rebuke rather than throwing it", () => {
    // "the creature that damaged you is momentarily surrounded by flames."
    expect(routeFor("fire", "Hellish Rebuke")?.route).toBe("impact-only")
  })

  it("erupts Shatter at its point, not from the caster", () => {
    // "erupts from a point of your choice within range" -- where Thunderwave
    // "sweeps out from you". Same damage type, opposite origin.
    expect(routeFor("thunder", "Shatter")?.route).toBe("impact-only")
    expect(routeFor("thunder", "Thunderwave")?.route).toBe("radiate")
  })

  it("stops throwing Vicious Mockery, which is speech", () => {
    // "You unleash a string of insults ... If the target can hear you."
    expect(routeFor("psychic", "Vicious Mockery")?.route).not.toBe("ball")
  })
})

describe("what the SRD says is already right, and stays right", () => {
  it("keeps the two radiant spells that genuinely descend", () => {
    // Moonbeam "shines down in a cylinder"; Sacred Flame "descends on a
    // creature". Both are sky and both should stay sky.
    expect(routeFor("radiant", "Moonbeam")?.route).toBe("sky")
    expect(routeFor("radiant", "Sacred Flame")?.route).toBe("sky")
  })

  it("leaves Fireball thrown", () => {
    expect(routeFor("fire", "Fireball")?.route).toBe("ball")
  })
})

describe("gaps recorded rather than guessed", () => {
  it("KNOWN GAP: Spirit Guardians still uses a sky column", () => {
    // Range: Self (15-foot radius). "They flit around you" -- a lasting aura
    // on the caster, which no route here expresses. Change this when one
    // does; do not delete it.
    expect(routeFor("radiant", "Spirit Guardians")?.route).toBe("sky")
  })

  it("NOT IN THE SRD: Toll the Dead is left exactly as it was", () => {
    // Xanathar's. No text to quote, so no change on a guess.
    expect(routeFor("necrotic", "Toll the Dead")?.route).toBe("beam")
  })
})
