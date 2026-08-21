"use client"

// The travel map as a DASHBOARD STAGE — a purpose-built, deliberately cheap
// render, not the full /map component.
//
// WHY NOT REUSE /map's COMPONENT: it is built for a full page — per-node
// gaussian blur filters, a full-bleed fog mask, live zoom/pan state. Dropped
// into the ~200px stage box those cost enough to lock the renderer solid
// (clicking Tactical Map froze the tab). This stage draws the same data with
// flat shapes and no filters: it stays responsive, and the heavy version is
// one click away at /map.
//
// Same trust model regardless: players see only what RLS gives them; Malachar's
// key adds click-to-send, still confirmed before anyone walks.

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { dmHeaders, getDmKey, onDmKeyChange } from "@/lib/dm-key"

const MAP_W = 1672
const MAP_H = 941
const MAP_SRC = "/maps/underdark-overworld.jpg"
const SPRITE = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/maps/party-south.png"
const POLL_MS = 20000

type NodeRow = {
  id: string
  node_key: string
  name: string
  node_type: string
  description: string | null
  metadata: Record<string, any> | null
  discovered_at?: string | null
}
type EdgeRow = {
  id: string
  from_node_id: string
  to_node_id: string
  metadata: Record<string, any> | null
  discovered_at?: string | null
}

