import { describe, expect, it } from "vitest"
import { pixelRoadFor, pixelRoadHref } from "./pixel-road"

describe("the pixel road on the real march (Sam, 2026-11-23)", () => {
  it("walks a road leg and never a sail leg", () => {
    expect(pixelRoadFor({ a: "velkynvelve", b: "rm-1", mode: null })).toBe("road-01")
    expect(pixelRoadFor({ a: "rm-1", b: "rm-2", mode: "road" })).toBe("road-01")
    expect(pixelRoadFor({ a: "darklake-1", b: "darklake-2", mode: "sail" })).toBeNull()
  })
  it("builds the page's address: leader first, companions after, the two ends named", () => {
    const href = pixelRoadHref({ road: "road-01", line: ["kenta", "freia"], npcs: ["eldeth", "ront", "kenta"], from: "Velkynvelve", to: "Road Marker 1" })
    const q = new URL(href, "http://x").searchParams
    expect(href.startsWith("/pixel-road/index.html?")).toBe(true)
    expect(q.get("embed")).toBe("1")
    expect(q.get("road")).toBe("road-01")
    expect(q.get("line")).toBe("kenta,freia")
    expect(q.get("npcs")).toBe("eldeth,ront")   // a slug already in the line is not walked twice
    expect(q.get("from")).toBe("Velkynvelve")
    expect(q.get("to")).toBe("Road Marker 1")
  })
  it("keeps anything that is not a sprite slug out of the address", () => {
    const q = new URL(pixelRoadHref({ road: "road-01", line: ["Kenta<script>"], npcs: [], from: "", to: "" }), "http://x").searchParams
    expect(q.get("line")).toBe("kentascript")
    expect(q.has("npcs")).toBe(false)
    expect(q.has("from")).toBe(false)
  })
})
