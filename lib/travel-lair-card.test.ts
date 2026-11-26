// The encounter card's SEARCH THE LAIR (components/map/travel-cards.tsx), rendered for real: when the button shows,
// and what the card says once the lair is searched (Sam, 2026-11-25: "Build it there").
import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { TravelCards, type Travel } from "@/components/map/travel-cards"
import type { Halt, LairFind } from "@/components/map/use-travel"

const noop = () => {}
const STANCES = [
  { key: "slip_past", label: "Slip past", detail: "Everyone moves quietly.", check: "Group Stealth vs passive Perception 12", available: true, blocked: null },
  { key: "ambush", label: "Ambush them", detail: "Strike first.", check: null, available: true, blocked: null },
] as Halt["stances"]
const base: Halt = { kind: "encounter", title: "Ambushers", body: "Something waits in a side passage.", rolls: [], source: "OotA ch.2", meeting: { first: "party", chip: "You saw them first" }, foes: [], stances: STANCES, stance: null, battle: null, noBattle: null, ruins: false, lair: true, lairFind: null } as Halt
const card = (halt: Halt) => renderToStaticMarkup(createElement(TravelCards, { t: {
  nodes: [], edges: [], party: null, loaded: true, dmKey: "dm", setRefresh: noop, confirmNode: null, setConfirmNode: noop, arrivedAt: null, setArrivedAt: noop,
  halt, continueMarch: noop, takeStance: noop, stanceBusy: false, searchLair: noop, lairBusy: false,
  vessels: [], hasBoat: false, march: { pace: "slow", hours_today: 2, days_marched: 0 }, guides: [], pcs: [], canLead: true, lead: null, me: null,
  beat: null, options: null, entrance: null, roadChoice: null, hoverNode: null, byId: new Map(),
} as unknown as Travel }))
const passed = { key: "slip_past", outcome: "passed", surprised: null, dc: 12, checks: [], text: "The party is past them unseen.", source: "t" } as unknown as Halt["stance"]
const fought = { ...passed!, key: "ambush", outcome: "fight", text: "It is a fight." } as unknown as Halt["stance"]
const parley = { ...passed!, key: "talk", outcome: "parley", text: "The party speaks." } as unknown as Halt["stance"]

describe("SEARCH THE LAIR on the encounter card", () => {
  it("is not offered while the party is still choosing", () => {
    const html = card(base)
    expect(html).toContain("Slip past")
    expect(html).not.toContain("SEARCH THE LAIR")
  })
  it("is offered once they slipped past, and after a fight it says it is for when they are dead", () => {
    expect(card({ ...base, stances: [], stance: passed })).toMatch(/SEARCH THE LAIR<\/button>/)
    expect(card({ ...base, stances: [], stance: fought })).toContain("SEARCH THE LAIR (ONCE THEY ARE DEAD)")
  })
  it("is not offered after a parley, nor where the dice named no Ambushers", () => {
    expect(card({ ...base, stances: [], stance: parley })).not.toContain("SEARCH THE LAIR")
    expect(card({ ...base, lair: false, stances: [], stance: passed })).not.toContain("SEARCH THE LAIR")
  })
  it("shows the find in place of the button: the check, the book's d20, and what went into whose pack", () => {
    const find: LairFind = { searcher: "Sarith", skill: "investigation", arithmetic: "d20(20) + INT(+3) = 23 vs DC 15", face: 11, result: "A corpse clutching a salvageable nonmagical weapon", note: "Sarith prises a dagger from a dead hand.", awarded: [{ name: "Dagger", quantity: 1 }], dm_picks: null, flags: [], source: "OotA ch.2 p.32" }
    const html = card({ ...base, stances: [], stance: passed, lairFind: find })
    expect(html).not.toContain("SEARCH THE LAIR")
    expect(html).toContain("Sarith prises a dagger from a dead hand.")
    expect(html).toContain("Sarith: Investigation d20(20) + INT(+3) = 23 vs DC 15")
    expect(html).toContain("d20 = 11")
    expect(html).toContain("Into Sarith&#x27;s pack: Dagger")
    const hoard = card({ ...base, stances: [], stance: fought, lairFind: { ...find, face: 20, awarded: [], dm_picks: "A hoard: 2d6 50 gp gems and 1d4 rolls on DMG Table C" } })
    expect(hoard).toContain("For the DM to choose from the catalog: A hoard")
  })
})
