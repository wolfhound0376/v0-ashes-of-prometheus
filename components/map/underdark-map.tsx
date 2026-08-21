"use client"

// /map — the Underdark overworld travel map (Layer 3 viewer).
//
// Players never move the party from here: party_position is written only by
// service-role server routes (Layer 1). This component is a live window onto
// the travel graph — RLS does the fog of war (anon only receives rows whose
// discovered_at is set), realtime + polling keep it current, and when the
// party's node changes the marker *walks* the edge with the camera following.
//
// Node placement comes from travel_nodes.metadata.map_x / map_y in the
// 1672x941 coordinate space of /public/maps/underdark-overworld.jpg.
// Waypoint nodes are placed along their edge's deterministic curve by
// edge_position. Nodes without coordinates are simply not drawn.
//
// NOTE: the lantern-fog here is presentation, not secrecy — the full map
// image ships to every browser. Real secrecy is the RLS on the node rows.

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { dmHeaders, getDmKey, onDmKeyChange } from "@/lib/dm-key"

const MAP_W = 1672
const MAP_H = 941
const MAP_SRC = "/maps/underdark-overworld.jpg"
const POLL_MS = 15000
const SPRITE_BASE = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/maps/party-"
type Facing = "south" | "north" | "east" | "west"

type NodeRow = {
  id: string
  node_key: string
  name: string
  node_type: "region" | "location" | "tactical_map" | "waypoint"
  edge_id: string | null
  edge_position: number | null
  description: string | null
  metadata: Record<string, any> | null
  discovered_at?: string | null
  name_known?: boolean
}
type EdgeRow = {
  id: string
  edge_key: string
  from_node_id: string
  to_node_id: string
  distance_miles: number
  danger_level: number
  metadata: Record<string, any> | null
  discovered_at?: string | null
}
type PartyRow = { campaign_run_id: string; node_id: string; arrived_at: string }

