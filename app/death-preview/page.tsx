"use client"

// DEV PREVIEW ONLY — the thirteen deaths, side by side, on demand.
//
// A death happens once, to one creature, at the end of a fight nobody can
// schedule. Reviewing them by playing the game means staging thirteen kills
// with thirteen different damage types, which is not review, it is luck.
//
// So this stands thirteen bodies on a floor and kills them all at once. Every
// one is the SAME code path the board runs: deathSceneVfx, resolving its body
// through the same kind of lookup, driven by the same VfxHandle pump.

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { deathSceneVfx } from "@/components/tactical/death-vfx"
import { DEATH_LABEL, type DeathKind } from "@/lib/damage-type"
import type { VfxHandle } from "@/components/tactical/spell-vfx"

const KINDS: DeathKind[] = [
  "burn", "burst", "melt", "char", "raise", "freeze", "mangle",
  "impale", "sleep", "anguish", "ashes", "wither", "collapse",
]

/** What each one is FOR, so the grid can be read without the source open. */
const CAUSE: Record<DeathKind, string> = {
  burn: "fire", burst: "force / thunder", melt: "acid", char: "lightning",
  raise: "necrotic", freeze: "cold", mangle: "slashing / bludgeoning",
  impale: "piercing", sleep: "drow poison / Sleep", anguish: "psychic",
  ashes: "radiant", wither: "poison", collapse: "a PLAYER at 0",
}

const COLS = 5
const GAP = 2.6

export default function DeathPreview() {
  const host = useRef<HTMLDivElement | null>(null)
  const [run, setRun] = useState(0)
  const fire = useRef<(() => void) | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a0d)
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 200)
    camera.position.set(0, 7.5, 13)
    camera.lookAt(0, 0.6, -1.4)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    el.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const key = new THREE.DirectionalLight(0xfff0dd, 1.5)
    key.position.set(4, 9, 6)
    scene.add(key)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x1d1c22, roughness: 1 }),
    )
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)

    // A stand-in body. Not a GLB: the point is the TREATMENT, and a capsule
    // shows a lean, a sink and a stain more legibly than a costume does.
    const bodies = new Map<DeathKind, THREE.Object3D>()
    const place = () => {
      for (const [, b] of bodies) scene.remove(b)
      bodies.clear()
      KINDS.forEach((kind, i) => {
        const g = new THREE.Group()
        const torso = new THREE.Mesh(
          new THREE.CylinderGeometry(0.26, 0.32, 0.9, 18),
          new THREE.MeshStandardMaterial({ color: 0x9c7f5e, roughness: 0.75 }),
        )
        torso.position.y = 0.45
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 20, 14),
          new THREE.MeshStandardMaterial({ color: 0xc4a07a, roughness: 0.7 }),
        )
        head.position.y = 1.08
        g.add(torso, head)
        const col = i % COLS
        const rowIx = Math.floor(i / COLS)
        g.position.set((col - (COLS - 1) / 2) * GAP, 0, rowIx * GAP - 2.2)
        scene.add(g)
        bodies.set(kind, g)
      })
    }
    place()

    const vfx: VfxHandle[] = []
    const kill = () => {
      vfx.forEach((v) => v.dispose())
      vfx.length = 0
      place()
      for (const kind of KINDS) {
        const body = bodies.get(kind)
        if (!body) continue
        vfx.push(deathSceneVfx({
          parent: scene,
          position: body.position.clone(),
          kind,
          scale: 1,
          // Same contract the board uses — resolved every frame, so a body
          // swapped underneath the effect is picked up rather than lost.
          resolve: () => bodies.get(kind) ?? null,
        }))
      }
    }
    fire.current = kill
    kill()

    const clock = new THREE.Clock()
    let raf = 0
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.1)
      for (let i = vfx.length - 1; i >= 0; i--) if (!vfx[i].update(dt)) vfx.splice(i, 1)
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, padding: "14px 18px" }}>
        <div style={{ letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12 }}>
          The thirteen deaths
        </div>
        <button
          onClick={() => { fire.current?.(); setRun((r) => r + 1) }}
          style={{
            border: "1px solid #6b5320", background: "linear-gradient(180deg,#241c10,#0b0906)",
            color: "#e0b53c", padding: "5px 14px", borderRadius: 3, cursor: "pointer",
            letterSpacing: "0.16em", textTransform: "uppercase", fontSize: 11,
          }}
        >
          Kill them again
        </button>
        <span style={{ fontSize: 11, opacity: 0.5 }}>run {run + 1}</span>
      </div>

      <div ref={host} style={{ width: "100%", height: "62vh" }} />

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: 6, padding: "12px 18px" }}>
        {KINDS.map((k) => (
          <div key={k} style={{ fontSize: 11, lineHeight: 1.5 }}>
            <span style={{ color: "#e0b53c", textTransform: "uppercase", letterSpacing: "0.1em" }}>{k}</span>
            <span style={{ opacity: 0.55 }}> — {CAUSE[k]}</span>
            <div style={{ opacity: 0.4, fontStyle: "italic" }}>{DEATH_LABEL[k]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
