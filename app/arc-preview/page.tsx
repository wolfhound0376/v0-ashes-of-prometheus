"use client"

// DEV PREVIEW ONLY — every swing arc, side by side, on demand.
//
// Judging a swing by playing the game means rolling initiative, closing to
// melee and hoping the creature you wanted to watch is holding the weapon you
// wanted to see. That is not review, it is luck — the same reason
// /death-preview exists, and this is built to the same shape.
//
// So this stands one fighter per weapon archetype on a floor and walks all of
// them through the full three-blow chain: opening cut, answering backhand,
// finisher. Every arc is drawn by the SAME weaponArcVfx the board calls, fed
// by the SAME styleFor table, traced off a real moving object exactly as it
// traces a real hand bone — so what you see here is what lands in a fight.
//
// The arm is a stand-in, not a Meshy rig. It sweeps along the style's own
// path, which is roughly what an attack clip does and is entirely legible;
// against a real clip the ribbon follows the clip instead, because it traces
// whatever it is given.

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { weaponArcVfx, ARC_STEEL, ARC_CRIT } from "@/components/tactical/weapon-arc"
import { styleFor, type ComboStep } from "@/lib/melee-combo"
import { proxyGeometry, type Archetype } from "@/lib/equipment"
import type { VfxHandle } from "@/components/tactical/spell-vfx"

/** The archetypes that get swung. A bow is not one of them. */
const ARCHETYPES: Archetype[] = ["blade", "dagger", "axe", "mace", "spear", "staff", "empty"]

const LABEL: Record<string, string> = {
  blade: "longsword", dagger: "dagger", axe: "greataxe", mace: "mace",
  spear: "shortspear", staff: "quarterstaff", empty: "unarmed",
}

const GAP = 2.4
/** Seconds between one blow of the chain and the next. */
const BEAT = 0.95
/** Matches weapon-arc's own LEAD_S + TAIL_S: how long the arm takes to cross. */
const SWEEP = 0.36

