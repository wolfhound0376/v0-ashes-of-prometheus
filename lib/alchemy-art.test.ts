import { describe, expect, it } from "vitest"
import { BENCH_CLIPS, preparedArt } from "./alchemy-art"
import { EXTRACTION_METHOD } from "./extraction"

describe("approved bench art", () => {
  it("has all six approved reaction clips", () => {
    expect(Object.keys(BENCH_CLIPS).sort()).toEqual(["idle", "inert", "mixing", "purify", "smoke", "success"])
  })

  it("has prepared art only for real ingredients, and none for the Nightlight Sam sent back", () => {
    const withArt = Object.keys(EXTRACTION_METHOD).filter((s) => preparedArt(s))
    expect(withArt.length).toBe(32)
    expect(preparedArt("nightlight-fungus")).toBeNull()
    expect(preparedArt("not-an-ingredient")).toBeNull()
  })
})
