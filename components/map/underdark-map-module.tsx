"use client"

// THE MAP MODULE AS THE TRAVEL MAP (Sam, 2026-11-10: "the artifact I like").
//
// The picture is Sam's "Underdark World Map" artifact, imported unchanged into public/underdark-map
// (scripts/underdark-map/import_artifact.py) and shown here in a frame, the way /velkynvelve shows the
// Underwalk. The RULES are the game's: this component owns the shared march (use-travel.ts) exactly as the
// 2D map and the diorama do, and talks to the page over postMessage. The page animates; it decides nothing.
//
//   page -> here   aop:map-ready · aop:map-pick{k} · aop:map-hover{k} · aop:map-reached{k} · aop:map-enter{k}
//   here -> page   aop:map-state{…} · aop:map-leg{a,b,last} · aop:map-place{k}
//
// Sam's three rulings of 2026-11-10 live here and in the page's GAME MODE:
//   * the leader's own pixel figure walks the map (lib/travel/map-hero.ts);
//   * a player who is not the DM gets the map, the place card, zoom and sound, and nothing else: the
//     DM panels below the map are the DM's;
//   * fog of war is the default for everyone; lifting it is a DM-only switch inside the page.

import { useEffect, useRef, useState } from "react"
import { useTravel, type NodeRow } from "./use-travel"
import { TravelCards, TravelPanels } from "./travel-cards"
import { entranceFor, WALKABLE_SCENES } from "@/lib/travel/entrance"
import { mapHeroFromManifest, mapHeroSlug, type MapHero } from "@/lib/travel/map-hero"

const PAGE = "/underdark-map/index.html?game=1"

