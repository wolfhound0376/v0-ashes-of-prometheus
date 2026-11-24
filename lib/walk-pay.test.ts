import { describe, it, expect } from "vitest"
import { planPayment, partyGp } from "./walk-pay"
import { purseGp } from "./camp"

describe("the party pays out of everything it carries (Old Thessaly's boat, 100 gp)", () => {
  it("counts purses and loose coin together", () => {
    expect(partyGp([{ characterId: "a", currency: { gp: 30, sp: 5 } }], [{ rowId: "r", characterId: "b", slug: "gold-coin", qty: 24 }])).toBe(54.5)
  })
  it("refuses when the whole party is short, and says what it has", () => {
    const r = planPayment([{ characterId: "a", currency: { gp: 40 } }], [{ rowId: "r", characterId: "a", slug: "gold-coin", qty: 9 }], 100)
    expect(r).toEqual({ ok: false, had: 49, need: 100 })
  })
  it("takes purses first, in party order", () => {
    const r = planPayment([{ characterId: "a", currency: { gp: 60 } }, { characterId: "b", currency: { gp: 70 } }], [], 100)
    if (!r.ok) throw new Error("short")
    expect(r.purses).toEqual([{ characterId: "a", currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } }, { characterId: "b", currency: { cp: 0, sp: 0, ep: 0, gp: 30, pp: 0 } }])
    expect(r.coins).toEqual([])
  })
  it("then loose coin, biggest first, and gives change into that hero's purse", () => {
    const r = planPayment([{ characterId: "a", currency: { gp: 5 } }],
      [{ rowId: "s", characterId: "b", slug: "silver-coin", qty: 30 }, { rowId: "p", characterId: "b", slug: "platinum-coin", qty: 10 }], 100)
    if (!r.ok) throw new Error("short")
    // 5 gp from a's purse; 95 gp left: ten platinum (100 gp) overshoots by 5 gp, which comes back to b
    expect(r.coins).toEqual([{ rowId: "p", qty: 0 }])
    expect(r.purses.find((p) => p.characterId === "b")?.currency.gp).toBe(5)
    // value is kept: what was paid is exactly 100 gp
    const before = 5 + 3 + 100, after = purseGp(r.purses.find((p) => p.characterId === "a")!.currency) + 3 + purseGp(r.purses.find((p) => p.characterId === "b")!.currency)
    expect(Math.round((before - after) * 100) / 100).toBe(100)
  })
  it("takes only the coins it needs from a stack", () => {
    const r = planPayment([], [{ rowId: "g", characterId: "a", slug: "gold-coin", qty: 140 }], 100)
    if (!r.ok) throw new Error("short")
    expect(r.coins).toEqual([{ rowId: "g", qty: 40 }])
    expect(r.purses).toEqual([])
  })
})
