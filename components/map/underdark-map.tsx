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

const MAP_W = 1672
const MAP_H = 941
const MAP_SRC = "/maps/underdark-overworld.jpg"
const POLL_MS = 15000

type NodeRow = {
  id: string
  node_key: string
  name: string
  node_type: "region" | "location" | "tactical_map" | "waypoint"
  edge_id: string | null
  edge_position: number | null
  description: string | null
  metadata: Record<string, any> | null
}
type EdgeRow = {
  id: string
  edge_key: string
  from_node_id: string
  to_node_id: string
  distance_miles: number
  danger_level: number
  metadata: Record<string, any> | null
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

export default function UnderdarkMap() {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [edges, setEdges] = useState<EdgeRow[]>([])
  const [party, setParty] = useState<PartyRow | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [lantern, setLantern] = useState(true)
  const [loaded, setLoaded] = useState(false)

  // camera
  const cam = useRef({ x: 0, y: 0, w: MAP_W })
  const dragged = useRef(false)
  const walkingRef = useRef(false)
  const prevPartyNode = useRef<string | null>(null)
  const [, bump] = useState(0)
  const rerender = () => bump((n) => n + 1)

  // ---------- data ----------
  useEffect(() => {
    const supabase = createClient()
    let alive = true
    async function load() {
      const [n, e, p] = await Promise.all([
        supabase.from("travel_nodes").select("id,node_key,name,node_type,edge_id,edge_position,description,metadata"),
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
  }, [])

  // ---------- derived geometry ----------
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const placed = nodes.filter(
    (n) => n.node_type !== "waypoint" && n.metadata && typeof n.metadata.map_x === "number",
  )
  const pos = (n: NodeRow) => ({ x: n.metadata!.map_x as number, y: n.metadata!.map_y as number })

  function edgeCurve(e: EdgeRow): string | null {
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
  const partyG = useRef<SVGGElement | null>(null)
  const charW = useRef<SVGGElement | null>(null)
  useEffect(() => {
    if (!party) return
    const prev = prevPartyNode.current
    prevPartyNode.current = party.node_id
    if (!prev || prev === party.node_id) return
    const a = byId.get(prev)
    const b = byId.get(party.node_id)
    if (!a?.metadata?.map_x || !b?.metadata?.map_x) return
    const edge = edges.find(
      (e) =>
        (e.from_node_id === prev && e.to_node_id === party.node_id) ||
        (e.to_node_id === prev && e.from_node_id === party.node_id),
    )
    const d = edge ? edgeCurve(edge) : `M ${pos(a).x} ${pos(a).y} L ${pos(b).x} ${pos(b).y}`
    if (!d || !svgRef.current) return
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
    path.setAttribute("d", d)
    const L = path.getTotalLength()
    const p0 = path.getPointAtLength(0)
    const rev = Math.hypot(p0.x - pos(a).x, p0.y - pos(a).y) > 1
    walkingRef.current = true
    partyG.current?.classList.add("aop-walking")
    const T = 3200
    const t0 = performance.now()
    let lastX: number | null = null
    let dir = 1
    const followW = Math.min(cam.current.w, 560)
    const step = (now: number) => {
      let u = Math.min(1, (now - t0) / T)
      u = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
      const pt = path.getPointAtLength(rev ? L * (1 - u) : L * u)
      if (lastX !== null && Math.abs(pt.x - lastX) > 0.3) dir = pt.x >= lastX ? 1 : -1
      lastX = pt.x
      charW.current?.setAttribute("transform", `scale(${dir},1)`)
      partyG.current?.setAttribute("transform", `translate(${pt.x},${pt.y})`)
      cam.current = { x: pt.x - followW / 2, y: pt.y - (followW * MAP_H) / MAP_W / 2, w: followW }
      applyCam()
      if (u < 1) requestAnimationFrame(step)
      else {
        walkingRef.current = false
        partyG.current?.classList.remove("aop-walking")
        rerender()
      }
    }
    requestAnimationFrame(step)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party?.node_id])

  // ---------- render ----------
  const kk = Math.max(0.45, Math.min(1, cam.current.w / MAP_W))
  const partyNode = party ? byId.get(party.node_id) : null
  const partyXY = partyNode?.metadata?.map_x ? pos(partyNode) : null
  const sel = selected ? nodes.find((n) => n.id === selected) : null
  const selEdges = sel
    ? edges.filter((e) => e.from_node_id === sel.id || e.to_node_id === sel.id)
    : []

  return (
    <div className="min-h-screen bg-[#0b0714] text-[#e8e0f0] p-3 font-mono">
      <style>{`
        .aop-walking .aop-legL{animation:aopswA .36s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 0%}
        .aop-walking .aop-legR{animation:aopswB .36s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 0%}
        @keyframes aopswA{from{transform:rotate(24deg)}to{transform:rotate(-24deg)}}
        @keyframes aopswB{from{transform:rotate(-24deg)}to{transform:rotate(24deg)}}
      `}</style>
      <div className="flex items-center justify-between flex-wrap gap-2 pb-3">
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

      <div className="relative rounded-lg overflow-hidden border-[3px] border-[#2b2040] bg-[#05030a]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className="block w-full h-auto touch-none cursor-grab active:cursor-grabbing"
          onClick={() => {
            if (!dragged.current) setSelected(null)
          }}
        >
          <defs>
            <radialGradient id="aop-torch" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffb347" stopOpacity=".55" />
              <stop offset="100%" stopColor="#ffb347" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="aop-hole" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#000" stopOpacity="1" />
              <stop offset="55%" stopColor="#000" stopOpacity="1" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </radialGradient>
            <filter id="aop-soft" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
            <mask id="aop-fog" maskUnits="userSpaceOnUse" x="0" y="0" width={MAP_W} height={MAP_H}>
              <rect width={MAP_W} height={MAP_H} fill="#fff" />
              {placed.map((n) => (
                <circle key={n.id} cx={pos(n).x} cy={pos(n).y} r={170} fill="url(#aop-hole)" />
              ))}
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
                  return <circle key={w.id} cx={pt.x} cy={pt.y} r={80} fill="url(#aop-hole)" />
                })
              })}
            </mask>
          </defs>

          <image href={MAP_SRC} width={MAP_W} height={MAP_H} />

          {/* edges (RLS: only discovered rows arrive) */}
          {edges.map((e) => {
            const d = edgeCurve(e)
            if (!d) return null
            return (
              <path
                key={e.id}
                d={d}
                fill="none"
                stroke="#f5c34d"
                strokeWidth={2.5 * kk}
                strokeDasharray="2 9"
                strokeLinecap="round"
                opacity=".45"
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
            <rect width={MAP_W} height={MAP_H} fill="#05030a" fillOpacity=".95" mask="url(#aop-fog)" pointerEvents="none" />
          )}

          {/* location nodes */}
          {placed.map((n) => {
            const P = pos(n)
            const isSel = selected === n.id
            return (
              <g
                key={n.id}
                className="cursor-pointer"
                onClick={(ev) => {
                  ev.stopPropagation()
                  if (!dragged.current) setSelected(n.id)
                }}
              >
                <circle cx={P.x} cy={P.y} r={30 * kk} fill="#f5c34d" opacity=".28" filter="url(#aop-soft)" />
                <circle cx={P.x} cy={P.y} r={14 * kk} fill="rgba(5,3,10,.4)" stroke="#f5c34d" strokeWidth={3.5 * kk} />
                <circle cx={P.x} cy={P.y} r={4 * kk} fill="#f5c34d" />
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

          {/* the party */}
          {partyXY && (
            <g ref={partyG} transform={`translate(${partyXY.x},${partyXY.y})`}>
              <g ref={charW}>
                <ellipse cx="0" cy="3" rx="11" ry="4" fill="#000" opacity=".45" />
                <circle cx="0" cy="-16" r="34" fill="url(#aop-torch)" />
                <g className="aop-legL">
                  <path d="M-4.5 -12 L-1.5 -12 L-1.8 0 L-4.8 0 Z" fill="#2a2038" />
                </g>
                <g className="aop-legR">
                  <path d="M1.5 -12 L4.5 -12 L4.2 0 L1.2 0 Z" fill="#1e1628" />
                </g>
                <path d="M-7 -12 Q-8.5 -27 0 -29 Q8.5 -27 7 -12 Z" fill="#43305e" stroke="#0b0714" strokeWidth="1.2" />
                <circle cx="0" cy="-33" r="5.5" fill="#e8c9a0" stroke="#0b0714" strokeWidth="1.2" />
                <path d="M-6.5 -33 Q0 -41.5 6.5 -33 Q3 -37.5 0 -37.5 Q-3 -37.5 -6.5 -33 Z" fill="#2a2038" />
                <rect x="6" y="-26" width="9" height="2.6" rx="1.3" fill="#43305e" />
                <rect x="13.6" y="-34" width="2.6" height="10" rx="1.3" fill="#6b4a2a" />
                <circle cx="14.9" cy="-37" r="4" fill="#ffb347">
                  <animate attributeName="r" values="3.2;4.6;3.2" dur=".35s" repeatCount="indefinite" />
                </circle>
              </g>
            </g>
          )}
        </svg>
      </div>

      <div className="mt-3 rounded-lg border-2 border-[#3a2c56] bg-[#171024ee] p-4 min-h-[84px] text-sm">
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
          </>
        ) : (
          <div className="text-[#9a8fb0]">
            {loaded
              ? "Select a node. Scroll to zoom, drag to pan. The map grows as Malachar reveals the dark."
              : "Consulting the cartographers…"}
          </div>
        )}
      </div>
    </div>
  )
}
