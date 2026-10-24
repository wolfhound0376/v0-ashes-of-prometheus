import { describe, expect, it } from "vitest"
import { parseWalkHandoff, walkHandoffHref, WALK_HANDOFFS } from "./handoff"

describe("walk hand-off — a way out of Velkynvelve lands the party on the travel map", () => {
  it("every cavern in Sam's export has a name and a camp plate that exists", () => {
    for (const k of ["tunnels", "wastes", "shore", "lair", "grove", "crystal"] as const) {
      expect(WALK_HANDOFFS[k].name).toBeTruthy()
      expect(["tunnels", "fungal", "shore"]).toContain(WALK_HANDOFFS[k].biome)
    }
  })
  it("the river comes out on the shore, the grove is fungal, the unpainted caverns fall to the tunnels", () => {
    expect(WALK_HANDOFFS.shore.biome).toBe("shore")
    expect(WALK_HANDOFFS.grove.biome).toBe("fungal")
    expect(WALK_HANDOFFS.wastes.biome).toBe("tunnels")
    expect(WALK_HANDOFFS.lair.biome).toBe("tunnels")
  })
  it("the href is the string the walk page builds by hand", () => {
    expect(walkHandoffHref("tunnels")).toBe("/map?from=velkynvelve&via=tunnels&plate=tunnels")
    expect(walkHandoffHref("grove")).toBe("/map?from=velkynvelve&via=grove&plate=fungal")
  })
  it("reads its own href back", () => {
    const a = parseWalkHandoff(walkHandoffHref("shore").slice("/map".length))!
    expect(a).toMatchObject({ from: "velkynvelve", via: "shore", biome: "shore", name: "The Darklake shore" })
    expect(a.plate).toBe("/camp/plates/shore.webp")
  })
  it("an explicit plate wins only when it is a real camp plate", () => {
    expect(parseWalkHandoff("?via=wastes&plate=shore")!.biome).toBe("shore")
    expect(parseWalkHandoff("?via=wastes&plate=lava")!.biome).toBe("tunnels")
  })
  it("no hand-off, or one it does not know, is nothing — never a guess", () => {
    expect(parseWalkHandoff("")).toBeNull()
    expect(parseWalkHandoff("?via=menzoberranzan")).toBeNull()
    expect(parseWalkHandoff(new URLSearchParams({ from: "velkynvelve" }))).toBeNull()
  })
})
