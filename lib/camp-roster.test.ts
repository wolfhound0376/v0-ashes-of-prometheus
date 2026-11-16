import { describe, expect, it } from "vitest"
import { campName, campRoster, mouthsAtCamp } from "./camp-roster"
import { fullRestRations } from "./camp"

const hero = (cid: string) => ({ cid })

describe("campRoster", () => {
  it("seats the living heroes and the companions walking with them", () => {
    const r = campRoster({ heroes: { kenta: hero("k"), samson: hero("s"), scott: hero("sc") }, state: { company: ["eldeth", "derendil"], fallen: ["scott"] } })
    expect(r?.heroes.map((h) => h.slug)).toEqual(["kenta", "samson"])
    expect(r?.companions).toEqual(["eldeth", "derendil"])
    expect(mouthsAtCamp(r)).toBe(4)
  })
  it("leaves out anyone who is not a known prisoner, and counts each companion once", () => {
    const r = campRoster({ heroes: { kenta: hero("k") }, state: { company: ["eldeth", "eldeth", "drow-guard-male", 7] } })
    expect(r?.companions).toEqual(["eldeth"])
  })
  it("has no roster without heroes on the walk (the camp keeps its own company)", () => {
    expect(campRoster(null)).toBeNull()
    expect(campRoster({ heroes: {}, state: {} })).toBeNull()
    expect(campRoster({ heroes: { kenta: hero("k") }, state: { fallen: ["kenta"] } })).toBeNull()
  })
  it("more mouths cost more rations (Sam's table)", () => {
    const four = campRoster({ heroes: { a: hero("1"), b: hero("2"), c: hero("3"), d: hero("4") }, state: {} })
    const eight = campRoster({ heroes: { a: hero("1"), b: hero("2"), c: hero("3"), d: hero("4") }, state: { company: ["eldeth", "ront", "sarith", "derendil"] } })
    expect(fullRestRations(mouthsAtCamp(four))).toBe(20)
    expect(fullRestRations(mouthsAtCamp(eight))).toBe(30)
  })
})

describe("campName", () => {
  it("uses a companion's short name and a hero's first word", () => {
    expect(campName("derendil", "Prince Derendil")).toBe("Derendil")
    expect(campName("freia", "Fifi of Waterdeep")).toBe("Fifi")
    expect(campName("lynkes", null)).toBe("lynkes")
  })
})
