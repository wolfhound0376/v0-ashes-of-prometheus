"use client"

// DEV PREVIEW ONLY — every cast, side by side, on demand.
//
// A spell is cast once, by one caster, at one target, in a fight nobody can
// schedule. Reviewing the projectiles by playing the game means staging nine
// casts of nine damage types, which is not review, it is luck.
//
// So this stands a row of casters, a target in front of each, and fires them
// all at once. Every lane is the SAME code path the board runs:
// castSpellKitVfx, anchored to a hand, driven by the same VfxHandle pump —
// so what looks right here looks right on the board.

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { castSpellKitVfx, prewarmKit, type CastHandle, type DamageType } from "@/components/tactical/spell-vfx-kit"

const LANES: { type: DamageType; spell?: string; label: string; how: string }[] = [
  { type: "fire",      spell: "fire bolt",     label: "fire",      how: "lobbed — rises and falls" },
  { type: "force",     spell: "magic missile", label: "force",     how: "weaves — hunts the target" },
  { type: "poison",                            label: "poison",    how: "lobbed glob" },
  { type: "psychic",                           label: "psychic",   how: "drifts — corkscrews in" },
  { type: "radiant",   spell: "guiding bolt",  label: "radiant",   how: "attack roll: a straight dart" },
  { type: "cold",      spell: "ray of frost",  label: "cold",      how: "beam" },
  { type: "lightning",                         label: "lightning", how: "beam" },
  { type: "thunder",                           label: "thunder",   how: "radiates" },
  { type: "physical",                          label: "physical",  how: "impact only — steel sparks" },
  { type: "healing",   spell: "healing word",  label: "healing",   how: "luminescence around the target" },
  { type: "psychic",   spell: "vicious mockery", label: "mockery", how: "ghosts laughing around the target" },
]

const GAP = 2.3
const RANGE = 6   // squares from hand to target

export default function CastPreview() {
  const host = useRef<HTMLDivElement | null>(null)
  const [run, setRun] = useState(0)
  const fire = useRef<(() => void) | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a0d)
    const camera = new THREE.PerspectiveCamera(46, el.clientWidth / el.clientHeight, 0.1, 200)
    // ?cam=x,y,z&look=x,y,z moves the eye, to get close to one lane.
    const q = new URLSearchParams(window.location.search)
    const triple = (key: string, fallback: [number, number, number]): [number, number, number] => {
      const v = q.get(key)?.split(",").map(Number)
      return v && v.length === 3 && v.every(Number.isFinite) ? (v as [number, number, number]) : fallback
    }
    camera.position.set(...triple("cam", [10, 8.5, 14]))
    camera.lookAt(...triple("look", [0, 0.5, 0]))

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    el.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const key = new THREE.DirectionalLight(0xfff0dd, 1.3)
    key.position.set(4, 9, 6)
    scene.add(key)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x1d1c22, roughness: 1 }),
    )
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)
    const grid = new THREE.GridHelper(60, 60, 0x2a2830, 0x1f1e25)
    grid.position.y = 0.005
    scene.add(grid)

    // Stand-ins: a capsule for the caster with a hand at chest height, and
    // a capsule for whatever is on the receiving end.
    const body = (color: number) => {
      const g = new THREE.Group()
      const torso = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.32, 0.9, 18),
        new THREE.MeshStandardMaterial({ color, roughness: 0.75 }),
      )
      torso.position.y = 0.45
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 20, 14),
        new THREE.MeshStandardMaterial({ color: 0xc4a07a, roughness: 0.7 }),
      )
      head.position.y = 1.08
      g.add(torso, head)
      return g
    }

    const hands: THREE.Object3D[] = []
    const targets: THREE.Vector3[] = []
    LANES.forEach((_, i) => {
      const x = (i - (LANES.length - 1) / 2) * GAP
      const caster = body(0x5e6f9c)
      caster.position.set(x, 0, RANGE / 2)
      const hand = new THREE.Object3D()
      hand.position.set(0.28, 0.95, -0.2)
      caster.add(hand)
      scene.add(caster)
      hands.push(hand)
      const dummy = body(0x9c5e5e)
      dummy.position.set(x, 0, -RANGE / 2)
      scene.add(dummy)
      targets.push(new THREE.Vector3(x, 0.7, -RANGE / 2))
    })

    const vfx: CastHandle[] = []
    const cast = () => {
      vfx.forEach((v) => v.dispose())
      vfx.length = 0
      LANES.forEach((lane, i) => {
        prewarmKit(lane.type)
        vfx.push(castSpellKitVfx({
          parent: scene,
          anchor: hands[i],
          type: lane.type,
          target: targets[i],
          camera,
          spell: lane.spell,
          seed: i + 1,
        }))
      })
    }
    fire.current = cast
    cast()

    const params = new URLSearchParams(window.location.search)
    const auto = params.has("loop")
    let sinceCast = 0
    const clock = new THREE.Clock()
    let raf = 0
    const step = (dt: number) => {
      for (let i = vfx.length - 1; i >= 0; i--) if (!vfx[i].update(dt)) vfx.splice(i, 1)
      renderer.render(scene, camera)
    }
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.1)
      step(dt)
      if (auto && (sinceCast += dt) > 3.2) { sinceCast = 0; cast() }
      raf = requestAnimationFrame(tick)
    }
    // ?manual hands the clock to whoever is driving the page — a screenshot
    // script steps the effects by a fixed dt and photographs exact moments,
    // which a wall clock on a software renderer cannot hit.
    const manual = params.has("manual")
    const w = window as unknown as { __castStep?: (dt: number) => void; __castAgain?: () => void }
    if (manual) {
      w.__castStep = step
      w.__castAgain = cast
      step(0)
    } else {
      tick()
    }

    const onResize = () => {
      if (!el.clientWidth) return
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
    }
    window.addEventListener("resize", onResize)

    return () => {
      window.removeEventListener("resize", onResize)
      delete w.__castStep
      delete w.__castAgain
      cancelAnimationFrame(raf)
      vfx.forEach((v) => v.dispose())
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div style={{ minHeight: "100vh", background: "#07070a", color: "#cbbfa4", fontFamily: "Georgia, serif" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, padding: "14px 18px" }}>
        <div style={{ letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12 }}>
          The casts
        </div>
        <button
          onClick={() => { fire.current?.(); setRun((r) => r + 1) }}
          style={{
            border: "1px solid #6b5320", background: "linear-gradient(180deg,#241c10,#0b0906)",
            color: "#e0b53c", padding: "5px 14px", borderRadius: 3, cursor: "pointer",
            letterSpacing: "0.16em", textTransform: "uppercase", fontSize: 11,
          }}
        >
          Cast again
        </button>
        <span style={{ fontSize: 11, opacity: 0.5 }}>run {run + 1} · add ?loop to the URL to recast every few seconds</span>
      </div>

      <div ref={host} style={{ width: "100%", height: "66vh" }} />

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${LANES.length}, 1fr)`, gap: 6, padding: "12px 18px" }}>
        {LANES.map((l) => (
          <div key={l.type} style={{ fontSize: 11, lineHeight: 1.5 }}>
            <span style={{ color: "#e0b53c", textTransform: "uppercase", letterSpacing: "0.1em" }}>{l.label}</span>
            {l.spell && <span style={{ opacity: 0.55 }}> — {l.spell}</span>}
            <div style={{ opacity: 0.4, fontStyle: "italic" }}>{l.how}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