export default function UnderdarkMapModule() {
  const travel = useTravel()
  const { nodes, edges, party, loaded, dmKey, byId, routeBetween, reachNode, walkStarted, setArrivedAt, canLead, setConfirmNode, setHoverNode, halt, hasBoat, lead, enterPlace } = travel
  const frame = useRef<HTMLIFrameElement | null>(null)
  const [ready, setReady] = useState(0) // counts the page's "ready" calls: it reloads itself when the DM moves a stop
  const [hero, setHero] = useState<MapHero | null>(null)

  // Everything the message handler needs, kept fresh without re-subscribing.
  const live = useRef({ nodes, party, byId, canLead, halt, setConfirmNode, setHoverNode, enterPlace })
  live.current = { nodes, party, byId, canLead, halt, setConfirmNode, setHoverNode, enterPlace }

  const send = (m: Record<string, unknown>) => {
    try { frame.current?.contentWindow?.postMessage(m, window.location.origin) } catch { /* the frame is gone */ }
  }

  // The leader's sprite. Until someone leads, or while the manifest loads, the page keeps its own figure.
  const leaderId = lead?.leader ?? null
  useEffect(() => {
    let alive = true
    const slug = mapHeroSlug(leaderId)
    fetch(`/sprites/${slug}/sprite.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => { if (alive) setHero(mapHeroFromManifest(slug, m)) })
      .catch(() => { if (alive) setHero(null) })
    return () => { alive = false }
  }, [leaderId])

  // Where the page's figure stands. It trails `party` while a walk is being shown.
  const shown = useRef<string | null>(null)
  const walk = useRef<{ keys: string[]; i: number; ids: string[] } | null>(null)

  // STATE -> PAGE. Sent on the page's "ready" and whenever anything it draws from changes.
  const stateKey = JSON.stringify([
    nodes.map((n) => [n.node_key, n.name, n.metadata?.map_x, n.metadata?.map_y, !!n.discovered_at, n.name_known, (n as NodeRow & { name_known_at?: string | null }).name_known_at ?? null]),
    edges.map((e) => [e.id, e.metadata?.is_road, e.metadata?.mode]),
    !!dmKey, canLead, hasBoat, hero?.walk.src ?? null,
  ])
  useEffect(() => {
    if (!ready || !loaded) return
    const keyOf = new Map(nodes.map((n) => [n.id, n.node_key]))
    const here = party ? keyOf.get(party.node_id) ?? null : null
    if (shown.current == null) shown.current = here
    send({
      type: "aop:map-state",
      nodes: nodes.map((n) => ({
        k: n.node_key,
        // the player view already nulls a name the party has not learned; the DM's rows carry every name
        n: n.name,
        t: n.node_type,
        x: Number(n.metadata?.map_x),
        y: Number(n.metadata?.map_y),
        // players only ever receive discovered rows (travel_nodes_player)
        d: dmKey ? !!n.discovered_at : true,
        // the DM's rows say when the party learned a name (name_known_at); the player view says whether (name_known)
        nk: dmKey ? !!(n as NodeRow & { name_known_at?: string | null }).name_known_at : n.name_known !== false && !!n.name,
      })),
      edges: edges
        .filter((e) => keyOf.has(e.from_node_id) && keyOf.has(e.to_node_id))
        .map((e) => ({ a: keyOf.get(e.from_node_id), b: keyOf.get(e.to_node_id), m: e.metadata?.mode ?? null, mi: Number(e.distance_miles) || 1, road: e.metadata?.is_road === true })),
      party: shown.current ?? here,
      dm: !!dmKey,
      lead: canLead,
      boat: hasBoat,
      hero,
      enterable: Object.keys(WALKABLE_SCENES),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, loaded, stateKey])

  // PAGE -> HERE.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || ev.source !== frame.current?.contentWindow) return
      const m = ev.data as { type?: string; k?: string | null } | null
      if (!m || typeof m.type !== "string") return
      const L = live.current
      const nodeOf = (k: string | null | undefined) => (k ? L.nodes.find((n) => n.node_key === k) ?? null : null)
      if (m.type === "aop:map-ready") {
        shown.current = null
        walk.current = null
        setReady((r) => r + 1)
      } else if (m.type === "aop:map-pick") {
        // the same question the diorama asks: the departure sheet confirms, the server moves the party
        const n = nodeOf(m.k)
        if (!n || !L.canLead || !L.party || L.party.node_id === n.id || L.halt) return
        L.setConfirmNode(n)
      } else if (m.type === "aop:map-hover") {
        L.setHoverNode(nodeOf(m.k))
      } else if (m.type === "aop:map-reached") {
        void legDone(m.k ?? null)
      } else if (m.type === "aop:map-enter") {
        const n = nodeOf(m.k)
        if (!n || !L.canLead) return
        const info = entranceFor(n, process.env.NEXT_PUBLIC_SUPABASE_URL || "")
        if (info?.scene) void L.enterPlace(n.node_key, info.scene, info.plate, info.name)
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // THE WALK. The party's node changed (this browser's leader set out, or another browser's did): show every
  // leg of the road between, one at a time, and ask the march what waits at each marker before the next.
  const prevParty = useRef<string | null>(null)
  useEffect(() => {
    if (!ready || !loaded || !party) return
    if (prevParty.current == null) { prevParty.current = party.node_id; return }
    if (prevParty.current === party.node_id) return
    const from = prevParty.current
    prevParty.current = party.node_id
    const here = byId.get(party.node_id) ?? null
    // The party stopped where the figure already stands (a long rest at a marker part-way along the road):
    // the walk is over, and there is nothing to draw.
    if (here && shown.current === here.node_key) { walk.current = null; return }
    const route = routeBetween(from, party.node_id)
    const keys = route.map((id) => byId.get(id)?.node_key).filter((k): k is string => !!k)
    if (route.length < 2 || keys.length !== route.length) {
      // no road (or no boat) between: the party is where the DM put them; no journey is drawn that does not exist
      walk.current = null
      shown.current = here?.node_key ?? null
      setArrivedAt(here)
      if (here) send({ type: "aop:map-place", k: here.node_key })
      return
    }
    walkStarted(keys[0])
    walk.current = { keys, ids: route, i: 0 }
    send({ type: "aop:map-leg", a: keys[0], b: keys[1], last: keys.length === 2 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, loaded, party?.node_id])

  async function legDone(k: string | null) {
    const w = walk.current
    if (!w || !k || w.keys[w.i + 1] !== k) return
    w.i += 1
    shown.current = k
    const n: NodeRow | undefined = live.current.byId.get(w.ids[w.i])
    // what waits at this marker is the shared march's to say; it resolves when the party may walk on
    if (n) await reachNode(n)
    if (walk.current !== w) return // a newer walk replaced this one while the card was up
    if (w.i + 1 >= w.keys.length) { walk.current = null; return }
    send({ type: "aop:map-leg", a: w.keys[w.i], b: w.keys[w.i + 1], last: w.i + 2 === w.keys.length })
  }

  return (
    <div className="bg-[#0b0714] text-[#e8e0f0] p-3 font-mono">
      {/* the map and its cards: the cards are the shared march's own (travel-cards.tsx), laid over the page.
          The painted entrance is the page's (its cinematic, its plate, its Enter), so the card version stays shut. */}
      <div className="relative rounded-lg overflow-hidden border-[3px] border-[#2b2040] bg-[#05030a]" style={{ height: dmKey ? "calc(100vh - 150px)" : "calc(100vh - 84px)", minHeight: 320 }}>
        <iframe ref={frame} src={PAGE} title="The Underdark" className="absolute inset-0 h-full w-full border-0" allow="autoplay" />
        <TravelCards t={{ ...travel, entrance: null }} />
      </div>
      {dmKey ? <TravelPanels t={travel} /> : null}
    </div>
  )
}
