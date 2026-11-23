import { describe, expect, it } from "vitest"
import { restRemark, roadRemarks, ROAD_REMARK_CHANCE } from "./road-remarks"
import { MAX_ADVICE } from "@/lib/npc-advice"

const always = () => 0
const never = () => 0.999
const ALL = ["ront", "eldeth", "derendil", "sarith", "buppido", "jimjar", "shuushar", "topsy", "turvy", "stool"]

describe("what the company says on the pixel road (Sam, 2026-11-23)", () => {
  it("nobody asks to rest while the party is fresh", () => {
    expect(restRemark(ALL, 0, "Kenta")).toBeNull()
    expect(restRemark(ALL, 5.9, "Kenta")).toBeNull()
  })
  it("someone asks from the sixth hour, and the small print follows the fatigue gauge", () => {
    const weary = restRemark(ALL, 6, "Kenta")!
    expect(weary).toMatchObject({ who: "eldeth", name: "Eldeth", kind: "rest" })
    expect(weary.line).toContain("Kenta")
    expect(weary.note).toBe("6 of the day's 8 hours walked.")
    expect(restRemark(ALL, 8, "Kenta")!.note).toContain("Further is a forced march")
    expect(restRemark(ALL, 9.5, "Kenta")!.note).toContain("DC 12 Constitution save")
  })
  it("a party with no companions hears nothing", () => {
    expect(restRemark([], 9, "Kenta")).toBeNull()
    expect(roadRemarks({ companions: [], hoursToday: 9, you: "Kenta", rand: always })).toEqual([])
  })
  it("only those the book says know a road give a direction", () => {
    const said = roadRemarks({ companions: ["sarith", "ront"], hoursToday: 0, you: "Kenta", rand: always })
    expect(said.filter((r) => r.kind === "advice").map((r) => r.who)).toEqual(["sarith"])
    expect(said.find((r) => r.who === "sarith")!.note).toBe("knows the way to any region on the map")
    expect(said.every((r) => r.kind !== "rest")).toBe(true)
  })
  it("Eldeth offers the help the book gives her, never a direction", () => {
    const said = roadRemarks({ companions: ["eldeth"], hoursToday: 0, you: "Kenta", rand: always })
    expect(said).toHaveLength(1)
    expect(said[0]).toMatchObject({ who: "eldeth", kind: "help", note: "cannot navigate here, but helps the navigator (+5 Survival)" })
  })
  it("keeps to a rest and two other voices, each companion once", () => {
    const said = roadRemarks({ companions: ALL, hoursToday: 8.5, you: "Kenta", rand: always })
    expect(said[0].kind).toBe("rest")
    expect(said.filter((r) => r.kind !== "rest")).toHaveLength(MAX_ADVICE)
    expect(new Set(said.map((r) => r.who)).size).toBe(said.length)
  })
  it("is quiet when the dice say so", () => {
    expect(ROAD_REMARK_CHANCE).toBe(0.3)
    expect(roadRemarks({ companions: ALL, hoursToday: 2, you: "Kenta", rand: never })).toEqual([])
  })
  it("says the leader's name, or 'friend' when it has none", () => {
    expect(roadRemarks({ companions: ["ront"], hoursToday: 0, you: " ", rand: always })[0].line).toContain("friend")
  })
  it("hails first, each in their own word for the leader", () => {
    const call = (slug: string) => ({ ront: "elf", eldeth: "Sorcerer", jimjar: "Kenta" } as Record<string, string>)[slug]
    const said = roadRemarks({ companions: ["ront", "eldeth", "jimjar"], hoursToday: 7, you: call, rand: always })
    const by = Object.fromEntries(said.map((r) => [r.who, r]))
    expect(by.eldeth.hail).toBe("Hey Sorcerer!")
    expect(by.eldeth.line).toContain("Sorcerer")
    expect(by.ront.hail).toBe("Hey elf!")
    expect(by.jimjar.hail).toBe("Hey Kenta!")
    expect(roadRemarks({ companions: ["stool"], hoursToday: 0, you: "Kenta", rand: always })[0].hail).toBe("(Kenta…)")
  })
})
