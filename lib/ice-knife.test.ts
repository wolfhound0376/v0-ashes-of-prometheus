import { describe, expect, it } from "vitest"
import { SPELLBOOK, spellEntry, rackFor } from "@/lib/spellbook"
import { kitVfxTypeFor, routeFor } from "@/components/tactical/spell-vfx-kit"

// ============================================================================
// Ice Knife is in the REGISTRY, not on a sheet.
//
// The frost shard art shipped in #732 and could never fire: the kit asks
// kitVfxTypeFor for a type, that reads spellEntry, and an unknown name falls
// to DEFAULT_ENTRY, which carries no damage -- so the kit drew nothing at all.
// The route tests passed because they called routeFor directly with the type
// already in hand. They tested the function, not the path.
// ============================================================================

describe("the kit can now see Ice Knife", () => {
  it("resolves it to cold, which is what makes the shard art reachable", () => {
    expect(kitVfxTypeFor("Ice Knife")).toBe("cold")
  })

  it("throws it as a shard, end to end from the spell name", () => {
    const type = kitVfxTypeFor("Ice Knife")
    expect(type).toBeTruthy()
    const spec = routeFor(type!, "Ice Knife")
    expect(spec?.route).toBe("ball")
    expect(spec?.travel).toBe("frostShard")
  })

  it("still leaves Ray of Frost a beam", () => {
    const type = kitVfxTypeFor("Ray of Frost")
    expect(routeFor(type!, "Ray of Frost")?.route).toBe("beam")
  })
})

describe("being in the registry grants it to nobody", () => {
  it("is in the table", () => {
    expect(SPELLBOOK["ice knife"]).toBeDefined()
  })

  it("does not appear on Kenta's rack -- he does not know it", () => {
    // Kenta, level 1 sorcerer, straight off his sheet in Supabase.
    const rack = rackFor({
      spellcasting: {
        slots: { "1": { max: 2, used: 0 } },
        cantrips: ["Ray of Frost", "Shocking Grasp", "Minor Illusion", "Chill Touch"],
        prepared: ["Disguise Self", "Fog Cloud"],
      },
      attacks: [],
      coreActions: [],
    })
    const names = rack.map(r => r.name.toLowerCase())
    expect(names).not.toContain("ice knife")
    expect(names).toContain("ray of frost")
  })
})

describe("what the row deliberately does not claim", () => {
  it("carries the cold burst only, and says so", () => {
    const e = spellEntry("Ice Knife")
    expect(e.damage).toBe("cold")
    expect(e.dice).toBe("2d6")
    expect(e.resolve).toBe("save")
    expect(e.save).toBe("DEX")
  })

  it("never uses a combined dice string, which parseDamage would misread", () => {
    // "1d10+2d6" parses as 1d10 + a flat 2. Any row that tried to carry both
    // halves this way would silently roll the wrong number.
    for (const [name, entry] of Object.entries(SPELLBOOK)) {
      if (!entry.dice) continue
      expect(entry.dice, `${name} has a multi-group dice string`)
        .toMatch(/^\d+d\d+([+-]\d+)?$/)
    }
  })
})
