import { describe, expect, it } from "vitest"
import {
  INSPIRATION_MINUTES,
  bardLevel,
  bardState,
  grantInspiration,
  heldInspiration,
  inspirationDie,
  inspirationUses,
  restoreOnLongRest,
  spendInspiration,
} from "./bardic-inspiration"

// Scott as the live row reads 2026-10-15: Bard 1, CHA 16 (+3).
const scott = { id: "scott", name: "Scott", class: "Bard", level: 1, cha_modifier: 3, sheet_resources: {} }
const ront = { id: "ront", name: "Ront", sheet_resources: null }
const fifi = { id: "fifi", name: "Fifi", sheet_resources: {} }

describe("bard level, die and uses", () => {
  it("reads a bare Bard as all levels and a split class by its number", () => {
    expect(bardLevel({ class: "Bard", level: 4 })).toBe(4)
    expect(bardLevel({ class: "Rogue 3 / Bard 2", level: 5 })).toBe(2)
    expect(bardLevel({ class: "Rogue", level: 5 })).toBe(0)
    expect(bardLevel({ class: null, level: 5 })).toBe(0)
  })
  it("steps the die at 5, 10 and 15", () => {
    expect([1, 4, 5, 9, 10, 14, 15, 20].map(inspirationDie)).toEqual([6, 6, 8, 8, 10, 10, 12, 12])
    expect(inspirationDie(0)).toBe(0)
  })
  it("uses the Charisma modifier, minimum one", () => {
    expect(inspirationUses(3)).toBe(3)
    expect(inspirationUses(0)).toBe(1)
    expect(inspirationUses(-1)).toBe(1)
    expect(inspirationUses(null)).toBe(1)
  })
  it("Scott starts with 3 of 3 and a d6", () => {
    expect(bardState(scott)).toEqual({ isBard: true, level: 1, die: 6, max: 3, used: 0, left: 3 })
  })
  it("never reports more used than he has", () => {
    expect(bardState({ ...scott, sheet_resources: { bardic_inspiration: { used: 9 } } }).left).toBe(0)
  })
})

describe("granting", () => {
  it("spends one use and gives an NPC the die", () => {
    const g = grantInspiration({ bard: scott, target: ront, now: 1000 })
    expect(g.ok).toBe(true)
    if (!g.ok) return
    expect(g.bardResources.bardic_inspiration).toEqual({ used: 1 })
    expect(g.targetResources.inspiration_held).toEqual({ die: 6, from_id: "scott", from_name: "Scott", granted_at: 1000 })
    expect(g.left).toBe(2)
  })
  it("keeps whatever else is in the column", () => {
    const g = grantInspiration({ bard: { ...scott, sheet_resources: { innate_sorcery: { used: 1 } } }, target: fifi, now: 0 })
    expect(g.ok && g.bardResources.innate_sorcery).toEqual({ used: 1 })
  })
  it("refuses himself, a non-bard, the empty bard, range, and a second die", () => {
    expect(grantInspiration({ bard: scott, target: scott, now: 0 }).ok).toBe(false)
    expect(grantInspiration({ bard: { ...scott, class: "Rogue" }, target: fifi, now: 0 }).ok).toBe(false)
    expect(grantInspiration({ bard: { ...scott, sheet_resources: { bardic_inspiration: { used: 3 } } }, target: fifi, now: 0 }).ok).toBe(false)
    expect(grantInspiration({ bard: scott, target: fifi, distanceFt: 65, now: 0 }).ok).toBe(false)
    expect(grantInspiration({ bard: scott, target: fifi, distanceFt: 60, now: 0 }).ok).toBe(true)
    const held = { ...fifi, sheet_resources: { inspiration_held: { die: 6, from_id: "scott", from_name: "Scott", granted_at: 0 } } }
    expect(grantInspiration({ bard: scott, target: held, now: 10 }).ok).toBe(false)
  })
  it("lets a new die replace one that has run out", () => {
    const stale = { ...fifi, sheet_resources: { inspiration_held: { die: 6, from_id: "scott", from_name: "Scott", granted_at: 0 } } }
    expect(grantInspiration({ bard: scott, target: stale, now: INSPIRATION_MINUTES + 1 }).ok).toBe(true)
  })
})

describe("holding and spending", () => {
  const held = { name: "Ront", sheet_resources: { inspiration_held: { die: 6, from_id: "scott", from_name: "Scott", granted_at: 100 } } }
  it("lasts the hour, then goes", () => {
    expect(heldInspiration(held.sheet_resources, 100 + INSPIRATION_MINUTES)).not.toBeNull()
    expect(heldInspiration(held.sheet_resources, 101 + INSPIRATION_MINUTES)).toBeNull()
  })
  it("does not expire when the clock could not be read", () => {
    expect(heldInspiration(held.sheet_resources, null)).not.toBeNull()
    expect(heldInspiration({ inspiration_held: { die: 6, from_id: null, from_name: null, granted_at: null } }, 99999)).not.toBeNull()
  })
  it("uses the table's face when it is a real face, and removes the die", () => {
    const s = spendInspiration(held, 120, { face: 4 })
    expect(s.ok && s.face).toBe(4)
    expect(s.ok && s.resources.inspiration_held).toBeUndefined()
  })
  it("rolls its own when the face is missing or impossible", () => {
    expect(spendInspiration(held, 120, { face: 7, rng: () => 0.99 })).toMatchObject({ ok: true, face: 6 })
    expect(spendInspiration(held, 120, { rng: () => 0 })).toMatchObject({ ok: true, face: 1 })
  })
  it("cannot spend what is not there", () => {
    expect(spendInspiration(fifi, 0).ok).toBe(false)
    expect(spendInspiration(held, 500).ok).toBe(false)
  })
})

describe("the long rest", () => {
  it("gives every use back", () => {
    expect(restoreOnLongRest({ bardic_inspiration: { used: 2 } }, 0)).toEqual({ bardic_inspiration: { used: 0 } })
  })
  it("drops a die past its hour and keeps one still good", () => {
    const stale = { inspiration_held: { die: 6, from_id: "s", from_name: "Scott", granted_at: 0 } }
    expect(restoreOnLongRest(stale, 600)).toEqual({})
    expect(restoreOnLongRest(stale, 30)).toBeNull()
  })
  it("writes nothing when nothing changes", () => {
    expect(restoreOnLongRest({}, 0)).toBeNull()
    expect(restoreOnLongRest(null, 0)).toBeNull()
    expect(restoreOnLongRest({ bardic_inspiration: { used: 0 } }, 0)).toBeNull()
  })
})