// Deterministic curve per edge (same construction the DM layer uses), so a
// route always bends the same way on every client.
function fnv(s: string) {
  let h = 2166136261
  for (const c of s) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function mulberry(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2f1965) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export default function UnderdarkMap({ embedded = false, onBack }: { embedded?: boolean; onBack?: () => void } = {}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [edges, setEdges] = useState<EdgeRow[]>([])
  const [party, setParty] = useState<PartyRow | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [lantern, setLantern] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [dmKey, setDmKeyState] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [confirmNode, setConfirmNode] = useState<NodeRow | null>(null)
  const [arrivedAt, setArrivedAt] = useState<NodeRow | null>(null)
  // What stopped the march, if anything. Held in the database too, so a reload
  // cannot walk the party past an ambush.
  const [halt, setHalt] = useState<{
    kind: string
    title: string
    body: string | null
    rolls: { title: string; die: number; roll: number; result: string; source: string }[]
    source: string
  } | null>(null)
  const resumeRef = useRef<(() => void) | null>(null)
  const lastNodeKey = useRef<string | null>(null)
  // No boat yet: the Darklake crossings stay closed until one is earned.
  const hasBoat = false

  // camera
  const cam = useRef({ x: 0, y: 0, w: MAP_W })
  const dragged = useRef(false)
  const walkingRef = useRef(false)
  const prevPartyNode = useRef<string | null>(null)
  const [, bump] = useState(0)
  const rerender = () => bump((n) => n + 1)

  useEffect(() => {
    setDmKeyState(getDmKey())
    return onDmKeyChange(() => setDmKeyState(getDmKey()))
  }, [])
  useEffect(() => {
    if (dmKey) setLantern(false)
  }, [dmKey])

  async function dmAction(action: "reveal" | "reveal_name" | "move", nodeKey: string) {
    await fetch("/api/travel", {
      method: "POST",
      headers: { ...dmHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ action, node_key: nodeKey }),
    }).catch(() => {})
    setRefresh((r) => r + 1)
  }

  // ---------- data ----------
  useEffect(() => {
    const supabase = createClient()
    let alive = true
    async function load() {
      if (dmKey) {
        try {
          const res = await fetch("/api/travel", { headers: dmHeaders(), cache: "no-store" })
          if (res.ok) {
            const g = await res.json()
            if (!alive) return
            setNodes((g.nodes ?? []) as NodeRow[])
            setEdges((g.edges ?? []) as EdgeRow[])
            setParty((g.party as PartyRow) ?? null)
            setLoaded(true)
            return
          }
        } catch {
          /* fall through to the player path */
        }
      }
      const [n, e, p] = await Promise.all([
        // Players read the masked view: discovered rows, names only once learned.
        supabase.from("travel_nodes_player").select("id,node_key,name,node_type,edge_id,edge_position,description,metadata,discovered_at,name_known"),
        supabase.from("travel_edges").select("id,edge_key,from_node_id,to_node_id,distance_miles,danger_level,metadata"),
        supabase.from("party_position").select("campaign_run_id,node_id,arrived_at").limit(1),
      ])
      if (!alive) return
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
      .subscribe()
    return () => {
      alive = false
      clearInterval(t)
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmKey, refresh])

  // ---------- derived geometry ----------
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const placed = nodes.filter(
    (n) => n.node_type !== "waypoint" && n.metadata && typeof n.metadata.map_x === "number",
  )
  // Road markers traced from the painted rings: small gold dots on the roads.
  const roadNodes = nodes.filter((n) => n.metadata?.is_road_node && typeof n.metadata?.map_x === "number")
  const pos = (n: NodeRow) => ({ x: n.metadata!.map_x as number, y: n.metadata!.map_y as number })
  const isRevealed = (n: { discovered_at?: string | null }) => !dmKey || !!n.discovered_at

  function edgeCurve(e: EdgeRow): string | null {
    // Road segments run straight between their markers — the markers are the
    // shape of the road. Only non-road edges ever bowed, and those are no
    // longer drawn or walked.
    const a = byId.get(e.from_node_id)
    const b = byId.get(e.to_node_id)
    if (!a || !b || !a.metadata?.map_x || !b.metadata?.map_x) return null
    const A = pos(a)
    const B = pos(b)
    const r = mulberry(fnv(e.edge_key))
    const mx = (A.x + B.x) / 2
    const my = (A.y + B.y) / 2
    const dx = B.x - A.x
    const dy = B.y - A.y
    const len = Math.hypot(dx, dy) || 1
    if (e.metadata?.is_road) {
      // Traced geometry: curve_offset is the bend that made this line sit on the
      // painted causeway when the map art was analysed.
      const off = Number(e.metadata.curve_offset) || 0
      if (!off) return `M ${A.x} ${A.y} L ${B.x} ${B.y}`
      const ddx = B.x - A.x
      const ddy = B.y - A.y
      const L = Math.hypot(ddx, ddy) || 1
      const cx = (A.x + B.x) / 2 + (-ddy / L) * off
      const cy = (A.y + B.y) / 2 + (ddx / L) * off
      return `M ${A.x} ${A.y} Q ${cx} ${cy} ${B.x} ${B.y}`
    }
    const off = (r() - 0.5) * 2 * Math.min(110, len * 0.3)
    const sgn = off < 0 ? -1 : 1
    const mag = Math.max(40, Math.abs(off))
    return `M ${A.x} ${A.y} Q ${mx + (-dy / len) * mag * sgn} ${my + (dx / len) * mag * sgn} ${B.x} ${B.y}`
  }

  // waypoints grouped by edge, placed by edge_position along the curve
  const wpByEdge = new Map<string, NodeRow[]>()
  for (const n of nodes) {
    if (n.node_type === "waypoint" && n.edge_id && n.edge_position) {
      if (!wpByEdge.has(n.edge_id)) wpByEdge.set(n.edge_id, [])
      wpByEdge.get(n.edge_id)!.push(n)
    }
  }

  // ---------- camera ----------
  function applyCam() {
    const c = cam.current
    c.w = Math.max(260, Math.min(MAP_W, c.w))
    const h = (c.w * MAP_H) / MAP_W
    c.x = Math.max(0, Math.min(MAP_W - c.w, c.x))
    c.y = Math.max(0, Math.min(MAP_H - h, c.y))
    svgRef.current?.setAttribute("viewBox", `${c.x} ${c.y} ${c.w} ${h}`)
  }
  function zoomAt(px: number, py: number, f: number) {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const c = cam.current
    const wx = c.x + ((px - r.left) / r.width) * c.w
    const wy = c.y + ((py - r.top) / r.height) * ((c.w * MAP_H) / MAP_W)
    c.w = c.w * f
    c.x = wx - (wx - c.x) * f
    c.y = wy - (wy - c.y) * f
    applyCam()
    rerender()
  }
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    applyCam()
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.15 : 0.87)
    }
    let drag: { x: number; y: number; cx: number; cy: number } | null = null
    const onDown = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, cx: cam.current.x, cy: cam.current.y }
      dragged.current = false
    }
    const onMove = (e: PointerEvent) => {
      if (!drag) return
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) dragged.current = true
      if (dragged.current) {
        const r = el.getBoundingClientRect()
        cam.current.x = drag.cx - ((e.clientX - drag.x) / r.width) * cam.current.w
        cam.current.y = drag.cy - ((e.clientY - drag.y) / r.height) * ((cam.current.w * MAP_H) / MAP_W)
        applyCam()
      }
    }
    const onUp = () => {
      drag = null
      setTimeout(() => (dragged.current = false), 50)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    el.addEventListener("pointerdown", onDown)
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("pointerdown", onDown)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  // ---------- walk animation on party move ----------
  //
  // The party does NOT fly to its destination: it follows the road. We find a
  // route through the graph (fewest hops over edges we can see), then walk each
  // leg along that edge's curve, pausing at every waypoint stone on the way —
  // the ones the server generated and froze on the first crossing.
  const partyG = useRef<SVGGElement | null>(null)
  const [facing, setFacing] = useState<Facing>("south")
  const facingRef = useRef<Facing>("south")

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

  useEffect(() => {
    if (!party) return
    const prev = prevPartyNode.current
    prevPartyNode.current = party.node_id
    if (!prev || prev === party.node_id) return
    const start = byId.get(prev)
    if (!start?.metadata?.map_x || !byId.get(party.node_id)?.metadata?.map_x) return

    const route = routeBetween(prev, party.node_id)
    if (route.length < 2) {
      // No known road. The party is where the DM put them; we refuse to draw a
      // journey that does not exist. (Boat routes will land here as water edges.)
      setArrivedAt(byId.get(party.node_id) ?? null)
      rerender()
      return
    }
    // Build one sampled polyline for the whole journey: each leg follows its
    // edge curve, and waypoint stones become the beats we walk through.
    const pts: { x: number; y: number; pause: boolean; node?: string }[] = []
    for (let i = 0; i < route.length - 1; i++) {
      const A = byId.get(route[i])
      const B = byId.get(route[i + 1])
      if (!A?.metadata?.map_x || !B?.metadata?.map_x) continue
      const e = edges.find(
        (x) =>
          (x.from_node_id === route[i] && x.to_node_id === route[i + 1]) ||
          (x.to_node_id === route[i] && x.from_node_id === route[i + 1]),
      )
      const d = e ? edgeCurve(e) : `M ${pos(A).x} ${pos(A).y} L ${pos(B).x} ${pos(B).y}`
      if (!d) continue
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
      path.setAttribute("d", d)
      const L = path.getTotalLength()
      const p0 = path.getPointAtLength(0)
      const rev = Math.hypot(p0.x - pos(A).x, p0.y - pos(A).y) > 1
      const legEnd = i === route.length - 2
      const wps = e ? (wpByEdge.get(e.id) ?? []) : []
      const N = wps.length ? Math.max(...wps.map((w) => w.edge_position || 1)) : 0
      const stops = wps
        .map((w) => (w.edge_position || 1) / (N + 1))
        .sort((a, b) => a - b)
      const SAMPLES = 48
      for (let k = 1; k <= SAMPLES; k++) {
        const u = k / SAMPLES
        const pt = path.getPointAtLength(rev ? L * (1 - u) : L * u)
        const nearStop = stops.some((sv) => {
          const su = rev ? 1 - sv : sv
          return Math.abs(su - u) < 0.5 / SAMPLES
        })
        // Arriving AT a node is always a beat — every marker is a stop, which is
        // where per-node triggers will hang once encounters land.
        pts.push({ x: pt.x, y: pt.y, pause: nearStop || (k === SAMPLES && !legEnd), node: k === SAMPLES ? route[i + 1] : undefined })
      }
    }
    if (!pts.length) return

    walkingRef.current = true
    lastNodeKey.current = start.node_key
    const followW = Math.min(cam.current.w, 620)
    const PER_STEP = 62
    let i = 0
    let last = { x: pos(start).x, y: pos(start).y }
    const tick = () => {
      if (i >= pts.length) {
        walkingRef.current = false
        rerender()
        return
      }
      const p = pts[i]
      const dx = p.x - last.x
      const dy = p.y - last.y
      if (Math.hypot(dx, dy) > 0.4) {
        const f: Facing =
          Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "east" : "west") : dy > 0 ? "south" : "north"
        if (f !== facingRef.current) {
          facingRef.current = f
          setFacing(f)
        }
      }
      last = p
      partyG.current?.setAttribute("transform", `translate(${p.x},${p.y})`)
      cam.current = { x: p.x - followW / 2, y: p.y - (followW * MAP_H) / MAP_W / 2, w: followW }
      applyCam()

      const advance = () => {
        i++
        setTimeout(tick, p.pause ? PER_STEP * 6 : PER_STEP)
      }

      const n = p.node ? byId.get(p.node) : null
      if (!n) {
        advance()
        return
      }
      setArrivedAt(n)

      // Ask the server what waits here. Only the DM's browser asks — a player
      // watching must never be the one rolling the party's encounters.
      if (!dmKey) {
        advance()
        return
      }
      void (async () => {
        let out: any = null
        try {
          const res = await fetch("/api/travel", {
            method: "POST",
            headers: { "content-type": "application/json", "x-dm-key": dmKey },
            body: JSON.stringify({ action: "arrive", node_key: n.node_key, from_node_key: lastNodeKey.current }),
          })
          out = res.ok ? await res.json() : null
        } catch {
          // The tunnel does not care that the network blinked. A failed check
          // lets them walk on rather than freezing the march forever.
          out = null
        }
        lastNodeKey.current = n.node_key
        if (out?.halt) {
          setHalt({ kind: out.kind, title: out.title, body: out.body, rolls: out.rolls ?? [], source: out.source })
          walkingRef.current = false
          rerender()
          // Picked up again by the Continue button, from exactly this step.
          resumeRef.current = () => {
            setHalt(null)
            walkingRef.current = true
            rerender()
            advance()
          }
          return
        }
        advance()
      })()
    }
    tick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party?.node_id, nodes.length, edges.length])

  // ---------- keyboard: arrows pick a neighbour, Enter asks, then they walk ----------
  useEffect(() => {
    if (!dmKey) return
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (confirmNode) {
        if (ev.key === "Enter") {
          ev.preventDefault()
          dmAction("move", confirmNode.node_key)
          setConfirmNode(null)
        } else if (ev.key === "Escape") {
          setConfirmNode(null)
        }
        return
      }
      const here = party ? byId.get(party.node_id) : null
      const anchor = selected ? byId.get(selected) : here
      if (!anchor?.metadata?.map_x) return
      if (ev.key === "Enter") {
        ev.preventDefault()
        if (anchor && party?.node_id !== anchor.id) setConfirmNode(anchor)
        return
      }
      const dirs: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      }
      const d = dirs[ev.key]
      if (!d) return
      ev.preventDefault()
      // step to the neighbour that lies most nearly in the pressed direction
      const A = pos(anchor)
      const neighbours = edges
        .filter((e) => e.metadata?.is_road && (e.from_node_id === anchor.id || e.to_node_id === anchor.id))
        .map((e) => byId.get(e.from_node_id === anchor.id ? e.to_node_id : e.from_node_id))
        .filter((n): n is NodeRow => !!n && typeof n.metadata?.map_x === "number")
      let best: NodeRow | null = null
      let bestScore = 0.25
      for (const n of neighbours) {
        const B = pos(n)
        const vx = B.x - A.x
        const vy = B.y - A.y
        const len = Math.hypot(vx, vy) || 1
        const score = (vx / len) * d[0] + (vy / len) * d[1]
        if (score > bestScore) {
          bestScore = score
          best = n
        }
      }
      if (best) setSelected(best.id)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmKey, selected, party?.node_id, edges.length, confirmNode])

  // ---------- render ----------
  const kk = Math.max(0.45, Math.min(1, cam.current.w / MAP_W))
  const partyNode = party ? byId.get(party.node_id) : null
  const partyXY = partyNode?.metadata?.map_x ? pos(partyNode) : null
  const sel = selected ? nodes.find((n) => n.id === selected) : null
  const selEdges = sel
    ? edges.filter((e) => e.from_node_id === sel.id || e.to_node_id === sel.id)
    : []

  return (
    <div className={embedded ? "absolute inset-0 z-10 bg-[#0b0714] text-[#e8e0f0] p-2 font-mono overflow-hidden flex flex-col" : "bg-[#0b0714] text-[#e8e0f0] p-3 font-mono overflow-hidden"}>
      <style>{`
        @keyframes aopbob{from{transform:translateY(0)}to{transform:translateY(-2px)}}
      `}</style>
      {embedded && onBack && (
        <div className="flex items-center justify-between gap-2 pb-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 rounded border-2 border-[#6b5123] bg-[#080705] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[#e1d0a8] hover:border-[#c99a49]"
          >
            ← Character View
          </button>
          <span className="text-[10px] uppercase tracking-wider text-[#8f8061]">The Underdark</span>
        </div>
      )}
      <div className={embedded ? "hidden" : "flex items-center justify-between flex-wrap gap-2 pb-3"}>
        <h1 className="text-[#f5c34d] text-lg tracking-widest" style={{ textShadow: "0 0 12px #f5c34d55" }}>
          THE UNDERDARK
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setLantern((v) => !v)}
            className="border-2 border-[#3a2c56] bg-[#221936] text-xs px-3 py-2 rounded text-[#9a8fb0] hover:border-[#f5c34d]"
          >
            {lantern ? "LANTERN LIGHT" : "FULL MAP"}
          </button>
          <button
            onClick={() => {
              cam.current = { x: 0, y: 0, w: MAP_W }
              applyCam()
              rerender()
            }}
            className="border-2 border-[#3a2c56] bg-[#221936] text-xs px-3 py-2 rounded text-[#9a8fb0] hover:border-[#f5c34d]"
          >
            FIT MAP
          </button>
        </div>
      </div>

      <div className={embedded ? "relative flex-1 min-h-0 rounded overflow-hidden border border-[#2b2040] bg-[#05030a]" : "relative rounded-lg overflow-hidden border-[3px] border-[#2b2040] bg-[#05030a]"} style={{ maxHeight: embedded ? "100%" : "calc(100vh - 190px)" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className={embedded ? "block w-full h-full touch-none cursor-grab active:cursor-grabbing" : "block w-full h-auto touch-none cursor-grab active:cursor-grabbing"}
          preserveAspectRatio="xMidYMid meet"
          style={{ maxHeight: embedded ? "100%" : "calc(100vh - 190px)" }}
          onClick={() => {
            if (!dragged.current) setSelected(null)
          }}
        >
          <defs>
            <radialGradient id="aop-torch" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffb347" stopOpacity=".55" />
              <stop offset="100%" stopColor="#ffb347" stopOpacity="0" />
            </radialGradient>


            <radialGradient id="aop-vignette" cx="50%" cy="50%" r="72%">
              <stop offset="0%" stopColor="#05030a" stopOpacity="0" />
              <stop offset="100%" stopColor="#05030a" stopOpacity="0.85" />
            </radialGradient>
          </defs>

          <image href={MAP_SRC} width={MAP_W} height={MAP_H} />

          {/* edges (RLS: only discovered rows arrive) */}
          {edges.filter((e) => e.metadata?.is_road).map((e) => {
            const d = edgeCurve(e)
            if (!d) return null
            const eRev = isRevealed(e)
            return (
              <path
                key={e.id}
                d={d}
                fill="none"
                stroke={e.metadata?.mode === "sail" ? (eRev ? "#5cc8e0" : "#3a6b7a") : eRev ? "#f5c34d" : "#8a7bb0"}
                strokeWidth={(e.metadata?.mode === "sail" ? 2 : 3) * kk}
                strokeDasharray={e.metadata?.mode === "sail" ? "1 7" : "6 6"}
                strokeLinecap="round"
                opacity={eRev ? ".45" : ".22"}
              />
            )
          })}

          {/* waypoints */}
          {[...wpByEdge.entries()].flatMap(([edgeId, wps]) => {
            const e = edges.find((x) => x.id === edgeId)
            const d = e && edgeCurve(e)
            if (!d) return []
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
            path.setAttribute("d", d)
            const L = path.getTotalLength()
            const N = Math.max(...wps.map((w) => w.edge_position || 1))
            return wps.map((w) => {
              const pt = path.getPointAtLength((L * (w.edge_position || 1)) / (N + 1))
              return (
                <g key={w.id}>
                  <circle cx={pt.x} cy={pt.y} r={7 * kk} fill="none" stroke="#f5c34d" strokeWidth={2.5 * kk} opacity=".9" />
                  <circle cx={pt.x} cy={pt.y} r={2.5 * kk} fill="#f5c34d" />
                </g>
              )
            })
          })}

          {lantern && (
            <rect width={MAP_W} height={MAP_H} fill="url(#aop-vignette)" pointerEvents="none" />
          )}

          {/* road markers — the painted rings, now real nodes */}
          {roadNodes.map((n) => {
            const P = pos(n)
            const known = isRevealed(n)
            const isSel = selected === n.id
            return (
              <g
                key={n.id}
                className="cursor-pointer"
                onClick={(ev) => {
                  ev.stopPropagation()
                  if (dragged.current) return
                  setSelected(n.id)
                  if (dmKey && party?.node_id !== n.id) setConfirmNode(n)
                }}
              >
                <circle cx={P.x} cy={P.y} r={9 * kk} fill="transparent" />
                <circle
                  cx={P.x}
                  cy={P.y}
                  r={5 * kk}
                  fill="none"
                  stroke={known ? "#f5c34d" : "#6b5f80"}
                  strokeWidth={1.8 * kk}
                  opacity={known ? 0.85 : 0.35}
                />
                {isSel && <circle cx={P.x} cy={P.y} r={10 * kk} fill="none" stroke="#fff" strokeWidth={1.5 * kk} strokeDasharray="3 4" />}
              </g>
            )
          })}

          {/* location nodes */}
          {placed.map((n) => {
            const P = pos(n)
            const isSel = selected === n.id
            const col = isRevealed(n) ? "#f5c34d" : "#8a7bb0"
            return (
              <g
                key={n.id}
                className="cursor-pointer"
                onClick={(ev) => {
                  ev.stopPropagation()
                  if (dragged.current) return
                  setSelected(n.id)
                  // Malachar clicks a node: ask before the party sets out.
                  if (dmKey && party?.node_id !== n.id) setConfirmNode(n)
                }}
              >
                <circle cx={P.x} cy={P.y} r={30 * kk} fill={col} opacity={isRevealed(n) ? 0.22 : 0.1} />
                <circle cx={P.x} cy={P.y} r={14 * kk} fill="rgba(5,3,10,.4)" stroke={col} strokeWidth={3.5 * kk} />
                <circle cx={P.x} cy={P.y} r={4 * kk} fill={col} />
                {isSel && (
                  <circle cx={P.x} cy={P.y} r={22 * kk} fill="none" stroke="#fff" strokeWidth={2 * kk} strokeDasharray="4 5" opacity=".9" />
                )}
                <text
                  x={P.x}
                  y={P.y + 42 * kk}
                  textAnchor="middle"
                  fill="#e8e0f0"
                  stroke="#05030a"
                  strokeWidth={5 * kk}
                  paintOrder="stroke"
                  style={{ fontSize: 15 * kk, fontWeight: 700, letterSpacing: 1 }}
                >
                  {n.name.toUpperCase()}
                </text>
              </g>
            )
          })}

          {/* the party — Sam's lantern-bearer, facing the way they walk */}
          {partyXY && (
            <g ref={partyG} transform={`translate(${partyXY.x},${partyXY.y})`}>
              <ellipse cx="0" cy="2" rx="13" ry="4.5" fill="#000" opacity=".5" />
              <circle cx="0" cy="-18" r="42" fill="url(#aop-torch)">
                <animate attributeName="r" values="38;46;38" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <image
                href={`${SPRITE_BASE}${facing}.png`}
                x={-21}
                y={-58}
                width={42}
                height={60}
                style={{ imageRendering: "auto" }}
              />
            </g>
          )}
        </svg>

        {confirmNode && (
          <div className="absolute inset-0 grid place-items-center bg-[#05030acc]">
            <div className="rounded-lg border-2 border-[#f5c34d] bg-[#171024] px-6 py-5 text-center max-w-[38ch]">
              <div className="text-[#9a8fb0] text-xs tracking-widest">MALACHAR ASKS</div>
              <div className="text-[#f5c34d] text-base font-bold tracking-widest mt-2">
                Send the party to {confirmNode.name}?
              </div>
              <div className="text-[#9a8fb0] text-xs mt-2">
                They will walk every marker on the road, stopping at each.
              </div>
              <div className="flex gap-2 justify-center mt-4">
                <button
                  onClick={() => {
                    dmAction("move", confirmNode.node_key)
                    setConfirmNode(null)
                  }}
                  className="text-xs px-4 py-2 rounded border-2 bg-[#f5c34d] border-[#f5c34d] text-[#120b1e] font-bold"
                >
                  YES — SET OUT ⏎
                </button>
                <button
                  onClick={() => setConfirmNode(null)}
                  className="text-xs px-4 py-2 rounded border-2 bg-[#221936] border-[#3a2c56] text-[#9a8fb0]"
                >
                  NO — ESC
                </button>
              </div>
            </div>
          </div>
        )}

        {arrivedAt && !confirmNode && !halt && (
          <div className="absolute left-1/2 -translate-x-1/2 top-3 rounded border-2 border-[#3a2c56] bg-[#171024ee] px-4 py-2 text-xs text-[#f5c34d] tracking-widest">
            ARRIVED: {arrivedAt.name.toUpperCase()}
          </div>
        )}

        {/* The march has stopped. Nothing resumes it but the DM. */}
        {halt && (
          <div className="absolute inset-0 grid place-items-center bg-[#0a0612cc] p-4">
            <div className="w-full max-w-md rounded-lg border-2 border-[#7a2b2b] bg-[#1a1020] p-4 shadow-[0_0_40px_#000]">
              <div className="text-[10px] uppercase tracking-[.22em] text-[#c96a6a]">
                {halt.kind === "encounter" ? "Encounter" : halt.kind === "challenge" ? "Challenge" : halt.kind === "cinematic" ? "Cinematic" : "The party stops"}
              </div>
              <div className="mt-1 font-serif text-lg leading-snug text-[#f5c34d]">{halt.title}</div>
              {halt.body && <p className="mt-2 text-[13px] leading-relaxed text-[#c9bcd8]">{halt.body}</p>}

              {halt.rolls.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-[#3a2c56] pt-3">
                  {halt.rolls.map((r, k) => (
                    <li key={k} className="text-[11px] text-[#9a8fb0]">
                      <span className="text-[#f5c34d]">d{r.die} = {r.roll}</span>
                      <span className="mx-2 text-[#5c4f72]">|</span>
                      {r.title}: <span className="text-[#e4d8bf]">{r.result}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Every number above is checkable. This campaign has been bitten
                  by invented tables before; the page number rides along. */}
              <div className="mt-3 text-[10px] italic text-[#6f6486]">{halt.source}</div>

              <button
                onClick={() => {
                  const go = resumeRef.current
                  resumeRef.current = null
                  void fetch("/api/travel", {
                    method: "POST",
                    headers: { "content-type": "application/json", "x-dm-key": dmKey },
                    body: JSON.stringify({ action: "continue", node_key: arrivedAt?.node_key ?? "" }),
                  }).catch(() => {})
                  if (go) go()
                  else setHalt(null)
                }}
                className="mt-4 w-full rounded border border-[#7a5c2b] bg-[#2a1f10] py-2 text-xs tracking-[.2em] text-[#f5c34d] hover:bg-[#3a2b16]"
              >
                CONTINUE THE MARCH
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={embedded ? "mt-2 rounded border border-[#3a2c56] bg-[#171024ee] p-2 text-[11px]" : "mt-3 rounded-lg border-2 border-[#3a2c56] bg-[#171024ee] p-4 min-h-[84px] text-sm"}>
        {sel ? (
          <>
            <div className="text-[#f5c34d] font-bold tracking-widest">
              {sel.name.toUpperCase()}
              {partyNode?.id === sel.id && <span className="text-xs ml-3">&#9670; PARTY IS HERE</span>}
            </div>
            {sel.description && <div className="text-[#9a8fb0] mt-1">{sel.description}</div>}
            <div className="flex flex-wrap gap-2 mt-2">
              {selEdges.map((e) => {
                const otherId = e.from_node_id === sel.id ? e.to_node_id : e.from_node_id
                const o = byId.get(otherId)
                if (!o) return null
                const days = e.metadata?.days_normal_pace
                return (
                  <span key={e.id} className="border border-[#3a2c56] bg-[#231a38] rounded px-2 py-1 text-xs">
                    &rarr; <b className="text-[#f5c34d]">{o.name}</b>
                    {days ? ` · ${days} days` : ""} · {Number(e.distance_miles)} mi ·{" "}
                    <span className="text-[#e05555]">danger {e.danger_level}</span>
                  </span>
                )
              })}
            </div>
            {dmKey && (
              <div className="flex flex-wrap gap-2 mt-3">
                {!(sel as any).name_known_at && sel.node_type === "location" && (
                  <button
                    onClick={() => dmAction("reveal_name", sel.node_key)}
                    className="text-xs px-3 py-2 rounded border-2 bg-[#221936] border-[#b44df5] text-[#d9b3ff] hover:bg-[#b44df5] hover:text-white"
                    title="The party learns what this place is called"
                  >
                    TEACH ITS NAME
                  </button>
                )}
                {!sel.discovered_at && (
                  <button
                    onClick={() => dmAction("reveal", sel.node_key)}
                    className="text-xs px-3 py-2 rounded border-2 bg-[#b44df5] border-[#b44df5] text-white hover:brightness-110"
                  >
                    REVEAL TO PLAYERS
                  </button>
                )}
                {sel.node_type !== "region" && party?.node_id !== sel.id && (
                  <button
                    onClick={() => setConfirmNode(sel)}
                    className="text-xs px-3 py-2 rounded border-2 bg-[#f5c34d] border-[#f5c34d] text-[#120b1e] hover:brightness-110"
                  >
                    MOVE PARTY HERE
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-[#9a8fb0]">
            {loaded
              ? dmKey
                ? "Malachar's eyes. Click any node to send the party walking there. Wheel zooms, drag pans."
                : "Select a node. Wheel zooms, drag pans. The map grows as Malachar reveals the dark."
              : "Consulting the cartographers…"}
          </div>
        )}
      </div>
    </div>
  )
}
