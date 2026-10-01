import { describe, expect, it } from "vitest"
import { BENCH_CLIPS, preparedArt } from "./alchemy-art"
import { EXTRACTION_METHOD } from "./extraction"

describe("approved bench art", () => {
  it("has all six approved reaction clips", () => {
    expect(Object.keys(BENCH_CLIPS).sort()).toEqual(["idle", "inert", "mixing", "purify", "smoke", "success"])
  })

  it("has prepared art for every ingredient — Nightlight on the approved redo B", () => {
    const withArt = Object.keys(EXTRACTION_METHOD).filter((s) => preparedArt(s))
    expect(withArt.length).toBe(33)
    expect(preparedArt("nightlight-fungus")).toMatch(/nightlight-fungus-b\.png$/)
    expect(preparedArt("not-an-ingredient")).toBeNull()
  })
})
