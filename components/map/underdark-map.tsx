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
import { StageLink } from "@/components/stage/stage-provider"
import { VESSELS, seats } from "@/lib/travel/vessels"
import { MARCH_HOURS_PER_DAY, PACES, legPreview, paceSummary } from "@/lib/travel/march"
import { useTravel, type NodeRow, type EdgeRow } from "./use-travel"
import { TravelCards, TravelPanels } from "./travel-cards"

// The game logic (data, the march, the leader, the cards and the server calls behind them) lives in
// ./use-travel.ts, shared with the 3D diorama. This file is the 2D picture of it: the painted map, the SVG
// roads and markers, the camera, and the walk animation that awaits reachNode() at each marker.

const MAP_W = 1672
const MAP_H = 941
const MAP_SRC = "/maps/underdark-overworld.jpg"
const SPRITE_BASE = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/maps/party-"
type Facing = "south" | "north" | "east" | "west"

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
  const travel = useTravel()
  const {
    nodes, edges, party, loaded, dmKey, setRefresh,
    confirmNode, setConfirmNode, arrivedAt, setArrivedAt,
    halt, continueMarch, reachNode, walkStarted,
    vessels, hasBoat, march, guides, pcs,
    pace, setPace, navSel, setNavSel, pcFamiliar, setPcFamiliar, pcHasMap, setPcHasMap,
    me, lead, canLead, hoverNode, setHoverNode,
    beat, options, setOptions, chosen, setChosen, entrance, setEntrance, entering,
    arrival, roadChoice, setRoadChoice,
    boatAction, dmAction, chooseOption, enterPlace, leadAction, setOut,
    routeMiles, routeBetween, byId,
  } = travel
  const [selected, setSelected] = useState<string | null>(null)
  const [lantern, setLantern] = useState(true)
  // camera
  const cam = useRef({ x: 0, y: 0, w: MAP_W })
  const dragged = useRef(false)
  const walkingRef = useRef(false)
  const prevPartyNode = useRef<string | null>(null)
  const [, bump] = useState(0)
  const rerender = () => bump((n) => n + 1)

  useEffect(() => {
    if (dmKey) setLantern(false)
  }, [dmKey])

  // ---------- derived geometry ----------
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


  useEffect(() => {
    if (!party) return
    const prev = prevPartyNode.current
    prevPartyNode.current = party.node_id
    if (!prev || prev === party.node_id) return
    const start = byId.get(prev)
    if (!start?.metadata?.map_x || !byId.get(party.node_id)?.metadata?.map_x) return

    const route = routeBetween(prev, party.node_id)
    if (route.length < 2) {
      // No known road (or no boat for the water between). The party is where
      // the DM put them; we refuse to draw a journey that does not exist.
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
    walkStarted(start.node_key)
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
      // What waits at this marker is the shared march's to say (use-travel.ts reachNode): it rolls, plays the
      // beat, opens the cards, and resolves when the party may walk on (after the halt card, if it stopped them).
      void reachNode(n).then(advance)
    }
    tick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party?.node_id, nodes.length, edges.length])

  // ---------- keyboard: arrows pick a neighbour, Enter asks, then they walk ----------
  useEffect(() => {
    if (!canLead) return
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (confirmNode) {
        if (ev.key === "Enter") {
          ev.preventDefault()
          void setOut(confirmNode)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLead, selected, party?.node_id, edges.length, confirmNode, pace, navSel, pcFamiliar, pcHasMap])

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
                  if (canLead && party?.node_id !== n.id) setConfirmNode(n)
                }}
                onMouseEnter={() => setHoverNode(n)}
                onMouseLeave={() => setHoverNode((h) => (h?.id === n.id ? null : h))}
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
                  // Malachar (or the leader) clicks a node: ask before the party sets out.
                  if (canLead && party?.node_id !== n.id) setConfirmNode(n)
                }}
                onMouseEnter={() => setHoverNode(n)}
                onMouseLeave={() => setHoverNode((h) => (h?.id === n.id ? null : h))}
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
                  {(n.name ?? "???").toUpperCase()}
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

        <TravelCards t={travel} embedded={embedded} />
      </div>

      <div className={embedded ? "mt-2 rounded border border-[#3a2c56] bg-[#171024ee] p-2 text-[11px]" : "mt-3 rounded-lg border-2 border-[#3a2c56] bg-[#171024ee] p-4 min-h-[84px] text-sm"}>
        {sel ? (
          <>
            <div className="text-[#f5c34d] font-bold tracking-widest">
              {(sel.name ?? "???").toUpperCase()}
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
                    &rarr; <b className="text-[#f5c34d]">{o.name ?? "???"}</b>
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
              </div>
            )}
            {canLead && sel.node_type !== "region" && party?.node_id !== sel.id && (
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={() => setConfirmNode(sel)}
                  className="text-xs px-3 py-2 rounded border-2 bg-[#f5c34d] border-[#f5c34d] text-[#120b1e] hover:brightness-110"
                >
                  {dmKey ? "MOVE PARTY HERE" : "LEAD THE PARTY HERE"}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-[#9a8fb0]">
            {loaded
              ? dmKey
                ? "Malachar's eyes. Click any node to send the party walking there. Wheel zooms, drag pans."
                : canLead
                  ? "You lead. Click a node to take the party there; hover one to see what the road will cost."
                  : "Select a node. Wheel zooms, drag pans. The map grows as Malachar reveals the dark."
              : "Consulting the cartographers…"}
          </div>
        )}
      </div>

      <TravelPanels t={travel} embedded={embedded} />
    </div>
  )
}
