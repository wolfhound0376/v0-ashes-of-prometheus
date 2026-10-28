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
//      is viewport-locked and swallows the event).//
// DIORAMA IS THE TRAVEL MAP (Sam, 2026-10-27, part 2 of 3: "lets work on part 2 of the 3d travel"). The march itself
// (the day, pace, the leader vote, the departure sheet, the arrival beat, the cards, the halt) is the shared one in
// ./use-travel.ts, drawn by ./travel-cards.tsx exactly as the 2D map draws it. This file is the picture: the terrain,
// the rings, the walking party, and entering a place's own diorama. Every browser watches the party walk; only the
// leader's (or the DM's) asks the server what waits at each marker, as on the 2D map.

import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js"
import { useTravel, type NodeRow, type EdgeRow } from "./use-travel"
import { TravelCards, TravelPanels } from "./travel-cards"

const MAP_W = 1672
const MAP_H = 941
const SPRITE_BASE = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/maps/party-"
const FLIP_Z = false
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
  const travel = useTravel()
  const { nodes, edges, party, dmKey, byId, routeBetween, reachNode, walkStarted, setArrivedAt, canLead, setConfirmNode, halt } = travel
  const modelUrl = useMemo(() => {
    const r = nodes.find((x) => x.metadata?.map_model_url)
    return r ? (r.metadata!.map_model_url as string) : null
  }, [nodes])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState("Consulting the cartographers…")
  const [inside, setInside] = useState<NodeRow | null>(null)

  const three = useRef<any>({})
  const dataRef = useRef<{ nodes: NodeRow[]; edges: EdgeRow[] }>({ nodes: [], edges: [] })
  const prevPartyNode = useRef<string | null>(null)
  const walkTimer = useRef<any>(null)

  useEffect(() => {
    dataRef.current = { nodes, edges }
  }, [nodes, edges])

  /** Ask to set out for `n`: the shared departure sheet (pace, navigator) opens, as on the 2D map. */
  function askToGo(n: NodeRow) {
    if (!canLead || !party || party.node_id === n.id || halt) return
    setConfirmNode(n)
  }

  // ---------- geometry helpers ----------
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
    if (e.metadata?.is_road) {
      const off = Number(e.metadata.curve_offset) || 0
      const ddx = B.x - A.x
      const ddy = B.y - A.y
      const L = Math.hypot(ddx, ddy) || 1
      const cx = (A.x + B.x) / 2 + (-ddy / L) * off
      const cy = (A.y + B.y) / 2 + (ddx / L) * off
      const p0 = document.createElementNS("http://www.w3.org/2000/svg", "path")
      p0.setAttribute("d", off ? `M ${A.x} ${A.y} Q ${cx} ${cy} ${B.x} ${B.y}` : `M ${A.x} ${A.y} L ${B.x} ${B.y}`)
      return p0
    }
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
      askToGo(n)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLead, party?.node_id, halt])

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
    if (route.length < 2) {
      // no road (or no boat) between: the party is where the DM put them; no journey is drawn that does not exist
      setArrivedAt(byId.get(party.node_id) ?? null)
      return
    }
    const startNode = byId.get(from)
    if (startNode) walkStarted(startNode.node_key)
    const wpByEdge = new Map<string, NodeRow[]>()
    for (const n of dataRef.current.nodes) {
      if (n.node_type === "waypoint" && n.edge_id) {
        if (!wpByEdge.has(n.edge_id)) wpByEdge.set(n.edge_id, [])
        wpByEdge.get(n.edge_id)!.push(n)
      }
    }
    const pts: { x: number; z: number; pause: boolean; node?: string }[] = []
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
        const legEnd = i === route.length - 2
        // arriving AT a marker is a beat (reachNode below), as on the 2D map; waypoint stones are a pause
        pts.push({ x: wx, z: wz, pause: stops.some((sv) => Math.abs(sv - u) < 0.5 / SAMPLES) || (k === SAMPLES && !legEnd), node: k === SAMPLES ? route[i + 1] : undefined })
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
      const advance = () => {
        i++
        walkTimer.current = setTimeout(tick, p.pause ? stepMs * 6 : stepMs)
      }
      const n = p.node ? byId.get(p.node) : null
      if (!n) return advance()
      // what waits at this marker is the shared march's to say: it rolls (leader/DM only), plays the beat, opens the
      // cards, and resolves when the party may walk on, after the halt card if it stopped them
      void reachNode(n).then(advance)
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
    setStatus(`Descending into ${inside.name ?? "the dark"}…`)
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
      () => setStatus(`That diorama could not be reached.`),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inside])


  const sel = selectedId ? nodes.find((n) => n.id === selectedId) : null
  const partyHere = sel && party && sel.id === party.node_id

  return (
    <div className="bg-[#0b0714] text-[#e8e0f0] p-3 font-mono">
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2">
        <h1 className="text-[#f5c34d] text-lg tracking-widest" style={{ textShadow: "0 0 12px #f5c34d55" }}>
          {inside ? (inside.name ?? "UNKNOWN PLACE").toUpperCase() : "THE UNDERDARK"}
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
            {canLead ? "drag to orbit · wheel to zoom · click a ring to set out" : "drag to orbit · wheel to zoom · click a ring"}
          </span>
        </div>
      </div>
      {/* the map and its cards: the cards are the 2D map's own (travel-cards.tsx), laid over the diorama */}
      <div className="relative rounded-lg overflow-hidden border-[3px] border-[#2b2040] bg-[#05030a]" style={{ height: "calc(100vh - 230px)", minHeight: 320 }}>
        <div ref={mountRef} className="absolute inset-0 touch-none" />
        {!inside && <TravelCards t={travel} />}
      </div>
      <div className="mt-2 rounded-lg border-2 border-[#3a2c56] bg-[#171024ee] p-3 min-h-[56px] text-sm">
        {status ? (
          <div className="text-[#9a8fb0]">{status}</div>
        ) : sel ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[#f5c34d] font-bold tracking-widest">{(sel.name ?? "Unknown place").toUpperCase()}</span>
            {partyHere && <span className="text-xs text-[#f5c34d]">◆ PARTY IS HERE</span>}
            {sel.description && <span className="text-[#9a8fb0] text-xs max-w-[60ch]">{sel.description}</span>}
            {sel.metadata?.island_model_url && !inside && (
              <button
                onClick={() => setInside(sel)}
                className="text-xs px-3 py-2 rounded border-2 bg-[#b44df5] border-[#b44df5] text-white hover:brightness-110"
              >
                ENTER {(sel.name ?? "THIS PLACE").toUpperCase()}
              </button>
            )}
            {canLead && !partyHere && !halt && (
              <button
                onClick={() => askToGo(sel)}
                className="text-xs px-3 py-2 rounded border-2 bg-[#f5c34d] border-[#f5c34d] text-[#120b1e] hover:brightness-110"
              >
                SET OUT FOR {(sel.name ?? "THERE").toUpperCase()}
              </button>
            )}
          </div>
        ) : (
          <div className="text-[#9a8fb0]">
            {canLead
              ? "Click a ring to choose where the party goes. The day's pace and the navigator are asked before the first step."
              : "Click a gold ring to inspect a place. The party's torch burns where they stand; you see them walk when the leader sets out."}
          </div>
        )}
      </div>
      <TravelPanels t={travel} />
    </div>
  )
}