export default function ArcPreview() {
  const host = useRef<HTMLDivElement | null>(null)
  const [step, setStep] = useState<ComboStep>(0)
  const [crit, setCrit] = useState(false)
  const swing = useRef<((crit: boolean) => void) | null>(null)
  const critRef = useRef(false)
  critRef.current = crit

  useEffect(() => {
    const el = host.current
    if (!el) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a0d)
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 200)
    camera.position.set(0, 3.4, 9.5)
    camera.lookAt(0, 1.0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    el.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const key = new THREE.DirectionalLight(0xfff0dd, 1.3)
    key.position.set(3, 8, 7)
    scene.add(key)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x1d1c22, roughness: 1 }),
    )
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)

    /** One fighter: a body, a shoulder pivot, and something in the fist. */
    interface Figure {
      archetype: Archetype
      body: THREE.Group
      pivot: THREE.Object3D
      blade: THREE.Object3D
    }
    const figures: Figure[] = ARCHETYPES.map((archetype, i) => {
      const body = new THREE.Group()
      const torso = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.26, 0.8, 16),
        new THREE.MeshStandardMaterial({ color: 0x6d6a78, roughness: 0.8 }),
      )
      torso.position.y = 0.4
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 18, 12),
        new THREE.MeshStandardMaterial({ color: 0x8e8a99, roughness: 0.75 }),
      )
      head.position.y = 0.95
      body.add(torso, head)

      // The shoulder. The arc traces what hangs off this, so this is what has
      // to move — there is no mixer here to move it for us.
      const pivot = new THREE.Object3D()
      pivot.position.set(0.22, 0.78, 0.1)
      body.add(pivot)

      // An unarmed figure still needs something to trace: a fist.
      const blade = archetype === "empty"
        ? new THREE.Mesh(
            new THREE.SphereGeometry(0.075, 12, 10),
            new THREE.MeshStandardMaterial({ color: 0xc4a07a, roughness: 0.7 }),
          )
        : proxyGeometry(archetype)
      if (archetype !== "empty") blade.scale.setScalar(0.85)
      pivot.add(blade)

      body.position.set((i - (ARCHETYPES.length - 1) / 2) * GAP, 0, 0)
      // Facing the camera, so every arc is seen side-on rather than foreshortened.
      body.rotation.y = Math.PI
      scene.add(body)
      return { archetype, body, pivot, blade }
    })

    const vfx: VfxHandle[] = []
    /** Arms mid-sweep: which style they are following and how far through. */
    const sweeping: { fig: Figure; style: ReturnType<typeof styleFor>; t: number }[] = []

    const fire = (which: ComboStep, isCrit: boolean) => {
      for (const fig of figures) {
        const style = styleFor(fig.archetype, which)
        sweeping.push({ fig, style, t: 0 })
        vfx.push(weaponArcVfx({
          parent: scene,
          body: fig.body,
          blade: fig.blade,
          style,
          // The arc leads its contact frame by 0.24s, so naming 0.24 here
          // starts the sweep on this very frame — same as the arm.
          contact: 0.24,
          linger: 0.45,
          tint: isCrit ? ARC_CRIT : ARC_STEEL,
        }))
      }
    }
    swing.current = (isCrit: boolean) => fire(0, isCrit)

    // The chain, on a loop: cut, answer, finish, pause, again.
    let next = 0
    let which: ComboStep = 0
    const clock = new THREE.Clock()
    let raf = 0
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.1)

      next -= dt
      if (next <= 0) {
        fire(which, critRef.current)
        setStep(which)
        which = ((which + 1) % 3) as ComboStep
        // A breath after the finisher, so the chain reads as a chain.
        next = which === 0 ? BEAT * 2.2 : BEAT
      }

      // Move the arms. Eased the same way the arc eases its own sweep, so the
      // ribbon bunches at the ends the way a real trail does.
      for (let i = sweeping.length - 1; i >= 0; i--) {
        const s = sweeping[i]
        s.t += dt / SWEEP
        const t = Math.min(1, s.t)
        const e = t * t * (3 - 2 * t)
        const theta = s.style.from + (s.style.to - s.style.from) * e
        s.fig.pivot.rotation.z = theta - Math.PI / 2
        s.fig.pivot.rotation.x = -s.style.tilt
        if (t >= 1) sweeping.splice(i, 1)
      }

      for (let i = vfx.length - 1; i >= 0; i--) {
        if (vfx[i].update(dt)) continue
        vfx[i].dispose()
        vfx.splice(i, 1)
      }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    tick()

    const onResize = () => {
      if (!el.clientWidth) return
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
    }
    window.addEventListener("resize", onResize)

    return () => {
      window.removeEventListener("resize", onResize)
      cancelAnimationFrame(raf)
      vfx.forEach((v) => v.dispose())
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div style={{ minHeight: "100vh", background: "#07070a", color: "#cbbfa4", fontFamily: "Georgia, serif" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, padding: "14px 18px", flexWrap: "wrap" }}>
        <div style={{ letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12 }}>
          Melee arcs — the three-blow chain
        </div>
        <button
          onClick={() => swing.current?.(critRef.current)}
          style={{
            border: "1px solid #6b5320", background: "linear-gradient(180deg,#241c10,#0b0906)",
            color: "#e0b53c", padding: "5px 14px", borderRadius: 3, cursor: "pointer",
            letterSpacing: "0.16em", textTransform: "uppercase", fontSize: 11,
          }}
        >
          Swing now
        </button>
        <label style={{ fontSize: 11, opacity: 0.7, cursor: "pointer" }}>
          <input type="checkbox" checked={crit} onChange={(e) => setCrit(e.target.checked)} /> critical (gold)
        </label>
        <span style={{ fontSize: 11, opacity: 0.55 }}>
          now playing — blow {step + 1} of 3
        </span>
      </div>

      <div ref={host} style={{ width: "100%", height: "58vh" }} />

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${ARCHETYPES.length}, 1fr)`, gap: 6, padding: "12px 18px" }}>
        {ARCHETYPES.map((a) => (
          <div key={a} style={{ fontSize: 11, lineHeight: 1.5 }}>
            <span style={{ color: "#e0b53c", textTransform: "uppercase", letterSpacing: "0.1em" }}>{LABEL[a]}</span>
            {([0, 1, 2] as ComboStep[]).map((s) => (
              <div key={s} style={{ opacity: s === step ? 0.9 : 0.35, fontStyle: "italic" }}>
                {s + 1}. {styleFor(a, s).name}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
