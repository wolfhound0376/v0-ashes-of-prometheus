import { describe, expect, it } from "vitest"
import { addressOptions } from "./address-options"

const roster = [
  { name: "Buppido" },
  { name: "Stool" },
  { name: "Drow Guard" },
  { name: "Eldeth Feldrun", aliases: ["Eldeth"] },
  { name: "Jorlan Duskryn" },
]

describe("addressOptions", () => {
  it("offers the guard who just spoke even though the window shows the partner (today's log)", () => {
    const opts = addressOptions({
      window: "Stool", partner: "Stool", onStage: [{ name: "Stool" }, { name: "Buppido" }], roster,
      recentSpeakers: ["Malachar", "Drow Guard", "Fifi of Waterdeep", "Stool"], players: ["Fifi of Waterdeep"],
    })
    expect(opts).toEqual(["Stool", "Drow Guard", "Buppido"])
  })

  it("never offers Malachar, the narrator, or a player", () => {
    const opts = addressOptions({
      window: null, partner: null, onStage: [], roster,
      recentSpeakers: ["Malachar", "NARRATOR", "System", "Kenta of Neverwinter"], players: ["Kenta of Neverwinter"],
    })
    expect(opts).toEqual([])
  })

  it("treats the short and long spellings of one name as one person", () => {
    const opts = addressOptions({
      window: "Eldeth Feldrun", partner: "Eldeth", onStage: [{ name: "Eldeth Feldrun" }], roster,
      recentSpeakers: ["Eldeth Feldrun"], players: [],
    })
    expect(opts).toEqual(["Eldeth Feldrun"])
  })

  it("skips a log speaker the roster does not know", () => {
    const opts = addressOptions({ window: null, partner: null, onStage: [], roster, recentSpeakers: ["Some Stranger"], players: [] })
    expect(opts).toEqual([])
  })

  it("puts the newest speaker first after the window, and caps the list", () => {
    const opts = addressOptions({
      window: "Buppido", partner: null, onStage: [], roster,
      recentSpeakers: ["Jorlan Duskryn", "Stool", "Drow Guard"], players: [], max: 3,
    })
    expect(opts).toEqual(["Buppido", "Jorlan Duskryn", "Stool"])
  })

  it("keeps two different drow apart", () => {
    const opts = addressOptions({
      window: null, partner: null, onStage: [{ name: "Drow Guard" }, { name: "Drow Priestess" }], roster, recentSpeakers: [], players: [],
    })
    expect(opts).toEqual(["Drow Guard", "Drow Priestess"])
  })
})
