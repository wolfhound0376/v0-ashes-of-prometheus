import { describe, expect, it } from "vitest"
import {
  canShoveSize,
  jumpCostFt,
  pushSquare,
  resolveJump,
  resolveShove,
  sizeRank,
} from "./shove"
import type { SheetSlice } from "./game-context"

const sheet = (
  over: Partial<SheetSlice> & { name: string; size?: string },
): SheetSlice & { size?: string } => ({
  id: over.name,
  level: 1,
  str_score: 10,
  dex_score: 10,
  con_score: 10,
  int_score: 10,
  wis_score: 10,
  cha_score: 10,
  ...over,
})

/** Deterministic d20: always the value given. */
const always = (n: number) => () => (n - 1) / 20 + 0.001

describe("size", () => {
  it("orders the SRD categories", () => {
    expect(sizeRank("tiny")).toBeLessThan(sizeRank("gargantuan"))
  })

  it("reads an unknown or missing size as Medium rather than throwing", () => {
    expect(sizeRank(null)).toBe(sizeRank("medium"))
    expect(sizeRank("enormous-ish")).toBe(sizeRank("medium"))
  })

  it("allows one size larger and refuses two", () => {
    expect(canShoveSize("medium", "large")).toBe(true)
    expect(canShoveSize("small", "large")).toBe(false)
    expect(canShoveSize("medium", "medium")).toBe(true)
    // Shoving DOWN the ladder is always fine.
    expect(canShoveSize("large", "tiny")).toBe(true)
  })
})

describe("pushSquare", () => {
  it("pushes directly away, straight", () => {
    expect(pushSquare({ grid_x: 5, grid_y: 5 }, { grid_x: 5, grid_y: 6 })).toEqual({ grid_x: 5, grid_y: 7 })
  })

  it("pushes diagonally when the shove came diagonally", () => {
    expect(pushSquare({ grid_x: 5, grid_y: 5 }, { grid_x: 6, grid_y: 6 })).toEqual({ grid_x: 7, grid_y: 7 })
  })

  it("does not produce NaN when both stand on one square", () => {
    expect(pushSquare({ grid_x: 5, grid_y: 5 }, { grid_x: 5, grid_y: 5 })).toEqual({ grid_x: 5, grid_y: 5 })
  })
})

describe("resolveShove", () => {
  const base = {
    from: { grid_x: 5, grid_y: 5 },
    targetAt: { grid_x: 5, grid_y: 6 },
    width: 12,
    height: 12,
  }

  it("a strong shover beats a weak target and pushes them a square", () => {
    const r = resolveShove({
      ...base,
      shover: sheet({ name: "Ront", str_score: 18, size: "medium" }),
      target: sheet({ name: "Fifi", str_score: 8, dex_score: 8, size: "medium" }),
      outcome: "push",
      rng: always(15),
    })
    expect(r.success).toBe(true)
    expect(r.to).toEqual({ grid_x: 5, grid_y: 7 })
  })

  it("a knock-down moves nobody", () => {
    const r = resolveShove({
      ...base,
      shover: sheet({ name: "Ront", str_score: 18 }),
      target: sheet({ name: "Fifi", str_score: 8, dex_score: 8 }),
      outcome: "prone",
      rng: always(15),
    })
    expect(r.success).toBe(true)
    expect(r.to).toEqual(base.targetAt)
  })

  it("TIES GO TO THE DEFENDER — nothing moves", () => {
    // Identical sheets, identical roll: the contest ties, and SRD says the
    // situation remains as it was.
    const r = resolveShove({
      ...base,
      shover: sheet({ name: "A", str_score: 12 }),
      target: sheet({ name: "B", str_score: 12, dex_score: 12 }),
      outcome: "push",
      rng: always(10),
    })
    expect(r.success).toBe(false)
    expect(r.to).toEqual(base.targetAt)
  })

  it("refuses on size before rolling anything that matters", () => {
    const r = resolveShove({
      ...base,
      shover: sheet({ name: "Gnome", str_score: 20, size: "small" }),
      target: sheet({ name: "Hook Horror", str_score: 1, size: "large" }),
      outcome: "push",
      rng: always(20),
    })
    expect(r.success).toBe(false)
    expect(r.narration).toContain("too large")
  })

  it("the target defends with its BETTER of Athletics and Acrobatics", () => {
    const r = resolveShove({
      ...base,
      shover: sheet({ name: "Ront", str_score: 14 }),
      target: sheet({ name: "Fifi", str_score: 8, dex_score: 18 }),
      outcome: "push",
      rng: always(10),
    })
    expect(r.defendedWithAcrobatics).toBe(true)
  })

  it("a successful shove with nowhere to go stays a successful shove", () => {
    // Against the board edge. It does NOT silently become a knock-down:
    // inventing that rule would make the log lie.
    const r = resolveShove({
      ...base,
      targetAt: { grid_x: 5, grid_y: 11 },
      from: { grid_x: 5, grid_y: 10 },
      shover: sheet({ name: "Ront", str_score: 18 }),
      target: sheet({ name: "Fifi", str_score: 8, dex_score: 8 }),
      outcome: "push",
      rng: always(15),
    })
    expect(r.success).toBe(true)
    expect(r.to).toEqual({ grid_x: 5, grid_y: 11 })
    expect(r.narration).toContain("nowhere to give")
  })

  it("will not push into a blocked square", () => {
    const r = resolveShove({
      ...base,
      shover: sheet({ name: "Ront", str_score: 18 }),
      target: sheet({ name: "Fifi", str_score: 8, dex_score: 8 }),
      outcome: "push",
      rng: always(15),
      blocked: new Set(["5,7"]),
    })
    expect(r.success).toBe(true)
    expect(r.to).toEqual(base.targetAt)
  })

  it("shows the contest arithmetic in the log", () => {
    const r = resolveShove({
      ...base,
      shover: sheet({ name: "Ront", str_score: 18 }),
      target: sheet({ name: "Fifi", str_score: 8, dex_score: 8 }),
      outcome: "push",
      rng: always(15),
    })
    expect(r.narration).toContain("d20(")
    expect(r.narration).toContain("vs")
  })
})

describe("resolveJump", () => {
  it("long jump is the Strength SCORE with a run-up", () => {
    expect(resolveJump({ name: "Ront", strengthScore: 16, runUp: true }).longFt).toBe(16)
  })

  it("standing long jump is half that", () => {
    expect(resolveJump({ name: "Ront", strengthScore: 16, runUp: false }).longFt).toBe(8)
  })

  it("high jump is 3 + the MODIFIER, not the score", () => {
    // The pair everyone mangles: score for long, modifier for high.
    expect(resolveJump({ name: "Ront", strengthScore: 16, runUp: true }).highFt).toBe(6)
    expect(resolveJump({ name: "Weakling", strengthScore: 10, runUp: true }).highFt).toBe(3)
  })

  it("never returns a negative leap for a feeble creature", () => {
    expect(resolveJump({ name: "Stool", strengthScore: 1, runUp: true }).highFt).toBe(0)
  })

  it("survives a nonsense score", () => {
    expect(resolveJump({ name: "?", strengthScore: Number.NaN, runUp: true }).longFt).toBe(10)
  })

  it("costs a foot of movement per foot cleared", () => {
    expect(jumpCostFt(16)).toBe(16)
    expect(jumpCostFt(0)).toBe(0)
    expect(jumpCostFt(-5)).toBe(0)
  })
})
