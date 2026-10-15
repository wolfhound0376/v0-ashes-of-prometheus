import { describe, expect, it } from "vitest"
import { entranceFor, PAINTED_ENTRANCES } from "./entrance"

const URL = "https://example.supabase.co"
const node = (over: Partial<Parameters<typeof entranceFor>[0]> = {}) => ({
  node_key: "sloobludop", name: "Sloobludop", node_type: "location", metadata: null, ...over,
})

describe("entranceFor — a great place opens its entrance", () => {
  it("derives the plate from the node key", () => {
    const e = entranceFor(node(), URL)!
    expect(e.slug).toBe("sloobludop")
    expect(e.plate).toBe(`${URL}/storage/v1/object/public/vtt-assets/scenes/entrance/sloobludop.jpg`)
    expect(e.scene).toBeNull()
  })
  it("an explicit metadata.entrance_plate wins — the Shrine sits on a road node", () => {
    const e = entranceFor(node({ node_key: "road-05", name: "Shrine of Ibrandul", metadata: { entrance_plate: "shrine-of-ibrandul" } }), URL)!
    expect(e.slug).toBe("shrine-of-ibrandul")
    expect(e.name).toBe("Shrine of Ibrandul")
  })
  it("Velkynvelve can be walked into; the others are the plate alone, for now", () => {
    expect(entranceFor(node({ node_key: "velkynvelve", name: "Velkynvelve" }), URL)!.scene).toBe("/velkynvelve")
    expect(entranceFor(node({ node_key: "menzoberranzan", name: "Menzoberranzan" }), URL)!.scene).toBeNull()
  })
  it("no plate, no entrance — nothing is invented", () => {
    expect(entranceFor(node({ node_key: "road-11", name: "Road Marker 11" }), URL)).toBeNull()
    expect(entranceFor(node({ node_type: "waypoint" }), URL)).toBeNull()
  })
  it("all eight approved plates resolve", () => {
    for (const slug of PAINTED_ENTRANCES) {
      expect(entranceFor(node({ node_key: slug, name: slug }), URL)?.slug).toBe(slug)
    }
  })
})
