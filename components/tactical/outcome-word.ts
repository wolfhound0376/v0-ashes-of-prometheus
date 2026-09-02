// ============================================================================
// OUTCOME WORD — "SAVED", "MISS", the things a zero means.
//
// A number rises when hit points move. Nothing rose when they did not, and
// that silence was reported as a bug: "No damage was dealt." The truth was a
// save — Scott rolled 20 against DC 13 and took nothing, exactly as Toll the
// Dead says he should. But a correct save and a broken spell looked identical
// from the table, and the roll that explained it went to a combat log that is
// closed by default.
//
// So a zero now says what KIND of zero it was, in the same place and the same
// motion as a damage number. Same sprite approach as damage-numbers.ts, for
// the same reason: it has to be right under every camera the board has.
// ============================================================================

import * as THREE from "three"
import type { VfxHandle } from "./spell-vfx"

const LIFE = 1.25
const RISE = 1.2
const CANVAS_W = 320
const CANVAS_H = 120

export type Outcome = "saved" | "miss" | "immune"

const LOOK: Record<Outcome, { fill: string; ink: string; glow: string; text: string }> = {
  // Steel blue: the target did something right. Not a failure state, and not
  // coloured like one.
  saved:  { fill: "#bcd8f5", ink: "#0a1826", glow: "#5f9fd8", text: "SAVED" },
  // Grey: nothing happened to anybody.
  miss:   { fill: "#d8d4c8", ink: "#1a1815", glow: "#8a8578", text: "MISS" },
  immune: { fill: "#e0c8ff", ink: "#1c0a30", glow: "#9a6bd6", text: "NO EFFECT" },
}

function paint(o: Outcome): HTMLCanvasElement {
  const c = document.createElement("canvas")
  c.width = CANVAS_W
  c.height = CANVAS_H
  const g = c.getContext("2d")
  if (!g) return c
  const L = LOOK[o]

  g.font = `700 54px var(--font-display), Georgia, "Times New Roman", serif`
  g.textAlign = "center"
  g.textBaseline = "middle"
  const cx = CANVAS_W / 2
  const cy = CANVAS_H / 2

  g.shadowColor = L.glow
  g.shadowBlur = 18
  g.fillStyle = L.glow
  for (let i = 0; i < 2; i++) g.fillText(L.text, cx, cy)
  g.shadowBlur = 0

  g.lineWidth = 7
  g.lineJoin = "round"
  g.strokeStyle = L.ink
  g.strokeText(L.text, cx, cy)
  g.fillStyle = L.fill
  g.fillText(L.text, cx, cy)
  return c
}

/** One word, rising off the body that earned it. */
export function outcomeWordVfx(args: {
  parent: THREE.Object3D
  position: THREE.Vector3
  outcome: Outcome
  scale?: number
}): VfxHandle {
  const { parent, position, outcome, scale = 1 } = args
  const tex = new THREE.CanvasTexture(paint(outcome))
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0,
  })
  const sprite = new THREE.Sprite(mat)
  const base = 1.15 * scale
  sprite.scale.set(base * (CANVAS_W / CANVAS_H), base, 1)
  const start = position.clone().add(new THREE.Vector3(0, 1.45 * scale, 0))
  sprite.position.copy(start)
  sprite.renderOrder = 999
  parent.add(sprite)

  let t = 0
  return {
    update(dt: number) {
      t += dt
      const k = t / LIFE
      if (k >= 1) return false
      const ease = 1 - Math.pow(1 - k, 3)
      sprite.position.y = start.y + RISE * ease * scale
      mat.opacity = k < 0.08 ? k / 0.08 : k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1
      return true
    },
    dispose() {
      parent.remove(sprite)
      mat.dispose()
      tex.dispose()
    },
  }
}
