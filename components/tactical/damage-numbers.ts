// ============================================================================
// DAMAGE NUMBERS — the number that rises off the body.
//
// Sam's brief: "Damage should reflect briefly over the characters head that is
// affected and in a color that represents the type of damage."
//
// WHY A SPRITE AND NOT A DIV. The obvious build is an absolutely-positioned
// DOM element projected from world space each frame. It is also the wrong one
// here: the board already owns a render loop, a camera that orbits and drops
// into first person, and an orthographic mode. A DOM overlay has to be told
// about all three, every frame, and it desynchronises the moment the camera
// moves between the projection and the paint. A sprite lives in the scene, so
// it is correct under every camera the board has — including the ones that do
// not exist yet.
//
// It also satisfies VfxHandle, which means the board's existing effects array
// advances and disposes it alongside everything else. No new lifecycle.
//
// FRAME BUDGET. One canvas, one texture, one sprite per number, all disposed
// when it finishes. Nothing allocates per frame.
// ============================================================================

import * as THREE from "three"
import type { VfxHandle } from "./spell-vfx"
import type { DamageType } from "./spell-vfx-kit"

/**
 * The colour of each kind of harm.
 *
 * Chosen to be legible against a dark dungeon floor FIRST and evocative
 * second — a necrotic violet that disappears into the shadows is a worse
 * necrotic than one that reads. Each is paired with a darker ink for the
 * outline so the glyph holds its shape over torchlight, blood, and node
 * backdrop art alike.
 */
const IDENT: Record<DamageType, { fill: string; ink: string; glow: string }> = {
  fire:      { fill: "#ff9a3c", ink: "#3a1202", glow: "#ff5a1e" },
  cold:      { fill: "#a8e6ff", ink: "#062634", glow: "#3f9fd6" },
  lightning: { fill: "#ffe45c", ink: "#33280a", glow: "#fff0a0" },
  thunder:   { fill: "#b8d4ff", ink: "#0b1a33", glow: "#5ea8ff" },
  acid:      { fill: "#a8e04a", ink: "#16290a", glow: "#7fd44a" },
  poison:    { fill: "#78d878", ink: "#0d2610", glow: "#3fa03f" },
  necrotic:  { fill: "#b98cf0", ink: "#1c0a30", glow: "#7b2fd6" },
  radiant:   { fill: "#ffe3a0", ink: "#3a2606", glow: "#ffb42e" },
  force:     { fill: "#e0c8ff", ink: "#22103a", glow: "#a97fff" },
  psychic:   { fill: "#ff8fd8", ink: "#340f28", glow: "#ff4fb8" },
  physical:  { fill: "#f0e6d4", ink: "#241b10", glow: "#c9b48a" },
  healing:   { fill: "#7df08e", ink: "#082a14", glow: "#33c94d" },
  eldritch:  { fill: "#d09aff", ink: "#22083a", glow: "#8a2fd6" },
  // Fog harms nobody, so no number is ever typed with it; the table is keyed
  // by the kit's whole union and this row is what keeps it honest.
  fog:       { fill: "#d9dfe8", ink: "#1a2028", glow: "#98a6b8" },
}

/** A number nobody typed a colour for still gets one. */
const FALLBACK = IDENT.physical

export interface DamageNumberArgs {
  parent: THREE.Object3D
  /** Where the body is. The number starts above this and rises. */
  position: THREE.Vector3
  /** Magnitude. The sign is decided by `heals`, not by the caller. */
  amount: number
  type: DamageType
  /** Renders "+N" in green and ignores `type`. */
  heals?: boolean
  /** Bigger, rimmed in white-gold, and it punches on arrival. */
  crit?: boolean
  /** Scales with the token, so an ogre's number is not a pixie's. */
  scale?: number
}

const LIFE = 1.15        // seconds on screen
const RISE = 1.5         // world units travelled upward over that life
const CANVAS_W = 256
const CANVAS_H = 160

/**
 * Paint the glyph once, into its own canvas.
 *
 * Drawn at high resolution and scaled DOWN by the sprite, rather than drawn
 * small and scaled up: magnified text reads as a blurry artefact of the
 * engine, and the whole point of this feature is that the number is
 * unmistakable in the half-second it exists.
 */