export default function MapStage({ onBack }: { onBack?: () => void }) {
  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [edges, setEdges] = useState<EdgeRow[]>([])
  const [partyNode, setPartyNode] = useState<string | null>(null)
  const [dmKey, setDmKeyState] = useState("")
  const [confirm, setConfirm] = useState<NodeRow | null>(null)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    setDmKeyState(getDmKey())
    return onDmKeyChange(() => setDmKeyState(getDmKey()))
  }, [])

  useEffect(() => {
    alive.current = true
    const supabase = createClient()
    async function load() {
      if (dmKey) {
        try {
          const res = await fetch("/api/travel", { headers: dmHeaders(), cache: "no-store" })
          if (res.ok) {
            const g = await res.json()
            if (!alive.current) return
            setNodes((g.nodes ?? []) as NodeRow[])
            setEdges((g.edges ?? []) as EdgeRow[])
            setPartyNode(g.party?.node_id ?? null)
            return
          }
        } catch {
          /* fall through to the player view */
        }
      }
      const [n, e, p] = await Promise.all([
        supabase.from("travel_nodes").select("id,node_key,name,node_type,description,metadata,discovered_at"),
        supabase.from("travel_edges").select("id,from_node_id,to_node_id,metadata,discovered_at"),
        supabase.from("party_position").select("node_id").limit(1),
      ])
      if (!alive.current) return
      if (n.data) setNodes(n.data as NodeRow[])
      if (e.data) setEdges(e.data as EdgeRow[])
      if (p.data) setPartyNode((p.data[0] as any)?.node_id ?? null)
    }
    load()
    const t = setInterval(load, POLL_MS)
    return () => {
      alive.current = false
      clearInterval(t)
    }
  }, [dmKey, busy])

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const at = (n?: NodeRow | null) => (n?.metadata && typeof n.metadata.map_x === "number" ? n.metadata : null)
  const cities = nodes.filter((n) => n.node_type === "location" && at(n))
  const roadNodes = nodes.filter((n) => n.metadata?.is_road_node && at(n))
  const roads = edges.filter((e) => e.metadata?.is_road)
  const party = partyNode ? byId.get(partyNode) : null
  const known = (r: { discovered_at?: string | null }) => !dmKey || !!r.discovered_at

  async function send(n: NodeRow) {
    setBusy(true)
    await fetch("/api/travel", {
      method: "POST",
      headers: { ...dmHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move", node_key: n.node_key }),
    }).catch(() => {})
    setConfirm(null)
    setBusy(false)
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[#0b0714]">
      <div className="flex items-center justify-between gap-2 border-b border-[#4b3a19] bg-[#080705]/90 px-2 py-1">
        {onBack ? (
          <button
            onClick={onBack}
            className="rounded border border-[#6b5123] px-2 py-1 text-[9px] uppercase tracking-wider text-[#e1d0a8] hover:border-[#c99a49]"
          >
            ← Character View
          </button>
        ) : <span />}
        <span className="text-[9px] uppercase tracking-wider text-[#8f8061]">
          {dmKey ? "Malachar's eyes · click a node to send the party" : "The Underdark"}
        </span>
        <Link
          href="/map"
          className="rounded border border-[#6b5123] px-2 py-1 text-[9px] uppercase tracking-wider text-[#e1d0a8] hover:border-[#c99a49]"
        >
          Full map ↗
        </Link>
      </div>

      <div className="relative min-h-0 flex-1">
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          <image href={MAP_SRC} width={MAP_W} height={MAP_H} />

          {roads.map((e) => {
            const a = at(byId.get(e.from_node_id))
            const b = at(byId.get(e.to_node_id))
            if (!a || !b) return null
            const sail = e.metadata?.mode === "sail"
            const off = Number(e.metadata?.curve_offset) || 0
            const dx = b.map_x - a.map_x
            const dy = b.map_y - a.map_y
            const L = Math.hypot(dx, dy) || 1
            const cx = (a.map_x + b.map_x) / 2 + (-dy / L) * off
            const cy = (a.map_y + b.map_y) / 2 + (dx / L) * off
            return (
              <path
                key={e.id}
                d={off ? `M ${a.map_x} ${a.map_y} Q ${cx} ${cy} ${b.map_x} ${b.map_y}` : `M ${a.map_x} ${a.map_y} L ${b.map_x} ${b.map_y}`}
                fill="none"
                stroke={sail ? "#5cc8e0" : known(e) ? "#f5c34d" : "#6b5f80"}
                strokeWidth={5}
                strokeDasharray={sail ? "4 14" : "12 10"}
                opacity={known(e) ? 0.5 : 0.25}
              />
            )
          })}

          {roadNodes.map((n) => {
            const m = at(n)!
            return (
              <g key={n.id} onClick={() => dmKey && partyNode !== n.id && setConfirm(n)} style={{ cursor: dmKey ? "pointer" : "default" }}>
                <circle cx={m.map_x} cy={m.map_y} r={16} fill="transparent" />
                <circle cx={m.map_x} cy={m.map_y} r={9} fill="none" stroke={known(n) ? "#f5c34d" : "#6b5f80"} strokeWidth={3} opacity={known(n) ? 0.9 : 0.4} />
              </g>
            )
          })}

          {cities.map((n) => {
            const m = at(n)!
            return (
              <g key={n.id} onClick={() => dmKey && partyNode !== n.id && setConfirm(n)} style={{ cursor: dmKey ? "pointer" : "default" }}>
                <circle cx={m.map_x} cy={m.map_y} r={26} fill="#f5c34d" opacity={known(n) ? 0.22 : 0.08} />
                <circle cx={m.map_x} cy={m.map_y} r={15} fill="rgba(5,3,10,.5)" stroke={known(n) ? "#f5c34d" : "#6b5f80"} strokeWidth={4} />
                <text
                  x={m.map_x}
                  y={m.map_y + 46}
                  textAnchor="middle"
                  fill={known(n) ? "#e8e0f0" : "#6b5f80"}
                  stroke="#05030a"
                  strokeWidth={6}
                  paintOrder="stroke"
                  style={{ fontSize: 26, fontWeight: 700, letterSpacing: 1 }}
                >
                  {n.name.toUpperCase()}
                </text>
              </g>
            )
          })}

          {party && at(party) && (
            <g transform={`translate(${at(party)!.map_x},${at(party)!.map_y})`}>
              <circle cx={0} cy={0} r={30} fill="#ffb347" opacity={0.25} />
              <image href={SPRITE} x={-26} y={-74} width={52} height={76} />
            </g>
          )}
        </svg>

        {confirm && (
          <div className="absolute inset-0 grid place-items-center bg-[#05030acc] px-4">
            <div className="max-w-[34ch] rounded border-2 border-[#c99a49] bg-[#171024] px-4 py-3 text-center">
              <div className="text-[9px] uppercase tracking-widest text-[#8f8061]">Malachar asks</div>
              <div className="mt-1 font-serif text-sm text-[#f5c34d]">Send the party to {confirm.name}?</div>
              <div className="mt-1 text-[10px] text-[#9a8fb0]">They walk every marker on the road.</div>
              <div className="mt-3 flex justify-center gap-2">
                <button
                  disabled={busy}
                  onClick={() => void send(confirm)}
                  className="rounded border-2 border-[#c99a49] bg-[#c99a49] px-3 py-1 text-[10px] font-bold uppercase text-[#120b1e] disabled:opacity-50"
                >
                  {busy ? "Setting out…" : "Yes"}
                </button>
                <button
                  onClick={() => setConfirm(null)}
                  className="rounded border-2 border-[#3a2c56] bg-[#221936] px-3 py-1 text-[10px] uppercase text-[#9a8fb0]"
                >
                  No
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
