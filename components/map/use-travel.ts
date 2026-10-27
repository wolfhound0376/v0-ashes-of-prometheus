"use client"

// The travel map's GAME LOGIC, shared by every view of it (Sam, 2026-10-27: make the 3D diorama the real travel
// map). Everything here used to live inside components/map/underdark-map.tsx, wound through its SVG: the data
// (nodes, edges, party, boats, the day's march, who leads), the departure sheet, the leader vote, the arrival
// beat, the options and entrance cards, the halt card, and the server calls behind them. It moved here VERBATIM
// so the 2D map and the 3D diorama can share one truth instead of two copies that drift.
//
// The one seam a view supplies is the walk itself. A view animates the party along the route however it draws
// it, and at each marker it awaits `reachNode(n)`. That call does exactly what the 2D walk did at a marker (ask
// the server what waits there, play the beat, open the cards) and resolves when the party may walk on, which is
// after the halt card's Continue if the march was stopped. `continueMarch(force)` is that Continue.

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useStage } from "@/components/stage/stage-provider"
import { dmHeaders, getDmKey, onDmKeyChange } from "@/lib/dm-key"
import type { VesselKind, VesselRow } from "@/lib/travel/vessels"
import { FRESH_DAY, type DayState, type Guide, type Navigator, type Pace } from "@/lib/travel/march"
import { parseWalkHandoff, roadsOpenedBy, type RoadChoice, type WalkArrival } from "@/lib/travel/handoff"
import { STINGER_GAIN, stingerUrl, type StingerCue } from "@/lib/travel/stingers"
import { speakBlob } from "@/lib/speech-queue"
import { emitCheckCue } from "@/lib/check-cue"

/**
 * The arrival cue (lib/travel/stingers.ts). A missing file is silence: the
 * cues go in only after Sam approves each take, and the march must not care.
 */
function playStinger(cue: StingerCue, delayMs = 0) {
  if (typeof Audio === "undefined") return
  const a = new Audio(stingerUrl(cue))
  a.volume = STINGER_GAIN[cue]
  a.addEventListener("error", () => {})
  setTimeout(() => void a.play().catch(() => {}), delayMs)
}

export const POLL_MS = 15000

export type NodeRow = {
  id: string
  node_key: string
  /** Null in the player view until the party learns the name. */
  name: string | null
  node_type: "region" | "location" | "tactical_map" | "waypoint"
  edge_id: string | null
  edge_position: number | null
  description: string | null
  metadata: Record<string, any> | null
  discovered_at?: string | null
  name_known?: boolean
}
export type EdgeRow = {
  id: string
  edge_key: string
  from_node_id: string
  to_node_id: string
  distance_miles: number
  danger_level: number
  metadata: Record<string, any> | null
  discovered_at?: string | null
}
export type PartyRow = { campaign_run_id: string; node_id: string; arrived_at: string }
/** An authored option at a node (lib/travel/options.ts), as the arrive reply sends it. */
export type OfferedOption = {
  key: string
  label: string
  detail?: string | null
  cost_line: string
  available: boolean
  blocked_by: string[]
  check?: { skill: string; dc: number }
}

/** The painted entrance of a great place (lib/travel/entrance.ts). */
export type EntranceInfo = { slug: string; plate: string; name: string; scene: string | null }

/** GET /api/travel/leader: who leads, how the vote stands, and the hours of the day (never the day number). */
export type LeadInfo = {
  leader: string | null
  by_vote: boolean
  votes: Record<string, string>
  counts: Record<string, number>
  needed: number
  roster: { id: string; name: string }[]
  available: boolean
  day: { pace: Pace; hours_today: number; day_miles: number }
}

export type Halt = {
  kind: string
  title: string
  body: string | null
  rolls: { title: string; die: number; roll: number; result: string; source: string }[]
  source: string
}