function paint(
  text: string,
  ident: { fill: string; ink: string; glow: string },
  crit: boolean,
): HTMLCanvasElement {
  const c = document.createElement("canvas")
  c.width = CANVAS_W
  c.height = CANVAS_H
  const g = c.getContext("2d")
  if (!g) return c

  const size = crit ? 104 : 82
  // The board's display face when it has one, falling back through the serif
  // stack. A damage number in the browser's default sans belongs to a
  // different game than the one around it.
  g.font = `700 ${size}px var(--font-display), Georgia, "Times New Roman", serif`
  g.textAlign = "center"
  g.textBaseline = "middle"

  const cx = CANVAS_W / 2
  const cy = CANVAS_H / 2

  // Glow first, underneath everything, as several soft passes rather than one
  // hard shadow — a single shadowBlur reads as a smudge at this size.
  g.shadowColor = ident.glow
  g.shadowBlur = crit ? 34 : 22
  g.fillStyle = ident.glow
  for (let i = 0; i < 3; i++) g.fillText(text, cx, cy)
  g.shadowBlur = 0

  // The dark rim that keeps the glyph legible over torchlight and blood.
  g.lineWidth = crit ? 11 : 9
  g.lineJoin = "round"
  g.strokeStyle = ident.ink
  g.strokeText(text, cx, cy)

  g.fillStyle = ident.fill
  g.fillText(text, cx, cy)

  // A critical wears a second, brighter rim inside the first. It is the only
  // time two strokes are worth the pixels.
  if (crit) {
    g.lineWidth = 2.5
    g.strokeStyle = "#fff4c8"
    g.strokeText(text, cx, cy)
  }

  return c
}

/**
 * One number, rising and fading.
 *
 * The horizontal drift is not decoration. Two creatures caught by the same
 * Fireball on the same frame would otherwise stack their numbers into an
 * illegible smear; a small random lateral push means simultaneous numbers
 * fan out instead of colliding.
 */
export function damageNumberVfx(args: DamageNumberArgs): VfxHandle {
  const { parent, position, amount, type, heals = false, crit = false, scale = 1 } = args

  const ident = heals ? IDENT.healing : (IDENT[type] ?? FALLBACK)
  const text = `${heals ? "+" : ""}${Math.abs(Math.round(amount))}`

  const canvas = paint(text, ident, crit)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,   // a number behind a pillar is a number nobody reads
    depthWrite: false,
    opacity: 0,
  })
  const sprite = new THREE.Sprite(mat)

  // A square is 1.0 world unit, so this is "about as tall as a creature's
  // head is wide" — big enough to read across the table on a shared screen,
  // small enough not to hide the miniature it belongs to.
  //
  // Sam, at the board: a little bigger. 1.55 was sized against a single
  // miniature in a test scene; in a real fight the number appears over a
  // crowd, at a camera pitch that foreshortens it, and it was getting lost.
  // Up about a fifth. The crit keeps its 1.29x lead over the ordinary hit,
  // because that ratio is what makes a crit read as a crit rather than just
  // as a big number.
  const base = (crit ? 2.4 : 1.86) * scale
  const aspect = CANVAS_W / CANVAS_H
  sprite.scale.set(base * aspect, base, 1)

  const drift = (Math.random() - 0.5) * 0.55
  const driftZ = (Math.random() - 0.5) * 0.35
  const start = position.clone().add(new THREE.Vector3(drift, 1.35 * scale, driftZ))
  sprite.position.copy(start)
  sprite.renderOrder = 999
  parent.add(sprite)

  let t = 0

  return {
    update(dt: number) {
      t += dt
      const k = t / LIFE
      if (k >= 1) return false

      // Rise fast, then coast. easeOutCubic — the number leaves the body with
      // the force of the blow and settles as it fades.
      const ease = 1 - Math.pow(1 - k, 3)
      sprite.position.set(
        start.x + drift * ease * 0.6,
        start.y + RISE * ease * scale,
        start.z + driftZ * ease * 0.6,
      )

      // In fast, hold, out slow. The hold is what makes it readable; a number
      // that is fading the whole time never has a legible frame.
      const alpha = k < 0.08 ? k / 0.08 : k > 0.62 ? 1 - (k - 0.62) / 0.38 : 1
      mat.opacity = Math.max(0, Math.min(1, alpha))

      // The critical's punch: overshoot on arrival, settled by a fifth of life.
      if (crit && k < 0.2) {
        const p = 1 + 0.35 * (1 - k / 0.2)
        sprite.scale.set(base * aspect * p, base * p, 1)
      }

      return true
    },
    dispose() {
      parent.remove(sprite)
      mat.dispose()
      tex.dispose()
    },
  }
}
