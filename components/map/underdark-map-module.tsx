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
// THE MARCHING LINE (Sam, 2026-11-12): the state also carries `followers`, the sprites of every other seated
// hero in the order they sat down. The page walks them in file behind the leader; they decide nothing.
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
import { LONG_REST_KEY } from "@/lib/travel/standing"
import { RUINS_HREF } from "@/lib/travel/battle"
import { PIXEL_ROAD_SWITCH, pixelRoadFor, pixelRoadHref } from "@/lib/travel/pixel-road"
import { roadRemarks } from "@/lib/travel/road-remarks"
import { d as die, rollRoadTraps, seededRand, trapSeedKey, trapSig } from "@/lib/travel/road-traps"
import { PACES } from "@/lib/travel/march"
import { dmHeaders } from "@/lib/dm-key"
import { MAP_LAIRS, MAP_SPRITE_HERO_IDS, mapFollowerIds, mapHeroFromManifest, mapHeroSlug, type MapHero } from "@/lib/travel/map-hero"

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

  // The line behind the leader: the other seated heroes, each on their own sprite. A sheet that fails to load
  // leaves that hero out of the line; it never holds the map up.
  const [followers, setFollowers] = useState<MapHero[]>([])
  // THE DM'S TEST LINE (Sam, 2026-11-12: "I need a way to do this administratively"). A switch only the DM has:
  // march every hero who owns a sprite, whoever is seated. It changes this browser's picture and nothing else:
  // nothing is written, no seat is taken, and a player's browser never reads it.
  const [testLine, setTestLine] = useState(false)
  useEffect(() => { try { setTestLine(localStorage.getItem("aop:map-line-test") === "1") } catch { /* storage blocked */ } }, [])
  const flipTestLine = () => setTestLine((v) => { try { localStorage.setItem("aop:map-line-test", v ? "0" : "1") } catch { /* storage blocked */ } return !v })
  const allHeroes = !!dmKey && testLine
  const followerKey = mapFollowerIds(leaderId, allHeroes ? MAP_SPRITE_HERO_IDS : lead?.seated).join(",")
  useEffect(() => {
    let alive = true
    const slugs = (followerKey ? followerKey.split(",") : []).map((id) => mapHeroSlug(id))
    Promise.all(
      slugs.map((slug) =>
        fetch(`/sprites/${slug}/sprite.json`)
          .then((r) => (r.ok ? r.json() : null))
          .then((m) => mapHeroFromManifest(slug, m))
          .catch(() => null),
      ),
    ).then((list) => { if (alive) setFollowers(list.filter((h): h is MapHero => !!h)) })
    return () => { alive = false }
  }, [followerKey])

  // What looms at a lair (lib/travel/map-hero.ts, MAP_LAIRS): the creature's own sprite, sent with its stop.
  const [lairs, setLairs] = useState<{ k: string; fig: MapHero }[]>([])
  useEffect(() => {
    let alive = true
    Promise.all(
      Object.entries(MAP_LAIRS).map(([k, slug]) =>
        fetch(`/sprites/${slug}/sprite.json`)
          .then((r) => (r.ok ? r.json() : null))
          .then((m) => { const fig = mapHeroFromManifest(slug, m); return fig ? { k, fig } : null })
          .catch(() => null),
      ),
    ).then((list) => { if (alive) setLairs(list.filter((l): l is { k: string; fig: MapHero } => !!l)) })
    return () => { alive = false }
  }, [])

  // ---------- THE PIXEL ROAD (Sam, 2026-11-23: "Pixel road part of the real march") ----------
  // Before the nodal map moves the party along a leg, the browser that leads walks that leg on the pixel road, laid
  // over the map. Reaching its far end fades back to the nodal map, which then shows the move and rolls what waits at
  // the marker; the next leg fades back into the pixel road. Everyone else sees the nodal map as before. A DM switch
  // under the map turns it off for this browser, and SKIP THE WALK is always on the overlay, so no march can stick.
  const roadFrame = useRef<HTMLIFrameElement | null>(null)
  const roadDone = useRef<(() => void) | null>(null)
  const [roadSrc, setRoadSrc] = useState<string | null>(null)
  const [roadOn, setRoadOn] = useState(false)
  const [pixelRoad, setPixelRoad] = useState(true)
  useEffect(() => { try { setPixelRoad(localStorage.getItem(PIXEL_ROAD_SWITCH) !== "0") } catch { /* storage blocked */ } }, [])
  const flipPixelRoad = () => setPixelRoad((v) => { try { localStorage.setItem(PIXEL_ROAD_SWITCH, v ? "0" : "1") } catch { /* storage blocked */ } return !v })
  // who walks beside the heroes: the company at camp is the company on the road (app/api/camp/roster)
  const [company, setCompany] = useState<{ slug: string; pc: boolean; name: string; id?: string | null; pp?: number | null; strMod?: number; strSave?: number; ath?: number; hp?: number; hpMax?: number }[]>([])
  useEffect(() => {
    let alive = true
    fetch("/api/camp/roster").then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && Array.isArray(j?.members)) setCompany(j.members) }).catch(() => {})
    return () => { alive = false }
  }, [party?.node_id])
  const roadLive = useRef({ leaderId: leaderId as string | null, pixelRoad, company, hours: 0, heroSlug: "", followerSlugs: [] as string[], edges, dm: !!dmKey, initiated: travel.initiated, shortRest: travel.shortRest, shortRestLine: travel.shortRestLine, chooseOption: travel.chooseOption, reachNode, pace: "normal" as string, me: travel.me })
  roadLive.current = { leaderId, pixelRoad, company, hours: Number(travel.march?.hours_today) || 0, heroSlug: mapHeroSlug(leaderId), followerSlugs: (followerKey ? followerKey.split(",") : []).map((id) => mapHeroSlug(id)), edges, dm: !!dmKey, initiated: travel.initiated, shortRest: travel.shortRest, shortRestLine: travel.shortRestLine, chooseOption: travel.chooseOption, reachNode, pace: String(travel.march?.pace ?? "normal"), me: travel.me }
  // WHAT WAITS AHEAD, MET ON THE ROAD (Sam, 2026-11-23: "make sure we are adding the encounters to this"). The leg this
  // stretch walks, and the marker the road asked about early: a little past halfway the road says it is near, and
  // the marker's dice are rolled then (the same reachNode the nodal map would call), so whatever waits there is met
  // on the pixel road. legDone then finds the marker already reached and does not roll it twice.
  const roadLeg = useRef<{ a: string; b: string; seed: string } | null>(null)
  const met = useRef<{ key: string; done: Promise<void> } | null>(null)
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
  const youName = () => { const R = roadLive.current; return (R.company.find((m) => m.pc && m.slug === R.heroSlug)?.name ?? "").split(/\s+/)[0] ?? "" }
  async function walkTheRoad(a: string, b: string): Promise<void> {
    const L = live.current, R = roadLive.current
    if (!R.pixelRoad || !L.canLead || !R.initiated()) return
    const na = L.nodes.find((n) => n.node_key === a), nb = L.nodes.find((n) => n.node_key === b)
    if (!na || !nb) return
    const e = R.edges.find((x) => (x.from_node_id === na.id && x.to_node_id === nb.id) || (x.from_node_id === nb.id && x.to_node_id === na.id))
    const road = pixelRoadFor({ a, b, mode: (e?.metadata?.mode as string | undefined) ?? null })
    if (!road) return
    const npcs = R.company.filter((m) => !m.pc).map((m) => m.slug)
    roadLeg.current = { a, b, seed: trapSeedKey(a, b) }
    setRoadSrc(pixelRoadHref({ road, line: [R.heroSlug, ...R.followerSlugs], npcs, from: na.name ?? "", to: nb.name ?? "" }))
    await sleep(60)
    setRoadOn(true)
    await new Promise<void>((res) => { roadDone.current = res })
    roadDone.current = null
    roadLeg.current = null
    setRoadOn(false)          // fade back to the nodal map, which now shows the move
    await sleep(700)
    setRoadSrc(null)
  }
  const endRoad = () => roadDone.current?.()
  useEffect(() => {
    const onRoad = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || ev.source !== roadFrame.current?.contentWindow) return
      const m = ev.data as { type?: string; kind?: string } | null
      if (!m || typeof m.type !== "string") return
      const post = (x: Record<string, unknown>) => { try { roadFrame.current?.contentWindow?.postMessage(x, window.location.origin) } catch { /* gone */ } }
      const R = roadLive.current
      if (m.type === "aop:road-ready") {
        // THE HIDDEN TRAPS on this stretch (lib/travel/road-traps.ts, SRD 5.1 Traps): rolled here, with who in the
        // company notices each in passing (passive Perception, the pace's penalty applied), and handed to the road.
        {
          const penalty = (PACES as Record<string, { perceptionPenalty: number }>)[R.pace]?.perceptionPenalty ?? 0
          const party = R.company.map((c) => ({ slug: c.slug, name: c.name, pp: c.pp ?? null }))
          const leg0 = roadLeg.current, rnd = leg0 ? seededRand(leg0.seed) : Math.random   // the same dice on every leading screen
          post({ type: "aop:road-traps", traps: rollRoadTraps(party, penalty, (n) => die(n, rnd)), party: R.company.map((c) => ({ slug: c.slug, name: c.name, strMod: c.strMod ?? 0, strSave: c.strSave ?? 0, ath: c.ath ?? 0, hp: c.hp ?? null })) })
        }
        // the inset: the markers the party knows (players only ever hold discovered rows), the roads between, this leg
        const L = live.current, leg = roadLeg.current
        if (leg) {
          const known = L.nodes.filter((n) => (R.dm ? !!n.discovered_at : true) && Number.isFinite(Number(n.metadata?.map_x)) && Number.isFinite(Number(n.metadata?.map_y)))
          const keyOf = new Map(known.map((n) => [n.id, n.node_key]))
          post({
            type: "aop:road-map", a: leg.a, b: leg.b,
            nodes: known.map((n) => ({ k: n.node_key, x: Number(n.metadata?.map_x), y: Number(n.metadata?.map_y) })),
            edges: R.edges.filter((e) => keyOf.has(e.from_node_id) && keyOf.has(e.to_node_id)).map((e) => ({ a: keyOf.get(e.from_node_id), b: keyOf.get(e.to_node_id) })),
          })
        }
        // what each of them calls the leader ("Hey Kenta / hey elf / hey Sorcerer": /api/npc-address), then the deal
        const npcs = R.company.filter((c) => !c.pc)
        const deal = (call: Record<string, string>) => post({ type: "aop:road-remarks", listener: youName(), remarks: roadRemarks({ companions: npcs.map((c) => c.slug), hoursToday: R.hours, you: (slug) => call[npcs.find((c) => c.slug === slug)?.name ?? ""] || youName(), rand: Math.random }) })
        if (!R.leaderId || !npcs.length) deal({})
        else fetch("/api/npc-address", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterId: R.leaderId, npcNames: npcs.map((c) => c.name) }) })
          .then((r) => (r.ok ? r.json() : null)).then((j) => deal((j?.addresses as Record<string, string>) ?? {})).catch(() => deal({}))
      } else if (m.type === "aop:road-near") {
        const leg = roadLeg.current, n = leg ? live.current.nodes.find((x) => x.node_key === leg.b) : null
        if (n && met.current?.key !== n.node_key) met.current = { key: n.node_key, done: R.reachNode(n) }
      } else if (m.type === "aop:road-hazard") {
        // a pit took someone: the damage goes on their sheet, once (/api/walk-hazard, the director's own route)
        const x = m as unknown as { slug?: string; hits?: { type: string; amount: number }[] }
        const c = R.company.find((q) => q.slug === x.slug)
        const hits = (x.hits ?? []).filter((h) => h.amount > 0).map((h) => ({ characterId: c?.id, amount: Math.floor(h.amount), type: h.type }))
        if (c?.id && hits.length) {
          void fetch("/api/walk-hazard", {
            method: "POST",
            headers: R.dm ? { ...dmHeaders(), "Content-Type": "application/json" } : { "Content-Type": "application/json" },
            body: JSON.stringify({ sig: roadLeg.current ? trapSig(roadLeg.current.seed, c.slug, String((m as { title?: string }).title ?? "")) : `ev-trap${Date.now().toString(36)}`, plate: "pixel-road", hits, claimId: R.me.characterId, claimToken: R.me.claimToken }),
          }).catch(() => {})
        }
      } else if (m.type === "aop:road-done") {
        endRoad()
      } else if (m.type === "aop:road-ruins") {
        // THE RUINS' DOOR ON THE ROAD (road-03's north cave): the march stops walking this leg and the tab goes into the
        // six painted rooms, exactly as the map's own Ruins card sends it (RUINS_HREF); their way out comes back here.
        walk.current = null
        endRoad()
        window.location.href = RUINS_HREF
      } else if (m.type === "aop:road-rest" && m.kind === "short") {
        // the real hour: Hit Dice, the clock, the one-in-six risk (use-travel.ts shortRest); its line is read back to the road
        void R.shortRest().then(async () => { await sleep(80); post({ type: "aop:road-say", name: "Short rest", line: roadLive.current.shortRestLine ?? "An hour passes." }) })
      } else if (m.type === "aop:road-rest" && m.kind === "long") {
        // the march stops at the marker last reached and the table goes to the Camp Module, as REST AT CAMP does
        const w = walk.current
        const at = w ? w.keys[w.i] : shown.current
        void sleep(8600).then(() => { walk.current = null; endRoad(); if (at) void R.chooseOption(at, LONG_REST_KEY) })
      }
    }
    window.addEventListener("message", onRoad)
    return () => window.removeEventListener("message", onRoad)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A card the marker put up while the road is showing (an encounter, a challenge, a choice): the road halts the party
  // and brings out the creatures the dice named, and a moment later the card comes up over the road.
  const stopped = !!(travel.halt || travel.options || travel.chosen)
  const [lift, setLift] = useState(false)
  const meetSent = useRef(false)
  useEffect(() => {
    const post = (x: Record<string, unknown>) => { try { roadFrame.current?.contentWindow?.postMessage(x, window.location.origin) } catch { /* gone */ } }
    if (stopped && roadOn && !meetSent.current) {
      meetSent.current = true
      const foes = travel.halt?.battle?.foes ?? []
      post({ type: "aop:road-meet", kind: travel.halt?.kind ?? "stop", foes })
      const t = setTimeout(() => setLift(true), foes.length ? 2600 : 500)
      return () => clearTimeout(t)
    }
    if (!stopped && meetSent.current) { meetSent.current = false; setLift(false); post({ type: "aop:road-clear" }) }
    if (!roadOn) { meetSent.current = false; setLift(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopped, roadOn])

  // Where the page's figure stands. It trails `party` while a walk is being shown.
  const shown = useRef<string | null>(null)
  const walk = useRef<{ keys: string[]; i: number; ids: string[] } | null>(null)

  // STATE -> PAGE. Sent on the page's "ready" and whenever anything it draws from changes.
  const stateKey = JSON.stringify([
    nodes.map((n) => [n.node_key, n.name, n.metadata?.map_x, n.metadata?.map_y, !!n.discovered_at, n.name_known, (n as NodeRow & { name_known_at?: string | null }).name_known_at ?? null]),
    edges.map((e) => [e.id, e.metadata?.is_road, e.metadata?.mode]),
    !!dmKey, canLead, hasBoat, hero?.walk.src ?? null, followers.map((f) => f.walk.src), lairs.map((l) => l.k),
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
      followers,
      lairs,
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
    met.current = null
    const w = (walk.current = { keys, ids: route, i: 0 })
    // the leg is walked on the pixel road first (the leading browser only); then the nodal map shows it
    void walkTheRoad(keys[0], keys[1]).then(() => { if (walk.current === w) send({ type: "aop:map-leg", a: keys[0], b: keys[1], last: keys.length === 2 }) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, loaded, party?.node_id])

  async function legDone(k: string | null) {
    const w = walk.current
    if (!w || !k || w.keys[w.i + 1] !== k) return
    w.i += 1
    shown.current = k
    const n: NodeRow | undefined = live.current.byId.get(w.ids[w.i])
    // what waits at this marker is the shared march's to say; it resolves when the party may walk on. The pixel road
    // may already have asked (the marker met on the road): then wait on that answer instead of rolling it again.
    const early = met.current?.key === k ? met.current : null
    if (early) { met.current = null; await early.done }
    else if (n) await reachNode(n)
    if (walk.current !== w) return // a newer walk replaced this one while the card was up
    if (w.i + 1 >= w.keys.length) { walk.current = null; return }
    await walkTheRoad(w.keys[w.i], w.keys[w.i + 1])   // fade back into the pixel road for the next leg
    if (walk.current !== w) return
    send({ type: "aop:map-leg", a: w.keys[w.i], b: w.keys[w.i + 1], last: w.i + 2 === w.keys.length })
  }

  return (
    <div className="bg-[#0b0714] text-[#e8e0f0] p-3 font-mono">
      {/* the map and its cards: the cards are the shared march's own (travel-cards.tsx), laid over the page.
          The painted entrance is the page's (its cinematic, its plate, its Enter), so the card version stays shut. */}
      <div className="relative rounded-lg overflow-hidden border-[3px] border-[#2b2040] bg-[#05030a]" style={{ height: dmKey ? "calc(100vh - 90px)" : "calc(100vh - 24px)", minHeight: 320 }}>
        <iframe ref={frame} src={PAGE} title="The Underdark" className="absolute inset-0 h-full w-full border-0" allow="autoplay" />
        {/* Over the pixel road too, once the road has shown what the marker put in the way (`lift`). */}
        <div className={`absolute inset-0 pointer-events-none [&>*]:pointer-events-auto ${lift ? "z-30" : ""}`}>
          <TravelCards t={{ ...travel, entrance: null }} />
        </div>
        {roadSrc ? (
          <div className="absolute inset-0 z-20 bg-[#05030a] transition-opacity duration-700" style={{ opacity: roadOn ? 1 : 0, pointerEvents: roadOn ? "auto" : "none" }}>
            <iframe ref={roadFrame} src={roadSrc} title="The road" className="absolute inset-0 h-full w-full border-0" allow="autoplay" />
            <button type="button" onClick={endRoad} className="absolute right-3 top-3 rounded border border-[#3a2c56] bg-[#120b1ecc] px-3 py-1.5 text-[10px] tracking-[.2em] text-[#9a8fb0] hover:border-[#f5c34d] hover:text-[#f5c34d]">
              SKIP THE WALK
            </button>
          </div>
        ) : null}
      </div>
      {dmKey ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={flipTestLine}
            aria-pressed={allHeroes}
            className={`px-3 py-2 rounded border-2 tracking-wider ${allHeroes ? "bg-[#f5c34d] text-[#120b1e] border-[#f5c34d]" : "bg-[#221936] text-[#9a8fb0] border-[#3a2c56] hover:border-[#f5c34d]"}`}
          >
            {allHeroes ? "LINE: ALL HEROES (TEST)" : "LINE: SEATED HEROES"}
          </button>
          <button
            type="button"
            onClick={flipPixelRoad}
            aria-pressed={pixelRoad}
            className={`px-3 py-2 rounded border-2 tracking-wider ${pixelRoad ? "bg-[#f5c34d] text-[#120b1e] border-[#f5c34d]" : "bg-[#221936] text-[#9a8fb0] border-[#3a2c56] hover:border-[#f5c34d]"}`}
          >
            {pixelRoad ? "PIXEL ROAD: ON" : "PIXEL ROAD: OFF"}
          </button>
          <span className="text-[#9a8fb0]">DM only. The test line shows on this screen alone and changes nothing in the game.</span>
        </div>
      ) : null}
      {dmKey ? <TravelPanels t={travel} /> : null}
    </div>
  )
}
