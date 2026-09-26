"use client"

// DEV PREVIEW ONLY — the looks a condition puts on a body, side by side.
//
// A condition lands on one creature in a fight nobody can schedule, and
// reviewing what "burning" looks like means setting fire to someone at the
// table. So this stands a row of bodies and gives each a condition — the
// SAME code path the board runs, StatusVfx fed once a frame — so what looks
// right here looks right on the board.

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { StatusVfx, type StatusBody } from "@/components/tactical/status-vfx"
import { statusKindsOf } from "@/lib/status-kinds"

const LANES: { label: string; conditions: string[] }[] = [
  { label: "burning", conditions: ["Burning"] },
  { label: "charged", conditions: ["Lightning Charge"] },
  { label: "webbed", conditions: ["Restrained"] },
  { label: "prone", conditions: ["Prone"] },
  { label: "burning + prone", conditions: ["Burning", "Prone"] },
  { label: "webbed + charged", conditions: ["Webbed", "Charged"] },
  { label: "nothing", conditions: [] },
]
const GAP = 2.2

export default function StatusPreview() {
  const host = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a0d)
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 200)
    const q = new URLSearchParams(window.location.search)
    const triple = (key: string, fallback: [number, number, number]): [number, number, number] => {
      const v = q.get(key)?.split(",").map(Number)
      return v && v.length === 3 && v.every(Number.isFinite) ? (v as [number, number, number]) : fallback
    }
    camera.position.set(...triple("cam", [0, 4.2, 9]))
    camera.lookAt(...triple("look", [0, 0.6, 0]))

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    el.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const key = new THREE.DirectionalLight(0xfff0dd, 1.3)
    key.position.set(4, 9, 6)
    scene.add(key)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x1d1c22, roughness: 1 }))
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)
    const grid = new THREE.GridHelper(60, 60, 0x2a2830, 0x1f1e25)
    grid.position.y = 0.005
    scene.add(grid)

    // A stand-in shaped like the board's rigged models: a token group at the
    // square, with a body child that carries `userData.rest` — the stance the
    // board rewrites each frame, and the thing the prone pose pitches over.
    const bodies: StatusBody[] = []
    LANES.forEach((lane, i) => {
      const g = new THREE.Group()
      g.position.set((i - (LANES.length - 1) / 2) * GAP, 0, 0)
      const model = new THREE.Group()
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.9, 18), new THREE.MeshStandardMaterial({ color: 0x9c5e5e, roughness: 0.75 }))
      torso.position.y = 0.45
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), new THREE.MeshStandardMaterial({ color: 0xc4a07a, roughness: 0.7 }))
      head.position.y = 1.08
      model.add(torso, head)
      model.userData.rest = { x: 0, y: 0, z: 0, yaw: 0, height: 1.3 }
      g.add(model)
      scene.add(g)
      bodies.push({ id: `lane-${i}`, obj: g, kinds: statusKindsOf(lane.conditions), dead: false, moving: false })
    })

    const status = new StatusVfx(scene)
    const clock = new THREE.Clock()
    let raf = 0
    const step = (dt: number) => {
      // What the board does every frame for a standing model: reset the stance.
      for (const b of bodies) {
        const model = b.obj.children[0]
        model.position.set(0, 0, 0)
        model.rotation.set(0, 0, 0)
      }
      status.sync(bodies, dt, camera)
      renderer.render(scene, camera)
    }
    const tick = () => { step(Math.min(clock.getDelta(), 0.1)); raf = requestAnimationFrame(tick) }
    const w = window as unknown as { __statusStep?: (dt: number) => void }
    if (q.has("manual")) { w.__statusStep = step; step(0) } else tick()

    const onResize = () => {
      if (!el.clientWidth) return
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
    }
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      delete w.__statusStep
      cancelAnimationFrame(raf)
      status.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div style={{ minHeight: "100vh", background: "#07070a", color: "#cbbfa4", fontFamily: "Georgia, serif" }}>
      <div style={{ letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12, padding: "14px 18px" }}>
        The looks a condition puts on a body
      </div>
      <div ref={host} style={{ width: "100%", height: "66vh" }} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${LANES.length}, 1fr)`, gap: 6, padding: "12px 18px" }}>
        {LANES.map((l) => (
          <div key={l.label} style={{ fontSize: 11, lineHeight: 1.5 }}>
            <span style={{ color: "#e0b53c", textTransform: "uppercase", letterSpacing: "0.1em" }}>{l.label}</span>
            <div style={{ opacity: 0.4, fontStyle: "italic" }}>{l.conditions.join(", ") || "—"}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
