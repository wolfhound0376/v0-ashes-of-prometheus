"use client"

// /map — 3D diorama view.
//
// The travel graph projected onto Sam's sculpted Underdark. Same trust model
// as the 2D view: RLS decides which nodes exist for a player; Malachar's key
// swaps the data source to /api/travel (service role) and unlocks travel.
//
// THREE THINGS THIS VIEW DOES BEYOND RENDERING TERRAIN:
//   1. Click a gold ring to select. In Malachar mode, clicking a node the
//      party isn't standing on sends them there — and they WALK, following the
//      graph route and pausing at each waypoint stone, never flying.
//   2. Nodes carrying an island_model_url can be entered: the overworld hides
//      and that location's own diorama loads in its place, with a way back.
//      This is how the 2D map, the overworld mesh and the island meshes end up
//      being one continuous space rather than three separate pictures.
//   3. The wheel zooms the camera instead of scrolling the page (the canvas
//      is viewport-locked and swallows the event).

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { dmHeaders, getDmKey, onDmKeyChange } from "@/lib/dm-key"
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js"

const MAP_W = 1672
const MAP_H = 941
const POLL_MS = 15000
const SPRITE_BASE = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/maps/party-"
const FLIP_Z = false

type NodeRow = {
  id: string
  node_key: string
  name: string
  node_type: string
  edge_id: string | null
  edge_position: number | null
  description: string | null
  metadata: Record<string, any> | null
  discovered_at?: string | null
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
type PartyRow = { node_id: string }
type Facing = "south" | "north" | "east" | "west"

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

export default function UnderdarkMap3D() {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [edges, setEdges] = useState<EdgeRow[]>([])
  const [party, setParty] = useState<PartyRow | null>(null)
  const [modelUrl, setModelUrl] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState("Consulting the cartographers…")
  const [dmKey, setDmKeyState] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [inside, setInside] = useState<NodeRow | null>(null)

  const three = useRef<any>({})
  const dataRef = useRef<{ nodes: NodeRow[]; edges: EdgeRow[] }>({ nodes: [], edges: [] })
  const prevPartyNode = useRef<string | null>(null)
  const walkTimer = useRef<any>(null)

  useEffect(() => {
    setDmKeyState(getDmKey())
    return onDmKeyChange(() => setDmKeyState(getDmKey()))
  }, [])
  useEffect(() => {
    dataRef.current = { nodes, edges }
  }, [nodes, edges])

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
            const r = (g.nodes ?? []).find((x: NodeRow) => x.metadata?.map_model_url)
            if (r) setModelUrl(r.metadata!.map_model_url)
            return
          }
        } catch {
          /* fall through */
        }
      }
      const [n, e, p] = await Promise.all([
        supabase.from("travel_nodes").select("id,node_key,name,node_type,edge_id,edge_position,description,metadata,discovered_at"),
        supabase.from("travel_edges").select("id,edge_key,from_node_id,to_node_id,distance_miles,danger_level,metadata,discovered_at"),
        supabase.from("party_position").select("node_id").limit(1),
      ])
      if (!alive) return
      if (n.data) {
        setNodes(n.data as NodeRow[])
        const r = (n.data as NodeRow[]).find((x) => x.metadata?.map_model_url)
        if (r) setModelUrl(r.metadata!.map_model_url)
      }
      if (e.data) setEdges(e.data as EdgeRow[])
      if (p.data) setParty((p.data[0] as PartyRow) ?? null)
    }
    load()
    const t = setInterval(load, POLL_MS)
    const ch = supabase
      .channel("underdark-map-3d")
      .on("postgres_changes", { event: "*", schema: "public", table: "party_position" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "travel_nodes" }, load)
      .subscribe()
    return () => {
      alive = false
      clearInterval(t)
      supabase.removeChannel(ch)
    }
  }, [dmKey, refresh])

  async function moveParty(nodeKey: string) {
    await fetch("/api/travel", {
      method: "POST",
      headers: { ...dmHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move", node_key: nodeKey }),
    }).catch(() => {})
    setRefresh((r) => r + 1)
  }

  // ---------- geometry helpers ----------
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const placed = nodes.filter((n) => n.node_type === "location" && typeof n.metadata?.map_x === "number")
  const pos = (n: NodeRow) => ({ x: n.metadata!.map_x as number, y: n.metadata!.map_y as number })

  function toWorld(mx: number, my: number): [number, number] {
    const b = three.current.bbox
    if (!b) return [0, 0]
    const x = b.min.x + (mx / MAP_W) * (b.max.x - b.min.x)
    const zt = my / MAP_H
    const z = FLIP_Z ? b.max.z - zt * (b.max.z - b.min.z) : b.min.z + zt * (b.max.z - b.min.z)
    return [x, z]
  }
  function terrainY(x: number, z: number): number {
    const t = three.current
    if (!t.terrain || !t.raycaster || !t.bbox) return 0
    t.raycaster.set(new THREE.Vector3(x, t.bbox.max.y + 1, z), new THREE.Vector3(0, -1, 0))
    const hits = t.raycaster.intersectObject(t.terrain, true)
    return hits.length ? hits[0].point.y : (t.bbox.max.y + t.bbox.min.y) / 2
  }
  function edgeCurvePath(e: EdgeRow): SVGPathElement | null {
    const a = byId.get(e.from_node_id)
    const b = byId.get(e.to_node_id)
    if (!a?.metadata?.map_x || !b?.metadata?.map_x) return null
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
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path")
    p.setAttribute("d", `M ${A.x} ${A.y} Q ${mx + (-dy / len) * mag * sgn} ${my + (dx / len) * mag * sgn} ${B.x} ${B.y}`)
    return p
  }
  function routeBetween(fromId: string, toId: string): string[] {
    const adj = new Map<string, string[]>()
    for (const e of dataRef.current.edges) {
      if (!adj.has(e.from_node_id)) adj.set(e.from_node_id, [])
      if (!adj.has(e.to_node_id)) adj.set(e.to_node_id, [])
      adj.get(e.from_node_id)!.push(e.to_node_id)
      adj.get(e.to_node_id)!.push(e.from_node_id)
    }
    const prevOf = new Map<string, string>()
    const seen = new Set([fromId])
    const q = [fromId]
    while (q.length) {
      const cur = q.shift()!
      if (cur === toId) break
      for (const nx of adj.get(cur) ?? []) {
        if (seen.has(nx)) continue
        seen.add(nx)
        prevOf.set(nx, cur)
        q.push(nx)
      }
    }
    if (!seen.has(toId)) return [fromId, toId]
    const out = [toId]
    while (out[0] !== fromId) {
      const p = prevOf.get(out[0])
      if (!p) break
      out.unshift(p)
    }
    return out
  }

  // ---------- scene ----------
  useEffect(() => {
    if (!modelUrl || !mountRef.current || three.current.renderer) return
    const mount = mountRef.current
    const t = three.current
    t.disposed = false

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b0714)
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.01, 60)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enableZoom = true
    controls.zoomSpeed = 1.1
    controls.maxPolarAngle = Math.PI * 0.47
    controls.minDistance = 0.18
    controls.maxDistance = 4

    scene.add(new THREE.AmbientLight(0x8877aa, 1.1))
    const key = new THREE.DirectionalLight(0xfff2dd, 1.6)
    key.position.set(1.5, 2.5, 1)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xb44df5, 0.5)
    rim.position.set(-2, 1, -1.5)
    scene.add(rim)

    Object.assign(t, {
      scene,
      camera,
      renderer,
      controls,
      raycaster: new THREE.Raycaster(),
      markers: new THREE.Group(),
      islandGroup: new THREE.Group(),
      nodeMeshes: new Map(),
    })
    scene.add(t.markers, t.islandGroup)

    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    t.loader = loader
    let attempts = 0
    const loadTerrain = () =>
      loader.load(
        modelUrl,
        (gltf) => {
          if (t.disposed) return
          scene.add(gltf.scene)
          t.terrain = gltf.scene
          t.bbox = new THREE.Box3().setFromObject(gltf.scene)
          const c = t.bbox.getCenter(new THREE.Vector3())
          controls.target.copy(c)
          camera.position.set(c.x, t.bbox.max.y + 1.0, t.bbox.max.z + 1.05)
          setStatus("")
        },
        undefined,
        () => {
          attempts += 1
          if (attempts < 4 && !t.disposed) {
            setStatus(`The way is dark… retrying (${attempts}/3)`)
            setTimeout(loadTerrain, 1500 * attempts)
          } else setStatus("The diorama failed to load. Toggle 2D and back to try again.")
        },
      )
    loadTerrain()

    function resize() {
      const w = mount.clientWidth
      const h = mount.clientHeight || Math.round(w * 0.56)
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    // The wheel belongs to the camera here, not to the document.
    const swallow = (e: WheelEvent) => e.preventDefault()
    renderer.domElement.addEventListener("wheel", swallow, { passive: false })

    const clock = new THREE.Clock()
    renderer.setAnimationLoop(() => {
      const el = clock.getElapsedTime()
      if (t.partySprite) t.partySprite.material.rotation = 0
      if (t.torch) t.torch.intensity = 1.1 + Math.sin(el * 6) * 0.25
      controls.update()
      renderer.render(scene, camera)
    })

    let downXY: [number, number] | null = null
    const onDown = (e: PointerEvent) => (downXY = [e.clientX, e.clientY])
    const onUp = (e: PointerEvent) => {
      if (!downXY) return
      const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1])
      downXY = null
      if (moved > 6 || !t.nodeMeshes) return
      const r = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      )
      t.raycaster.setFromCamera(ndc, t.camera)
      const hits = t.raycaster.intersectObjects([...t.nodeMeshes.values()], true)
      if (!hits.length) return
      let obj: any = hits[0].object
      while (obj && !obj.userData.nodeId) obj = obj.parent
      if (obj) t.onNodeClick?.(obj.userData.nodeId as string)
    }
    renderer.domElement.addEventListener("pointerdown", onDown)
    renderer.domElement.addEventListener("pointerup", onUp)

    return () => {
      t.disposed = true
      renderer.setAnimationLoop(null)
      renderer.domElement.removeEventListener("wheel", swallow)
      renderer.domElement.removeEventListener("pointerdown", onDown)
      renderer.domElement.removeEventListener("pointerup", onUp)
      ro.disconnect()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
      three.current = {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl])

  // click handler kept fresh without rebuilding the scene
  useEffect(() => {
    three.current.onNodeClick = (id: string) => {
      const n = dataRef.current.nodes.find((x) => x.id === id)
      if (!n) return
      setSelectedId(id)
      if (dmKey && party?.node_id !== id) moveParty(n.node_key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmKey, party?.node_id])

  // ---------- markers ----------
  useEffect(() => {
    const t = three.current
    if (!t.markers || !t.terrain || !t.bbox || inside) return
    t.markers.clear()
    t.nodeMeshes.clear()
    const ringGeo = new THREE.TorusGeometry(0.026, 0.0055, 8, 32)
    const hitGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.05, 12)
    for (const n of placed) {
      const [x, z] = toWorld(n.metadata!.map_x, n.metadata!.map_y)
      const y = terrainY(x, z)
      const g = new THREE.Group()
      g.position.set(x, y + 0.008, z)
      g.userData.nodeId = n.id
      const revealed = !dmKey || !!n.discovered_at
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: revealed ? 0xf5c34d : 0x8a7bb0, transparent: true, opacity: revealed ? 1 : 0.5 }),
      )
      ring.rotation.x = -Math.PI / 2
      g.add(ring)
      const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }))
      g.add(hit)
      if (selectedId === n.id) {
        const sel = new THREE.Mesh(
          new THREE.TorusGeometry(0.038, 0.003, 8, 32),
          new THREE.MeshBasicMaterial({ color: 0xffffff }),
        )
        sel.rotation.x = -Math.PI / 2
        g.add(sel)
      }
      t.markers.add(g)
      t.nodeMeshes.set(n.id, g)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, selectedId, status, dmKey, inside])

  // ---------- party: sprite that walks the route ----------
  function spriteFor(f: Facing) {
    const tex = new THREE.TextureLoader().load(`${SPRITE_BASE}${f}.png`)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }
  useEffect(() => {
    const t = three.current
    if (!t.scene || !t.terrain || !t.bbox || !party || inside) return
    const node = byId.get(party.node_id)
    if (!node?.metadata?.map_x) return
    const [x, z] = toWorld(node.metadata.map_x, node.metadata.map_y)
    const y = terrainY(x, z)

    if (!t.partySprite) {
      const mat = new THREE.SpriteMaterial({ map: spriteFor("south"), transparent: true, depthTest: false })
      const sp = new THREE.Sprite(mat)
      sp.scale.set(0.075, 0.11, 1)
      sp.center.set(0.5, 0)
      sp.renderOrder = 999
      t.scene.add(sp)
      t.partySprite = sp
      const torch = new THREE.PointLight(0xffb347, 1.2, 0.5)
      t.scene.add(torch)
      t.torch = torch
      sp.position.set(x, y, z)
      torch.position.set(x, y + 0.05, z)
      prevPartyNode.current = party.node_id
      return
    }
    if (prevPartyNode.current === party.node_id) return
    const from = prevPartyNode.current
    prevPartyNode.current = party.node_id
    if (!from) return

    // Build the walk: every leg of the route, pausing at each waypoint stone.
    const route = routeBetween(from, party.node_id)
    const wpByEdge = new Map<string, NodeRow[]>()
    for (const n of dataRef.current.nodes) {
      if (n.node_type === "waypoint" && n.edge_id) {
        if (!wpByEdge.has(n.edge_id)) wpByEdge.set(n.edge_id, [])
        wpByEdge.get(n.edge_id)!.push(n)
      }
    }
    const pts: { x: number; z: number; pause: boolean }[] = []
    for (let i = 0; i < route.length - 1; i++) {
      const A = byId.get(route[i])
      const B = byId.get(route[i + 1])
      if (!A?.metadata?.map_x || !B?.metadata?.map_x) continue
      const e = dataRef.current.edges.find(
        (x) =>
          (x.from_node_id === route[i] && x.to_node_id === route[i + 1]) ||
          (x.to_node_id === route[i] && x.from_node_id === route[i + 1]),
      )
      const path = e ? edgeCurvePath(e) : null
      const wps = e ? (wpByEdge.get(e.id) ?? []) : []
      const N = wps.length ? Math.max(...wps.map((w) => w.edge_position || 1)) : 0
      const stops = wps.map((w) => (w.edge_position || 1) / (N + 1))
      const SAMPLES = 44
      for (let k = 1; k <= SAMPLES; k++) {
        const u = k / SAMPLES
        let mx: number
        let my: number
        if (path) {
          const L = path.getTotalLength()
          const p0 = path.getPointAtLength(0)
          const rev = Math.hypot(p0.x - pos(A).x, p0.y - pos(A).y) > 1
          const pt = path.getPointAtLength(rev ? L * (1 - u) : L * u)
          mx = pt.x
          my = pt.y
        } else {
          mx = pos(A).x + (pos(B).x - pos(A).x) * u
          my = pos(A).y + (pos(B).y - pos(A).y) * u
        }
        const [wx, wz] = toWorld(mx, my)
        pts.push({ x: wx, z: wz, pause: stops.some((sv) => Math.abs(sv - u) < 0.5 / SAMPLES) })
      }
    }
    if (!pts.length) return
    if (walkTimer.current) clearTimeout(walkTimer.current)
    let i = 0
    let last = { x: t.partySprite.position.x, z: t.partySprite.position.z }
    let facing: Facing = "south"
    const stepMs = 62
    const tick = () => {
      if (i >= pts.length || t.disposed) return
      const p = pts[i]
      const dx = p.x - last.x
      const dz = p.z - last.z
      if (Math.hypot(dx, dz) > 0.001) {
        const f: Facing = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "east" : "west") : dz > 0 ? "south" : "north"
        if (f !== facing) {
          facing = f
          t.partySprite.material.map = spriteFor(f)
          t.partySprite.material.needsUpdate = true
        }
      }
      last = { x: p.x, z: p.z }
      const py = terrainY(p.x, p.z)
      t.partySprite.position.set(p.x, py, p.z)
      t.torch.position.set(p.x, py + 0.05, p.z)
      t.controls.target.lerp(new THREE.Vector3(p.x, py, p.z), 0.08)
      i++
      walkTimer.current = setTimeout(tick, p.pause ? stepMs * 6 : stepMs)
    }
    tick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party?.node_id, nodes.length, status, inside])

  // ---------- entering a location's own diorama ----------
  useEffect(() => {
    const t = three.current
    if (!t.scene) return
    t.islandGroup.clear()
    if (t.terrain) t.terrain.visible = !inside
    if (t.markers) t.markers.visible = !inside
    if (t.partySprite) t.partySprite.visible = !inside
    if (t.torch) t.torch.visible = !inside
    if (!inside) {
      if (t.bbox) {
        const c = t.bbox.getCenter(new THREE.Vector3())
        t.controls.target.copy(c)
        t.camera.position.set(c.x, t.bbox.max.y + 1.0, t.bbox.max.z + 1.05)
      }
      return
    }
    const url = inside.metadata?.island_model_url
    if (!url) return
    setStatus(`Descending into ${inside.name}…`)
    t.loader.load(
      url,
      (gltf: any) => {
        if (t.disposed) return
        const box = new THREE.Box3().setFromObject(gltf.scene)
        const size = box.getSize(new THREE.Vector3())
        const s = 1.4 / Math.max(size.x, size.z, 0.001)
        gltf.scene.scale.setScalar(s)
        const box2 = new THREE.Box3().setFromObject(gltf.scene)
        const c2 = box2.getCenter(new THREE.Vector3())
        gltf.scene.position.sub(c2)
        t.islandGroup.add(gltf.scene)
        t.controls.target.set(0, 0, 0)
        t.camera.position.set(0, 0.9, 1.5)
        setStatus("")
      },
      undefined,
      () => setStatus(`${inside.name}'s diorama could not be reached.`),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inside])

  const sel = selectedId ? nodes.find((n) => n.id === selectedId) : null
  const partyHere = sel && party && sel.id === party.node_id

  return (
    <div className="bg-[#0b0714] text-[#e8e0f0] p-3 font-mono">
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2">
        <h1 className="text-[#f5c34d] text-lg tracking-widest" style={{ textShadow: "0 0 12px #f5c34d55" }}>
          {inside ? inside.name.toUpperCase() : "THE UNDERDARK — DIORAMA"}
        </h1>
        <div className="flex items-center gap-3">
          {inside && (
            <button
              onClick={() => setInside(null)}
              className="text-xs px-3 py-2 rounded border-2 bg-[#221936] border-[#3a2c56] text-[#9a8fb0] hover:border-[#f5c34d]"
            >
              ← BACK TO OVERWORLD
            </button>
          )}
          <span className="text-xs text-[#9a8fb0]">
            {dmKey ? "drag to orbit · wheel to zoom · click a ring to send the party" : "drag to orbit · wheel to zoom · click a ring"}
          </span>
        </div>
      </div>
      <div
        ref={mountRef}
        className="rounded-lg overflow-hidden border-[3px] border-[#2b2040] bg-[#05030a] touch-none"
        style={{ height: "calc(100vh - 190px)", minHeight: 320 }}
      />
      <div className="mt-2 rounded-lg border-2 border-[#3a2c56] bg-[#171024ee] p-3 min-h-[56px] text-sm">
        {status ? (
          <div className="text-[#9a8fb0]">{status}</div>
        ) : sel ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[#f5c34d] font-bold tracking-widest">{sel.name.toUpperCase()}</span>
            {partyHere && <span className="text-xs text-[#f5c34d]">◆ PARTY IS HERE</span>}
            {sel.description && <span className="text-[#9a8fb0] text-xs max-w-[60ch]">{sel.description}</span>}
            {sel.metadata?.island_model_url && !inside && (
              <button
                onClick={() => setInside(sel)}
                className="text-xs px-3 py-2 rounded border-2 bg-[#b44df5] border-[#b44df5] text-white hover:brightness-110"
              >
                ENTER {sel.name.toUpperCase()}
              </button>
            )}
            {dmKey && !partyHere && (
              <button
                onClick={() => moveParty(sel.node_key)}
                className="text-xs px-3 py-2 rounded border-2 bg-[#f5c34d] border-[#f5c34d] text-[#120b1e] hover:brightness-110"
              >
                SEND PARTY HERE
              </button>
            )}
          </div>
        ) : (
          <div className="text-[#9a8fb0]">
            {dmKey
              ? "Malachar's eyes. Click any ring to send the party walking there."
              : "Click a gold ring to inspect a location. The party's torch burns where they stand."}
          </div>
        )}
      </div>
    </div>
  )
}
