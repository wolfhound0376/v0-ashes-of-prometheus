"use client"

// /map — 3D diorama view.
//
// Loads the optimized Underdark diorama GLB (URL stored in the `underdark`
// region node's metadata.map_model_url — currently
// vtt-assets/maps/underdark-map.glb, 104k tris / 9.1 MB) and projects the
// travel graph onto it: node markers raycast down onto the sculpted terrain
// using the same map_x/map_y coordinates as the 2D view, and the party
// marker walks the terrain when party_position changes.
//
// Same trust model as the 2D view: RLS decides which nodes exist for the
// viewer; this component draws whatever rows arrive. The terrain mesh itself
// is fully visible — geometry is not a secret, node identities are.
//
// NOTE(orientation): Meshy's image-to-3D axis convention hasn't been
// verified against the source map image. If markers land mirrored
// north-south on the preview deploy, flip FLIP_Z below — one line.

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js"

const MAP_W = 1672
const MAP_H = 941
const POLL_MS = 15000
const FLIP_Z = false

type NodeRow = {
  id: string
  node_key: string
  name: string
  node_type: string
  description: string | null
  metadata: Record<string, any> | null
}
type PartyRow = { node_id: string }

export default function UnderdarkMap3D() {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [party, setParty] = useState<PartyRow | null>(null)
  const [modelUrl, setModelUrl] = useState<string | null>(null)
  const [selected, setSelected] = useState<NodeRow | null>(null)
  const [status, setStatus] = useState("Consulting the cartographers…")

  // three.js internals kept in refs so React re-renders never touch them
  const three = useRef<{
    renderer?: THREE.WebGLRenderer
    scene?: THREE.Scene
    camera?: THREE.PerspectiveCamera
    controls?: OrbitControls
    terrain?: THREE.Object3D
    bbox?: THREE.Box3
    markers?: THREE.Group
    partyMarker?: THREE.Group
    raycaster?: THREE.Raycaster
    nodeMeshes?: Map<string, THREE.Object3D>
    disposed?: boolean
  }>({})
  const prevPartyNode = useRef<string | null>(null)
  const walkAnim = useRef<number | null>(null)

  // ---------- data ----------
  useEffect(() => {
    const supabase = createClient()
    let alive = true
    async function load() {
      const [n, p] = await Promise.all([
        supabase.from("travel_nodes").select("id,node_key,name,node_type,description,metadata"),
        supabase.from("party_position").select("node_id").limit(1),
      ])
      if (!alive) return
      if (n.data) {
        setNodes(n.data as NodeRow[])
        const region = (n.data as NodeRow[]).find((r) => r.metadata?.map_model_url)
        if (region) setModelUrl(region.metadata!.map_model_url)
      }
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
  }, [])

  // map-image coords -> world XZ on the terrain bbox
  function toWorld(mx: number, my: number): [number, number] {
    const b = three.current.bbox!
    const x = b.min.x + (mx / MAP_W) * (b.max.x - b.min.x)
    const zt = my / MAP_H
    const z = FLIP_Z
      ? b.max.z - zt * (b.max.z - b.min.z)
      : b.min.z + zt * (b.max.z - b.min.z)
    return [x, z]
  }
  function terrainY(x: number, z: number): number {
    const t = three.current
    if (!t.terrain || !t.raycaster || !t.bbox) return 0
    t.raycaster.set(new THREE.Vector3(x, t.bbox.max.y + 1, z), new THREE.Vector3(0, -1, 0))
    const hits = t.raycaster.intersectObject(t.terrain, true)
    return hits.length ? hits[0].point.y : (t.bbox.max.y + t.bbox.min.y) / 2
  }

  // ---------- scene ----------
  useEffect(() => {
    if (!modelUrl || !mountRef.current || three.current.renderer) return
    const mount = mountRef.current
    const t = three.current
    t.disposed = false

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b0714)
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.01, 50)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI * 0.44
    controls.minDistance = 0.35
    controls.maxDistance = 3.2

    scene.add(new THREE.AmbientLight(0x8877aa, 1.1))
    const key = new THREE.DirectionalLight(0xfff2dd, 1.6)
    key.position.set(1.5, 2.5, 1)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xb44df5, 0.5)
    rim.position.set(-2, 1, -1.5)
    scene.add(rim)

    t.scene = scene
    t.camera = camera
    t.renderer = renderer
    t.controls = controls
    t.raycaster = new THREE.Raycaster()
    t.markers = new THREE.Group()
    t.nodeMeshes = new Map()
    scene.add(t.markers)

    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    loader.load(
      modelUrl,
      (gltf) => {
        if (t.disposed) return
        scene.add(gltf.scene)
        t.terrain = gltf.scene
        t.bbox = new THREE.Box3().setFromObject(gltf.scene)
        const c = t.bbox.getCenter(new THREE.Vector3())
        controls.target.copy(c)
        camera.position.set(c.x, t.bbox.max.y + 1.1, t.bbox.max.z + 1.15)
        setStatus("")
      },
      undefined,
      () => setStatus("The diorama failed to load — check the model URL."),
    )

    function resize() {
      const w = mount.clientWidth
      const h = Math.max(320, Math.round(w * 0.56))
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    const clock = new THREE.Clock()
    renderer.setAnimationLoop(() => {
      const el = clock.getElapsedTime()
      if (t.partyMarker) t.partyMarker.children[0].position.y = 0.012 + Math.sin(el * 3) * 0.004
      controls.update()
      renderer.render(scene, camera)
    })

    function onClick(ev: MouseEvent) {
      if (!t.nodeMeshes || !t.camera) return
      const r = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((ev.clientX - r.left) / r.width) * 2 - 1,
        -((ev.clientY - r.top) / r.height) * 2 + 1,
      )
      t.raycaster!.setFromCamera(ndc, t.camera)
      const hits = t.raycaster!.intersectObjects([...t.nodeMeshes.values()], true)
      if (hits.length) {
        let obj: THREE.Object3D | null = hits[0].object
        while (obj && !obj.userData.nodeId) obj = obj.parent
        if (obj) {
          const id = obj.userData.nodeId as string
          setSelected((cur) => {
            const found = (nodesRef.current || []).find((n) => n.id === id)
            return found ?? cur
          })
        }
      }
    }
    renderer.domElement.addEventListener("click", onClick)

    return () => {
      t.disposed = true
      renderer.setAnimationLoop(null)
      renderer.domElement.removeEventListener("click", onClick)
      ro.disconnect()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      three.current = {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl])

  // keep a ref of nodes for event handlers
  const nodesRef = useRef<NodeRow[]>([])
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  // ---------- node markers ----------
  useEffect(() => {
    const t = three.current
    if (!t.markers || !t.terrain || !t.bbox) return
    t.markers.clear()
    t.nodeMeshes!.clear()
    const ringGeo = new THREE.TorusGeometry(0.024, 0.005, 8, 32)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf5c34d })
    for (const n of nodes) {
      if (n.node_type !== "location" || typeof n.metadata?.map_x !== "number") continue
      const [x, z] = toWorld(n.metadata.map_x, n.metadata.map_y)
      const y = terrainY(x, z)
      const g = new THREE.Group()
      g.position.set(x, y + 0.008, z)
      g.userData.nodeId = n.id
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = -Math.PI / 2
      g.add(ring)
      t.markers.add(g)
      t.nodeMeshes!.set(n.id, g)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, modelUrl, status])

  // ---------- party marker + walk ----------
  useEffect(() => {
    const t = three.current
    if (!t.scene || !t.terrain || !t.bbox || !party) return
    const node = nodes.find((n) => n.id === party.node_id)
    if (!node || typeof node.metadata?.map_x !== "number") return
    const [x, z] = toWorld(node.metadata.map_x, node.metadata.map_y)
    const y = terrainY(x, z)

    if (!t.partyMarker) {
      const g = new THREE.Group()
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffb347 }),
      )
      body.position.y = 0.012
      g.add(body)
      const light = new THREE.PointLight(0xffb347, 0.9, 0.35)
      light.position.y = 0.05
      g.add(light)
      t.scene.add(g)
      t.partyMarker = g
      g.position.set(x, y, z)
      prevPartyNode.current = party.node_id
      return
    }

    if (prevPartyNode.current === party.node_id) return
    prevPartyNode.current = party.node_id

    // walk: sample a straight line in map space, ride the terrain heights
    if (walkAnim.current) cancelAnimationFrame(walkAnim.current)
    const from = t.partyMarker.position.clone()
    const steps: THREE.Vector3[] = []
    const N = 60
    for (let i = 1; i <= N; i++) {
      const px = from.x + ((x - from.x) * i) / N
      const pz = from.z + ((z - from.z) * i) / N
      steps.push(new THREE.Vector3(px, terrainY(px, pz), pz))
    }
    const T = 3200
    const t0 = performance.now()
    const tick = (now: number) => {
      let u = Math.min(1, (now - t0) / T)
      u = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
      const idx = Math.min(N - 1, Math.floor(u * N))
      t.partyMarker!.position.copy(steps[idx])
      t.controls!.target.lerp(steps[idx], 0.06)
      if (u < 1) walkAnim.current = requestAnimationFrame(tick)
    }
    walkAnim.current = requestAnimationFrame(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party?.node_id, nodes, status])

  const partyHere = selected && party && selected.id === party.node_id

  return (
    <div className="min-h-screen bg-[#0b0714] text-[#e8e0f0] p-3 font-mono">
      <div className="flex items-center justify-between flex-wrap gap-2 pb-3">
        <h1 className="text-[#f5c34d] text-lg tracking-widest" style={{ textShadow: "0 0 12px #f5c34d55" }}>
          THE UNDERDARK — DIORAMA
        </h1>
        <div className="text-xs text-[#9a8fb0]">drag to orbit · scroll to zoom · click a gold ring</div>
      </div>
      <div ref={mountRef} className="rounded-lg overflow-hidden border-[3px] border-[#2b2040] bg-[#05030a]" />
      <div className="mt-3 rounded-lg border-2 border-[#3a2c56] bg-[#171024ee] p-4 min-h-[64px] text-sm">
        {status ? (
          <div className="text-[#9a8fb0]">{status}</div>
        ) : selected ? (
          <>
            <div className="text-[#f5c34d] font-bold tracking-widest">
              {selected.name.toUpperCase()}
              {partyHere && <span className="text-xs ml-3">&#9670; PARTY IS HERE</span>}
            </div>
            {selected.description && <div className="text-[#9a8fb0] mt-1">{selected.description}</div>}
          </>
        ) : (
          <div className="text-[#9a8fb0]">Click a gold ring to inspect a location. The party's torch burns where they stand.</div>
        )}
      </div>
    </div>
  )
}
