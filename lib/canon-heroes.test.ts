import { describe, expect, it } from "vitest"
import { CANON_HEROES, HERO_FILM_LOCATION, availability, canonById, canonBySlug, canonPayload, CANON_FORMAT } from "./canon-heroes"

describe("canon heroes", () => {
  it("are the four Sam named plus Lynkes and Gandalf (Sam, 2026-10-29), with distinct ids and slugs", () => {
    expect(CANON_HEROES.map((h) => h.name)).toEqual(["Kenta of Neverwinter", "Fifi of Waterdeep", "Scott Reedwind of Luskan", "Samson Stillwater", "Lynkes", "Gandalf"])
    expect(new Set(CANON_HEROES.map((h) => h.id)).size).toBe(6)
    expect(new Set(CANON_HEROES.map((h) => h.slug)).size).toBe(6)
  })

  it("films are found by location hero-intro + state <slug>, not by scene_key", () => {
    expect(HERO_FILM_LOCATION).toBe("hero-intro")
    for (const h of CANON_HEROES) expect(h).not.toHaveProperty("sceneKey")
  })

  it("only Lynkes's and Gandalf's films replay after a restart; the original four watch theirs once", () => {
    expect(CANON_HEROES.filter((h) => h.filmReplays).map((h) => h.slug)).toEqual(["lynkes", "gandalf"])
  })

  it("Lynkes and Gandalf carry their live characters.id, so the chooser hands over the real rows", () => {
    expect(canonBySlug("lynkes")?.id).toBe("a4b4c7cd-4bd6-45bb-9a32-a19a37bcb774")
    expect(canonBySlug("gandalf")?.id).toBe("614cac3d-f119-4b35-af78-766ddb510619")
  })

  it("looks up by slug and by id, and refuses anything else", () => {
    expect(canonBySlug("fifi")?.id).toBe("d00aa5b8-ced1-477d-9ec8-0861cca55498")
    expect(canonById("be060806-9938-4afd-9cf6-ad298d9eaa97")?.slug).toBe("samson")
    expect(canonBySlug("malachar")).toBeNull()
    expect(canonBySlug(undefined)).toBeNull()
    expect(canonById("not-a-hero")).toBeNull()
  })
})

describe("availability — one of each per run", () => {
  const fifi = canonBySlug("fifi")!
  it("is free with nobody seated and nothing waiting", () => {
    expect(availability(fifi, [], [])).toBe("free")
  })
  it("is seated when a player sits as her this run", () => {
    expect(availability(fifi, [{ id: fifi.id }], [])).toBe("seated")
  })
  it("a DM-run companion seat does not take her (a player may take that seat over)", () => {
    expect(availability(fifi, [{ id: fifi.id, dm: true }], [])).toBe("free")
  })
  it("is claimed while a claim waits at the DM's door, but not after it was turned away", () => {
    expect(availability(fifi, [], [{ canon_character_id: fifi.id, status: "pending" }])).toBe("claimed")
    expect(availability(fifi, [], [{ canon_character_id: fifi.id, status: "rejected" }])).toBe("free")
  })
  it("someone else's seat or claim does not take her", () => {
    expect(availability(fifi, [{ id: "someone-else" }], [{ canon_character_id: "someone-else", status: "pending" }])).toBe("free")
  })
})

describe("canon payload", () => {
  it("carries no sheet, only the name and class, in its own format", () => {
    const p = canonPayload(canonBySlug("scott")!)
    expect(p.format).toBe(CANON_FORMAT)
    expect(p.character).toEqual({ name: "Scott Reedwind of Luskan", class: "Bard" })
  })
})
