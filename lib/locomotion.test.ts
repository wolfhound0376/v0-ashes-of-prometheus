import { describe, expect, it } from "vitest"
import { hasTeleport, isAlwaysAirborne, isFlier, locomotionOf, parseSpeed } from "./locomotion"

describe("parseSpeed", () => {
  it("reads a plain walker", () => {
    expect(parseSpeed("30 ft.")).toMatchObject({ walk: 30, fly: 0, hover: false, climb: 0, burrow: 0, swim: 0 })
  })
  it("reads the bestiary's fly lines", () => {
    expect(parseSpeed("10 ft., fly 60 ft.")).toMatchObject({ walk: 10, fly: 60, hover: false })
    expect(parseSpeed("30 ft., fly 60 ft.")).toMatchObject({ walk: 30, fly: 60 })
  })
  it("marks a hovering flier and a creature that cannot walk", () => {
    const specter = parseSpeed("0 ft., fly 50 ft. (hover)")
    expect(specter).toMatchObject({ walk: 0, fly: 50, hover: true })
    expect(isAlwaysAirborne({ ...specter, teleport: false })).toBe(true)
    expect(isFlier({ ...parseSpeed("0 ft., fly 30 ft."), teleport: false })).toBe(true)
  })
  it("reads climb, swim and burrow without confusing them for walking", () => {
    expect(parseSpeed("30 ft., climb 30 ft.")).toMatchObject({ walk: 30, climb: 30, fly: 0 })
    expect(parseSpeed("15 ft., climb 15 ft., swim 15 ft.")).toMatchObject({ walk: 15, climb: 15, swim: 15 })
    expect(parseSpeed("20 ft., burrow 20 ft.")).toMatchObject({ walk: 20, burrow: 20 })
  })
  it("treats a hover note in prose as a hover only when there is a fly speed", () => {
    expect(parseSpeed("30 ft. (hover, moved by the caster's action)")).toMatchObject({ walk: 30, fly: 0, hover: false })
  })
  it("defaults a blank line to a 30 ft. walker", () => {
    expect(parseSpeed(null)).toMatchObject({ walk: 30, fly: 0 })
    expect(parseSpeed("")).toMatchObject({ walk: 30 })
  })
})

describe("hasTeleport / locomotionOf", () => {
  it("finds a teleport in traits or actions, as text or json", () => {
    expect(hasTeleport("Ethereal Jaunt. As a bonus action, the spider can magically shift")).toBe(true)
    expect(hasTeleport([{ name: "Misty Step", desc: "teleports up to 30 feet" }])).toBe(true)
    expect(hasTeleport("Multiattack. The drow makes two attacks.")).toBe(false)
    expect(hasTeleport(null, undefined)).toBe(false)
  })
  it("assembles the whole reading from a bestiary row", () => {
    const phase = locomotionOf({ speed: "30 ft., climb 30 ft.", traits: [{ name: "Ethereal Jaunt", desc: "shift" }] })
    expect(phase).toMatchObject({ walk: 30, climb: 30, teleport: true })
    expect(locomotionOf(null)).toMatchObject({ walk: 30, teleport: false })
  })
})
