import { describe, expect, it } from "vitest"
import { buppidoInTheDark, fistFight, hungerEvent, hungerOdds, talkDownDc } from "./camp-hunger"

const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length] }

describe("hunger at the fire (Sam, 2026-11-15)", () => {
  it("grumbles the first night, 1 in 3 the second, 2 in 3 after", () => {
    expect(hungerOdds(1)).toBe(0)
    expect(hungerOdds(2)).toBeCloseTo(1 / 3)
    expect(hungerOdds(5)).toBeCloseTo(2 / 3)
    expect(talkDownDc(2)).toBe(20)
    expect(talkDownDc(3)).toBe(25)
  })
  it("a fed night brings nothing; a first hungry night only grumbling", () => {
    expect(hungerEvent(0, ["ront", "eldeth"], ["kenta"], seq(0)).kind).toBe("none")
    expect(hungerEvent(1, ["ront", "eldeth"], ["kenta"], seq(0)).kind).toBe("grumble")
  })
  it("Ront goes for Eldeth first, and Shuushar tries to calm it", () => {
    expect(hungerEvent(2, ["ront", "eldeth", "shuushar"], ["kenta"], seq(0))).toEqual({ kind: "brawl", a: "ront", b: "eldeth", dc: 20, calmer: true })
  })
  it("then Derendil rages, never at Shuushar; then Buppido; then the twins leave", () => {
    expect(hungerEvent(3, ["derendil", "shuushar", "sarith"], ["kenta"], seq(0))).toMatchObject({ kind: "rage", b: "sarith", dc: 25 })
    expect(hungerEvent(3, ["buppido"], ["kenta", "samson"], seq(0, 0.9))).toEqual({ kind: "buppido", target: "samson" })
    expect(hungerEvent(3, ["topsy"], ["kenta"], seq(0)).kind).toBe("twins")
    expect(hungerEvent(3, ["shuushar"], ["kenta"], seq(0)).kind).toBe("grumble")
  })
  it("a fist fight ends with one down at 1 HP", () => {
    const f = fistFight({ slug: "ront", name: "Ront", hp: 15, ac: 11, str: 16 }, { slug: "eldeth", name: "Eldeth", hp: 16, ac: 12, str: 11 }, seq(0.99))
    expect(f.loser.slug).toBe("eldeth")
    expect(f.loserHp).toBe(1)
    expect(f.winnerHp).toBeGreaterThan(0)
  })
  it("Buppido is seen by a sharp sleeper, and hits a dull one hard", () => {
    expect(buppidoInTheDark(30, 12, seq(0.5)).spotted).toBe(true)
    const b = buppidoInTheDark(5, 12, seq(0.5, 0.99, 0.99, 0.99, 0.99))
    expect(b.spotted).toBe(false)
    expect(b.hit).toBe(true)
    expect(b.damage).toBe(7)
  })
})
