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
    const spec = routeFor("cold", "Ray of Frost")
    expect(spec?.route).toBe("beam")
    expect(spec?.travel).toBe("frostBeam")
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
      expect(spec?.gather).toBe("frostGather")
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
