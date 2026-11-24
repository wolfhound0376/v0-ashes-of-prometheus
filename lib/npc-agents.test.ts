import { describe, expect, it } from "vitest"
import {
  agentFor, applyDeltas, dedupeLines, involves, namesOf, parseRemembered, recall, recallScore, weighDeltas,
  MAX_PER_SCENE, PALLIATION, SCENE_CAP, type Memory,
} from "./npc-agents"

const eldeth = { name: "Eldeth Feldrun", aliases: ["Eldeth"] }
const derendil = { name: "Prince Derendil", aliases: ["Derendil"] }
const ront = { name: "Ront", aliases: [] }
const cards = [eldeth, derendil, ront]

describe("which card a name belongs to", () => {
  it("matches full names, aliases and first names", () => {
    expect(agentFor(cards, "Eldeth Feldrun")).toBe(eldeth)
    expect(agentFor(cards, "eldeth")).toBe(eldeth)
    expect(agentFor(cards, "Derendil")).toBe(derendil)
    expect(agentFor(cards, "Prince Derendil")).toBe(derendil)
    expect(agentFor(cards, "RONT")).toBe(ront)
  })
  it("a title is not a name: 'Prince' alone matches nobody", () => {
    expect(namesOf(derendil)).not.toContain("prince")
    expect(agentFor(cards, "Prince")).toBeNull()
  })
  it("strangers have no card", () => {
    expect(agentFor(cards, "Shoor")).toBeNull()
    expect(agentFor(cards, "")).toBeNull()
  })
})

describe("what an NPC was part of", () => {
  it("their own lines, lines to them, and lines that name them", () => {
    expect(involves(eldeth, { speaker: "Eldeth Feldrun", text: "Hold." })).toBe(true)
    expect(involves(eldeth, { speaker: "Kenta", recipient: "Eldeth", text: "Here." })).toBe(true)
    expect(involves(ront, { speaker: "Malachar", text: "Ront spits at the bars." })).toBe(true)
  })
  it("not a word inside another word", () => {
    expect(involves(ront, { speaker: "Malachar", text: "The front gate is shut." })).toBe(false)
  })
})

describe("recall", () => {
  const now = Date.parse("2026-11-23T12:00:00Z")
  const m = (id: string, gravity: number, daysAgo: number, about: string | null = null): Memory =>
    ({ id, agent_key: "eldeth", about_id: about, line: id, gravity, created_at: new Date(now - daysAgo * 864e5).toISOString() })

  it("a memory fades by half every seven days", () => {
    expect(recallScore(m("a", 80, 7), now)).toBeCloseTo(40)
  })
  it("brings the heaviest and freshest, about this hero, and big things about anyone", () => {
    const mems = [m("old-small", 30, 20, "kenta"), m("kind", 45, 1, "kenta"), m("other-small", 40, 0, "fifi"), m("other-big", 85, 1, "fifi"), m("world", 50, 2)]
    const got = recall(mems, { heroId: "kenta", k: 3, now }).map((x) => x.id)
    expect(got).toContain("kind")
    expect(got).toContain("other-big")
    expect(got).not.toContain("other-small")
  })
})

describe("how feelings move in one scene", () => {
  it("warmth lands at the palliation weight; harm lands whole", () => {
    expect(weighDeltas({ trust: 10 }).trust).toBe(Math.round(10 * PALLIATION))
    expect(weighDeltas({ resentment: 10 }).resentment).toBe(10)
    expect(weighDeltas({ resentment: -10 }).resentment).toBe(Math.round(-10 * PALLIATION))
  })
  it("debt is signed, not good or bad: never discounted", () => {
    expect(weighDeltas({ debt: -8 }).debt).toBe(-8)
  })
  it("one scene moves a feeling at most SCENE_CAP", () => {
    expect(weighDeltas({ fear: 90 }).fear).toBe(SCENE_CAP)
  })
  it("numbers stay inside -100..100", () => {
    expect(applyDeltas({ trust: 95 }, { trust: 20 }).trust).toBe(100)
    expect(applyDeltas({}, { fear: -5 }).fear).toBe(-5)
  })
})

describe("reading the Rememberer's answer", () => {
  const heroes = new Set(["h1"])
  it("keeps good memories and drops the rest", () => {
    const got = parseRemembered(`noise {"memories":[
      {"line":"Kenta shared his last ration with Eldeth.","about":"h1","gravity":52,"deltas":{"affection":8,"debt":-5,"bogus":3}},
      {"line":"x","about":"h1","gravity":50},
      {"line":"The guards doubled at the gate.","about":"nobody-we-know","gravity":140,"deltas":{"fear":5}}
    ]}`, heroes)
    expect(got).toHaveLength(2)
    expect(got[0]).toEqual({ line: "Kenta shared his last ration with Eldeth.", about: "h1", gravity: 52, deltas: { affection: 8, debt: -5 } })
    expect(got[1].about).toBeNull()
    expect(got[1].gravity).toBe(100)
    expect(got[1].deltas).toEqual({})
  })
  it("never more than MAX_PER_SCENE", () => {
    const many = { memories: Array.from({ length: 9 }, (_, i) => ({ line: `Thing number ${i}.`, about: null, gravity: 40 })) }
    expect(parseRemembered(JSON.stringify(many), heroes)).toHaveLength(MAX_PER_SCENE)
  })
  it("garbage is nothing, not a guess", () => {
    expect(parseRemembered("I think she remembers the bread.", heroes)).toEqual([])
    expect(parseRemembered("{not json", heroes)).toEqual([])
  })
})

it("the same line posted by every screen counts once", () => {
  const l = { at: "t", speaker: "(on the map)", text: "Ront falls." }
  expect(dedupeLines([l, { ...l, at: "t2" }, { ...l, text: "Ront rises." }])).toHaveLength(2)
})