export function useTravel() {
  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [edges, setEdges] = useState<EdgeRow[]>([])
  const [party, setParty] = useState<PartyRow | null>(null)
  const [loaded, setLoaded] = useState(false)
  const stage = useStage()
  const [dmKey, setDmKeyState] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [confirmNode, setConfirmNode] = useState<NodeRow | null>(null)
  const [arrivedAt, setArrivedAt] = useState<NodeRow | null>(null)
  // What stopped the march, if anything. Held in the database too, so a reload
  // cannot walk the party past an ambush.
  const [halt, setHalt] = useState<Halt | null>(null)
  const resumeRef = useRef<(() => void) | null>(null)
  const lastNodeKey = useRef<string | null>(null)
  // The party's boats (party_vessels, lost_at null). The Darklake crossings
  // stay closed until one is earned in the fiction and recorded by the DM.
  const [vessels, setVessels] = useState<VesselRow[]>([])
  const hasBoat = vessels.length > 0
  // The day (lib/travel/march.ts): pace, hours on the road, who leads. Read
  // from /api/travel (DM) and refreshed from every arrival's reply.
  const [march, setMarch] = useState<DayState & { day_miles: number; navigator: Navigator | null }>({ ...FRESH_DAY, day_miles: 7, navigator: null })
  const [guides, setGuides] = useState<Guide[]>([])
  const [pcs, setPcs] = useState<{ id: string; name: string }[]>([])
  // The departure sheet's choices. "guide:<key>" | "pc:<id>" | "none".
  const [pace, setPace] = useState<Pace>("normal")
  const [navSel, setNavSel] = useState<string>("none")
  const [pcFamiliar, setPcFamiliar] = useState(false)
  const [pcHasMap, setPcHasMap] = useState(false)
  // WHO LEADS (lib/travel/leader.ts). This browser's claimed character, read
  // from the same localStorage keys the dashboard uses; the leader and the
  // standing votes from /api/travel/leader. The leader's browser gets the DM's
  // road controls - set out, walk, break camp - never the reveal buttons.
  const [me, setMe] = useState<{ characterId: string | null; claimToken: string | null }>({ characterId: null, claimToken: null })
  const [lead, setLead] = useState<LeadInfo | null>(null)
  const canLead = !!dmKey || (!!lead?.leader && !!me.characterId && lead.leader === me.characterId)
  const canLeadRef = useRef(false)
  canLeadRef.current = canLead
  // Only the browser that set the party walking asks the server what waits at
  // each marker. Two DM tabs (or the DM and the leader) watching the same
  // march must not both roll its encounters.
  const initiatedRef = useRef(false)
  // Pushing on past eight: every arrive carries force:true until camp is made.
  const forcingRef = useRef(false)
  // The hover card: price a leg before anyone clicks.
  const [hoverNode, setHoverNode] = useState<NodeRow | null>(null)
  // The arrival beat: the passive-roll chip and Malachar's line, shown a while.
  const [beat, setBeat] = useState<{ chip: string | null; noticed: boolean | null; line: string | null } | null>(null)
  // The options card and the entrance: both authored, both arriving with the leg.
  const [options, setOptions] = useState<{ node: NodeRow; list: OfferedOption[] } | null>(null)
  const [chosen, setChosen] = useState<{ label: string; success: boolean; text: string | null; roll: { name: string; arithmetic: string } | null; line: string | null; revealed: string | null } | null>(null)
  const [entrance, setEntrance] = useState<{ node: NodeRow; info: EntranceInfo } | null>(null)
  const [entering, setEntering] = useState(false)
  const beatTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // OUT OF VELKYNVELVE (Sam, 2026-10-24: wire the nodal map to the walk's "leave the map" options).
  // The walk page lands here with the way out in the query string (lib/travel/handoff.ts). Once the
  // party and the graph are loaded, the roads that way out opens are the hand-off's roads that an edge
  // really joins to the party's node: one road arms the departure sheet for it, several ask which way,
  // none leaves only the shell's banner. The state machine is told once (POST leave), then the query
  // string is cleared so a reload does not ask again.
  const [arrival, setArrival] = useState<WalkArrival | null>(null)
  const [roadChoice, setRoadChoice] = useState<RoadChoice[] | null>(null)
  const leftRef = useRef(false)

  useEffect(() => {
    setDmKeyState(getDmKey())
    try {
      setMe({ characterId: localStorage.getItem("aop_character_id"), claimToken: localStorage.getItem("aop_claim_token") })
    } catch {
      /* private mode: no claim, no lead */
    }
    try { setArrival(parseWalkHandoff(window.location.search)) } catch { setArrival(null) }
    return onDmKeyChange(() => setDmKeyState(getDmKey()))
  }, [])

  /** Request headers for /api/travel: the DM's key, or nothing (the player's claim rides in the body). */
  function travelHeaders(): Record<string, string> {
    return dmKey ? { ...dmHeaders(), "Content-Type": "application/json" } : { "Content-Type": "application/json" }
  }
  /** Request body for /api/travel: a player's claim is attached so the server can check they lead. */
  function travelBody(extra: Record<string, unknown>): string {
    return JSON.stringify(dmKey ? extra : { ...extra, character_id: me.characterId, claim_token: me.claimToken })
  }

  async function boatAction(body: { op: "acquire"; kind: VesselKind } | { op: "lose"; vessel_id: string }) {
    await fetch("/api/travel", {
      method: "POST",
      headers: { ...dmHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ action: "vessel", ...body }),
    }).catch(() => {})
    setRefresh((r) => r + 1)
  }

  async function dmAction(action: "reveal" | "reveal_name" | "move", nodeKey: string) {
    await fetch("/api/travel", {
      method: "POST",
      headers: travelHeaders(),
      body: travelBody({ action, node_key: nodeKey }),
    }).catch(() => {})
    setRefresh((r) => r + 1)
  }

  // A test hook, the same pattern the world-map prototype used (`__wm`): it lets
  // a headless check drive the arrival cards without walking the party across the
  // map first. It only sets local UI state, so it is inert in play.
  useEffect(() => {
    // Set, never deleted on cleanup: /map mounts this component inside a tabbed
    // shell, and a sibling unmounting would otherwise take the hook with it.
    ;(window as unknown as Record<string, unknown>).__aopMap = { setOptions, setEntrance, setChosen }
  }, [])

  /** Pick one of the node's authored options: the server charges the cost and rolls the check. */
  async function chooseOption(nodeKey: string, optionKey: string) {
    try {
      const res = await fetch("/api/travel", { method: "POST", headers: travelHeaders(), body: travelBody({ action: "choose", node_key: nodeKey, option_key: optionKey }) })
      const out = res.ok ? await res.json() : null
      if (!out?.ok) return
      setOptions(null)
      setChosen({ label: out.option?.label ?? "", success: !!out.success, text: out.text ?? null, roll: out.roll ? { name: out.roll.name, arithmetic: out.roll.arithmetic } : null, line: out.line ?? null, revealed: out.revealed ?? null })
      if (out.day) setMarch((m) => ({ ...m, ...out.day }))
      if (typeof out.line === "string" && out.line) {
        void fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: out.line, voice: "onyx" }) })
          .then(async (r) => { if (r.ok) speakBlob("dm", await r.blob(), { speaker: "Malachar" }) })
          .catch(() => {})
      }
      setRefresh((r) => r + 1)
    } catch {
      /* the option stands unchosen; the card can be clicked again */
    }
  }

  /** Step off the overworld into a great place. The server owns whether the edge is legal. */
  async function enterPlace(nodeKey: string, scene: string | null, plate: string, name: string) {
    if (entering) return
    setEntering(true)
    try {
      const res = await fetch("/api/travel", { method: "POST", headers: travelHeaders(), body: travelBody({ action: "enter", node_key: nodeKey }) })
      const out = res.ok ? await res.json() : null
      if (!out?.ok) {
        console.warn("[map] the party cannot enter here:", out?.error)
        setEntering(false)
        return
      }
      if (scene) {
        // The stage grows out of the plate into the place itself.
        await stage.go(scene, { caption: `The party enters ${name}.` })
        setEntrance(null)
      }
    } catch {
      /* stay at the gates */
    }
    setEntering(false)
  }

  /** A player's standing vote, or the DM naming the leader outright. */
  async function leadAction(body: { action: "vote"; for: string | null } | { action: "leader"; character_id: string | null }) {
    try {
      const res = await fetch("/api/travel", { method: "POST", headers: travelHeaders(), body: travelBody(body) })
      const out = res.ok ? await res.json() : null
      if (out && lead) setLead({ ...lead, leader: out.leader ?? null, by_vote: !!out.by_vote, votes: out.votes ?? lead.votes, counts: out.counts ?? lead.counts })
    } catch {
      /* the next poll will say where the vote stands */
    }
    setRefresh((r) => r + 1)
  }

  /**
   * Setting out: the pace and the navigator are declared BEFORE the first
   * step (OotA-Enc p.24-25), then the party moves. Both yes-buttons and the
   * Enter key come through here so the two paths cannot drift apart.
   */
  async function setOut(dest: NodeRow) {
    const navigator =
      navSel.startsWith("guide:") ? { kind: "guide", key: navSel.slice(6) }
      : navSel.startsWith("pc:") ? { kind: "pc", character_id: navSel.slice(3), familiar: pcFamiliar, has_map: pcHasMap }
      : null
    try {
      const res = await fetch("/api/travel", {
        method: "POST",
        headers: travelHeaders(),
        body: travelBody({ action: "depart", pace, navigator }),
      })
      const out = res.ok ? await res.json() : null
      if (out?.day) setMarch((m) => ({ ...m, ...out.day, navigator: out.navigator ?? null }))
    } catch {
      /* the walk still happens; the day just will not count */
    }
    setConfirmNode(null)
    initiatedRef.current = true
    forcingRef.current = false
    await dmAction("move", dest.node_key)
  }

  /** Miles along a route of node ids, summed over the road edges that join them. */
  function routeMiles(ids: string[]): number {
    let m = 0
    for (let i = 0; i + 1 < ids.length; i++) {
      const e = edges.find(
        (x) => (x.from_node_id === ids[i] && x.to_node_id === ids[i + 1]) || (x.from_node_id === ids[i + 1] && x.to_node_id === ids[i]),
      )
      m += Number(e?.distance_miles) || 0
    }
    return m
  }

  // ---------- data ----------
  useEffect(() => {
    const supabase = createClient()
    let alive = true
    async function load() {
      // Who leads, for every browser. Players also take the day's hours and
      // pace from here - the hover card prices a leg with them.
      try {
        const lr = await fetch("/api/travel/leader", { cache: "no-store" })
        if (lr.ok) {
          const li = (await lr.json()) as LeadInfo
          if (!alive) return
          setLead(li)
          if (!dmKey && li.day) setMarch((m) => ({ ...m, pace: li.day.pace, hours_today: li.day.hours_today, day_miles: li.day.day_miles }))
        }
      } catch {
        /* no leader info: the DM's road controls still work */
      }
      if (dmKey) {
        try {
          const res = await fetch("/api/travel", { headers: dmHeaders(), cache: "no-store" })
          if (res.ok) {
            const g = await res.json()
            if (!alive) return
            setNodes((g.nodes ?? []) as NodeRow[])
            setEdges((g.edges ?? []) as EdgeRow[])
            setParty((g.party as PartyRow) ?? null)
            setVessels((g.vessels ?? []) as VesselRow[])
            if (g.march) {
              setMarch((m) => ({ ...m, ...g.march }))
              setPace((p) => (p === "normal" && g.march.pace ? g.march.pace : p))
            }
            if (Array.isArray(g.guides)) {
              setGuides(g.guides as Guide[])
              // Default the picker to whoever led last time.
              const led = g.march?.navigator?.name
              const hit = led ? (g.guides as Guide[]).find((x) => x.name === led) : null
              if (hit) setNavSel((s) => (s === "none" ? `guide:${hit.key}` : s))
            }
            // Player characters, for the navigator picker. Read-only, names only.
            const { data: chars } = await supabase.from("characters").select("id,name").order("name")
            if (!alive) return
            if (chars) setPcs(chars as { id: string; name: string }[])
            setLoaded(true)
            return
          }
        } catch {
          /* fall through to the player path */
        }
      }
      const [n, e, p, v] = await Promise.all([
        // Players read the masked view: discovered rows, names only once learned.
        supabase.from("travel_nodes_player").select("id,node_key,name,node_type,edge_id,edge_position,description,metadata,discovered_at,name_known"),
        supabase.from("travel_edges").select("id,edge_key,from_node_id,to_node_id,distance_miles,danger_level,metadata"),
        supabase.from("party_position").select("campaign_run_id,node_id,arrived_at").limit(1),
        supabase.from("party_vessels").select("id,kind,name,hp_current,hp_max,crew,passengers,speed_mph,lost_at").is("lost_at", null),
      ])
      if (!alive) return
      if (v.data) setVessels(v.data as VesselRow[])
      if (n.data) setNodes(n.data as NodeRow[])
      if (e.data) setEdges(e.data as EdgeRow[])
      if (p.data) setParty((p.data[0] as PartyRow) ?? null)
      setLoaded(true)
    }
    load()
    const t = setInterval(load, POLL_MS)
    // realtime is a bonus; polling is the guarantee
    const ch = supabase
      .channel("underdark-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "party_position" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "travel_nodes" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "travel_edges" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "party_vessels" }, load)
      .subscribe()
    return () => {
      alive = false
      clearInterval(t)
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmKey, refresh])

  const byId = new Map(nodes.map((n) => [n.id, n]))

  // The walk's way out meets the graph (see `arrival` above).
  useEffect(() => {
    if (!arrival || !loaded || !party || leftRef.current) return
    const here = byId.get(party.node_id)
    if (!here || here.node_key !== arrival.from) return // the party is not where the walk says; the banner alone
    if (!canLead) return // a player who does not lead sees the banner; the leader's (or DM's) browser arms the march
    leftRef.current = true
    // Tell the state machine the party is back on the overworld. Best-effort: a refusal is logged, not shown —
    // the departure sheet's own "depart" is what moves them, and it does not read game_context.
    void fetch("/api/travel", { method: "POST", headers: travelHeaders(), body: travelBody({ action: "leave", node_key: here.node_key }) })
      .then(async (r) => { if (!r.ok) console.warn("[map] leave not recorded:", (await r.json().catch(() => null))?.error) })
      .catch(() => {})
    const roads = roadsOpenedBy(arrival, here, nodes, edges)
    if (roads.length === 1) setConfirmNode(roads[0].node as NodeRow)
    else if (roads.length > 1) setRoadChoice(roads)
    try { window.history.replaceState(null, "", window.location.pathname) } catch { /* the query string stays; leftRef still holds */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival, loaded, party?.node_id, nodes.length, edges.length, canLead])

  // Travel follows the ROADS painted on the map: only is_road edges are walkable.
  // The 15 city-pair edges carry the module's canonical days/miles for display
  // (is_route_summary) and are never used as geometry — that is what used to
  // make the party sail across open rock.
  function routeBetween(fromId: string, toId: string): string[] {
    // Water is not walkable. Sail edges only open up once the party has a boat.
    const roads = edges.filter((e) => e.metadata?.is_road && (e.metadata?.mode !== "sail" || hasBoat))
    const usable = roads
    const adj = new Map<string, { to: string; w: number }[]>()
    for (const e of usable) {
      const w = Number(e.distance_miles) || 1
      if (!adj.has(e.from_node_id)) adj.set(e.from_node_id, [])
      if (!adj.has(e.to_node_id)) adj.set(e.to_node_id, [])
      adj.get(e.from_node_id)!.push({ to: e.to_node_id, w })
      adj.get(e.to_node_id)!.push({ to: e.from_node_id, w })
    }
    const dist = new Map([[fromId, 0]])
    const prevOf = new Map<string, string>()
    const done = new Set<string>()
    for (;;) {
      let cur: string | null = null
      let best = Infinity
      for (const [k, v] of dist) if (!done.has(k) && v < best) ((best = v), (cur = k))
      if (!cur || cur === toId) break
      done.add(cur)
      for (const nx of adj.get(cur) ?? []) {
        const nd = best + nx.w
        if (nd < (dist.get(nx.to) ?? Infinity)) {
          dist.set(nx.to, nd)
          prevOf.set(nx.to, cur)
        }
      }
    }
    if (!dist.has(toId)) return []   // no road leads there — we do NOT fly
    const out = [toId]
    while (out[0] !== fromId) {
      const p = prevOf.get(out[0])
      if (!p) break
      out.unshift(p)
    }
    return out
  }

  /**
   * The party has reached marker `n` on its walk. Ask the server what waits here (only the browser that set
   * the party walking, and only if it leads), play the beat, open whatever cards the reply carries. Resolves
   * when the party may walk on: at once, or when the halt card's Continue is pressed.
   */
  async function reachNode(n: NodeRow): Promise<void> {
    setArrivedAt(n)
    // Ask the server what waits here. Only the browser that set the party
    // walking asks (the DM's, or the leader's) — a player watching must
    // never be the one rolling the party's encounters.
    if (!initiatedRef.current || !canLeadRef.current) return
    let out: any = null
    try {
      const res = await fetch("/api/travel", {
        method: "POST",
        headers: travelHeaders(),
        body: travelBody({ action: "arrive", node_key: n.node_key, from_node_key: lastNodeKey.current, ...(forcingRef.current ? { force: true } : {}) }),
      })
      out = res.ok ? await res.json() : null
    } catch {
      // The tunnel does not care that the network blinked. A failed check
      // lets them walk on rather than freezing the march forever.
      out = null
    }
    lastNodeKey.current = n.node_key
    if (out?.day) setMarch((m) => ({ ...m, ...out.day }))
    // THE ARRIVAL BEAT (Sam, 2026-10-14): the cue for the kind of node,
    // then the passive roll's sound either way, the chip, and Malachar's
    // line only when something happened (it is also in `dialogue`, so
    // every browser reads it; this one hears it at once).
    if (out?.stinger) playStinger(out.stinger as StingerCue)
    // A great place opens its entrance; a node with authored options offers
    // them. Both are authored — nothing appears here that Sam did not make.
    if (out?.entrance) setEntrance({ node: n, info: out.entrance as EntranceInfo })
    if (Array.isArray(out?.options) && out.options.length) setOptions({ node: n, list: out.options as OfferedOption[] })
    if (out?.notice) playStinger(out.notice.noticed ? "noticed" : "missed", 900)
    if (out?.notice || out?.line) {
      setBeat({ chip: out.notice?.chip ?? null, noticed: out.notice?.noticed ?? null, line: out.line ?? null })
      if (beatTimer.current) clearTimeout(beatTimer.current)
      beatTimer.current = setTimeout(() => setBeat(null), out.line ? 14000 : 6000)
    }
    // Checks that earned film (lib/check-cue.ts). The stage rolls it if there is any;
    // Malachar's line rides along as the caption.
    if (Array.isArray(out?.cues)) {
      for (const c of out.cues as { state: string; scope: "solo" | "party" }[]) {
        emitCheckCue({ state: c.state, scope: c.scope, location: n.name ?? n.node_key, caption: out.line ?? undefined })
      }
    }
    if (typeof out?.line === "string" && out.line) {
      void fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: out.line, voice: "onyx" }) })
        .then(async (r) => { if (r.ok) speakBlob("dm", await r.blob(), { speaker: "Malachar" }) })
        .catch(() => {})
    }
    if (out?.halt) {
      setHalt({ kind: out.kind, title: out.title, body: out.body, rolls: out.rolls ?? [], source: out.source })
      // Picked up again by the Continue button, from exactly this step.
      await new Promise<void>((resolve) => {
        resumeRef.current = () => {
          setHalt(null)
          resolve()
        }
      })
    }
  }
  /** The walk is setting out from `start`: the first arrive reports where it came from. */
  function walkStarted(startKey: string) {
    lastNodeKey.current = startKey
  }

  /** The halt card's buttons: walk on (or break camp), or push on into a forced march. */
  function continueMarch(force: boolean) {
    const go = resumeRef.current
    resumeRef.current = null
    const wasCamp = halt?.kind === "camp"
    forcingRef.current = force
    void fetch("/api/travel", {
      method: "POST",
      headers: travelHeaders(),
      body: travelBody({ action: "continue", node_key: arrivedAt?.node_key ?? "", ...(force ? { force: true } : {}) }),
    }).catch(() => {})
    // Breaking camp starts a new day on the server; mirror it here
    // so the HUD does not show yesterday's eight hours until the
    // next arrival answers.
    if (wasCamp && !force) setMarch((m) => ({ ...m, hours_today: 0, navigation_due: true }))
    if (go) go()
    else setHalt(null)
  }

  return {
    nodes, edges, party, loaded, dmKey, setRefresh,
    confirmNode, setConfirmNode, arrivedAt, setArrivedAt,
    halt, setHalt, continueMarch, reachNode, walkStarted,
    vessels, hasBoat, march, setMarch, guides, pcs,
    pace, setPace, navSel, setNavSel, pcFamiliar, setPcFamiliar, pcHasMap, setPcHasMap,
    me, lead, canLead, hoverNode, setHoverNode,
    beat, options, setOptions, chosen, setChosen, entrance, setEntrance, entering,
    arrival, roadChoice, setRoadChoice,
    travelHeaders, travelBody, boatAction, dmAction, chooseOption, enterPlace, leadAction, setOut,
    routeMiles, routeBetween, byId,
  }
}
