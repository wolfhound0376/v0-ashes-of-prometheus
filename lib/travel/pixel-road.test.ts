import { describe, expect, it } from "vitest"
import { parseRoadSpot, pixelRoadFor, pixelRoadHref, ROAD_SPOT_MAX_AGE_MS, roadSpot, roadSpotHref } from "./pixel-road"

describe("the pixel road on the real march (Sam, 2026-11-23)", () => {
  it("walks a road leg and never a sail leg", () => {
    const one = pixelRoadFor({ a: "velkynvelve", b: "rm-1", mode: null })
    expect(["road-02", "road-03"]).toContain(one)
    expect(pixelRoadFor({ a: "rm-1", b: "velkynvelve", mode: "road" })).toBe(one)   // either direction, same stretch
    expect(pixelRoadFor({ a: "darklake-1", b: "darklake-2", mode: "sail" })).toBeNull()
    const legs = ["velkynvelve", "rm-1", "rm-2", "rm-3", "rm-4", "rm-5", "sloobludop"]
    const got = new Set(legs.slice(1).map((b, i) => pixelRoadFor({ a: legs[i], b, mode: "road" })))
    expect(got.size).toBe(2)   // a march walks more than one stretch
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
  it("walks the march on the big stretch, several times the floor of the first", () => {
    const fs = require("node:fs") as typeof import("node:fs")
    const floor = (id: string) => (JSON.parse(fs.readFileSync(`public/pixel-road/${id}/road.json`, "utf8")).grid as string[]).join("").replace(/[^wr]/g, "").length
    expect(floor("road-02")).toBeGreaterThan(3 * floor("road-01"))
  })
})

describe("back to the same spot after a road fight (Sam, 2026-11-24)", () => {
  const src = pixelRoadHref({ road: "road-02", line: ["kenta", "freia"], npcs: ["eldeth"], from: "Road Marker 1", to: "Road Marker 2" })
  const now = 1_800_000_000_000
  it("keeps the leg and where the leader stood, and reads it back", () => {
    const s = roadSpot(src, { a: "rm-1", b: "rm-2" }, { x: 1403.6, y: 512.2 }, now)!
    expect(s).toEqual({ src, a: "rm-1", b: "rm-2", x: 1404, y: 512, t: now })
    expect(parseRoadSpot(JSON.stringify(s), now + 20 * 60_000)).toEqual(s)
  })
  it("keeps the leg's trap dice, so the stretch comes back with the same traps", () => {
    const s = roadSpot(src, { a: "rm-1", b: "rm-2", seed: "rm-1|rm-2|2000000" }, { x: 10, y: 20 }, now)!
    expect(s.seed).toBe("rm-1|rm-2|2000000")
    expect(parseRoadSpot(JSON.stringify(s), now + 60 * 60_000)?.seed).toBe("rm-1|rm-2|2000000")   // an hour-long fight: still the same dice
  })
  it("comes back to the same leg, at the spot, without asking the marker's dice again", () => {
    const q = new URL(roadSpotHref(roadSpot(src, { a: "rm-1", b: "rm-2" }, { x: 1404, y: 512 }, now)!), "http://x").searchParams
    expect(q.get("spot")).toBe("1404,512")
    expect(q.get("met")).toBe("1")
    expect(q.get("embed")).toBe("1")
    expect(q.get("road")).toBe("road-02")
    expect(q.get("line")).toBe("kenta,freia")
    expect(q.get("npcs")).toBe("eldeth")
  })
  it("refuses a spot that is not a road page, has no place, or is from another day", () => {
    expect(roadSpot("https://elsewhere.example/x?", { a: "a", b: "b" }, { x: 1, y: 1 }, now)).toBeNull()
    expect(roadSpot(src, { a: "a", b: "b" }, { x: "nowhere", y: 1 }, now)).toBeNull()
    const s = JSON.stringify(roadSpot(src, { a: "a", b: "b" }, { x: 1, y: 1 }, now))
    expect(parseRoadSpot(s, now + ROAD_SPOT_MAX_AGE_MS + 1)).toBeNull()
    expect(parseRoadSpot("{not json", now)).toBeNull()
    expect(parseRoadSpot(null, now)).toBeNull()
    expect(parseRoadSpot(JSON.stringify({ src: "/velkynvelve?x=1", a: "a", b: "b", x: 1, y: 1, t: now }), now)).toBeNull()
  })
})
