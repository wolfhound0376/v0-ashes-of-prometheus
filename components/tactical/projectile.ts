import * as THREE from "three"
import type { VfxHandle } from "./spell-vfx"
import { aimPoint, flightTime } from "@/lib/projectile-aim"

// ============================================================================
// THE BOLT — an arrow you can actually see leave the bow.
//
// Sam: "we should be able to see an arrow projectile leaving the bow or
// crossbow. An arrow flies and a hit impales the target or misses them if
// missed."
//
// PROCEDURAL, NOT A SPRITE, and deliberately so. An arrow is a shaft with a
// head — a hard silhouette that has to point along its own travel — and a
// billboarded sprite sheet cannot do that: it always faces the camera, so an
// arrow drawn as a sprite looks like a dart hanging in the air. Every other
// effect on this board is a sprite because fire and frost have no fixed
// shape. Steel does.
//
// It also means this needs no art, which matters: of the twelve rigged models
// in the bucket, four have no animation clips at all and none has a "fire"
// clip. Waiting for art would mean waiting a long time for a bolt.
//
// Honours the VfxHandle contract, so the board's existing effect loop drives
// it and calls onImpact on the frame it lands — the same frame the damage,
// the number and the flinch are applied.
// ============================================================================

/** How far a bolt sinks into whatever it hits, in board units. */
const BITE = 0.18

// ============================================================================
// SAM'S ART, WHEN THE WEAPON IS A BOW OR A CROSSBOW (2026-10-15).
//
// Sam supplied painted flight art for an arrow and a crossbow bolt. The
// objection above still stands — a billboard cannot point along its travel —
// so this is NOT a billboard. It is one flat quad laid ALONG the flight line
// and spun about that line every frame so its face turns toward the camera
// (an axis-locked billboard, the way tracers are drawn). The head always
// leads, from any angle the free camera finds, and only the E heading of the
// pack is needed. Baked by scripts/vfx/bake_projectile_atlas.py.
//
// Everything else that is shot or thrown (slings, darts, javelins, a
// monster's spit) keeps the procedural shaft, as does the first bow shot of a
// page if its sheet has not finished loading — never a blank.
// ============================================================================

type ShaftKind = "arrow" | "crossbow-bolt"

/** Atlas cell size in px, 4x4 frames at 60 ms. Printed by the bake script. */
const SHAFTS: Record<ShaftKind, { cellW: number; cellH: number; drawnPx: number }> = {
  arrow: { cellW: 352, cellH: 112, drawnPx: 344 },
  "crossbow-bolt": { cellW: 264, cellH: 116, drawnPx: 256 },
}
const SHAFT_COLS = 4
const SHAFT_ROWS = 4
const SHAFT_FRAME_S = 0.06
/**
 * Board units per drawn pixel, the same for both, so a bolt is shorter than
 * an arrow because it was drawn shorter. 344 px of arrow comes to 0.62 — a
 * shade longer than the procedural shaft, which is what reads at tabletop
 * distance.
 */
const UNITS_PER_PX = 0.62 / 344

/** Which art a weapon looses, or null for the procedural shaft. Crossbow first: it contains "bow". */
export function shaftFor(weapon: string | null | undefined): ShaftKind | null {
  const w = (weapon ?? "").toLowerCase()
  if (/crossbow/.test(w)) return "crossbow-bolt"
  if (/\b(long|short)?bow\b|\barrow/.test(w)) return "arrow"
  return null
}

const shaftTex = new Map<ShaftKind, THREE.Texture>()
const shaftLoading = new Set<ShaftKind>()

/**
 * Start fetching a weapon's flight sheet. Call it when the attack begins, so
 * the sheet has landed by the release frame. Safe to call for any weapon and
 * as often as you like.
 */
export function prewarmShaft(weapon: string | null | undefined): void {
  const kind = shaftFor(weapon)
  if (!kind || shaftTex.has(kind) || shaftLoading.has(kind)) return
  shaftLoading.add(kind)
  new THREE.TextureLoader()
    .loadAsync(`/vfx/projectiles/${kind}.webp`)
    .then((tex: THREE.Texture) => {
      tex.colorSpace = THREE.SRGBColorSpace
      // Painted, not pixel art: linear filtering, unlike the spell sheets.
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
      tex.repeat.set(1 / SHAFT_COLS, 1 / SHAFT_ROWS)
      shaftTex.set(kind, tex)
    })
    .catch(() => { /* the procedural shaft stands in */ })
    .finally(() => shaftLoading.delete(kind))
}

/**
 * The painted shaft: a group pointing along +Z (like buildArrow) holding one
 * quad that lies along that axis. `roll` turns the quad's face to the camera;
 * `frame` steps the flight animation.
 */
function buildShaft(kind: ShaftKind, base: THREE.Texture) {
  const spec = SHAFTS[kind]
  const tex = base.clone()
  const geo = new THREE.PlaneGeometry(spec.cellW * UNITS_PER_PX, spec.cellH * UNITS_PER_PX)
  // The art points +X (heading E). Turn it so the head points +Z; the face
  // then looks along -X, which `roll` spins toward the camera.
  geo.rotateY(-Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
  })
  const quad = new THREE.Mesh(geo, mat)
  const group = new THREE.Group()
  group.add(quad)
  const local = new THREE.Vector3()
  return {
    group,
    frame(i: number) {
      const f = i % (SHAFT_COLS * SHAFT_ROWS)
      // Row 0 of the atlas is the top of the image; UV v runs bottom-up.
      tex.offset.set((f % SHAFT_COLS) / SHAFT_COLS, 1 - (Math.floor(f / SHAFT_COLS) + 1) / SHAFT_ROWS)
    },
    roll(camera: THREE.Camera) {
      group.updateMatrixWorld()
      local.setFromMatrixPosition(camera.matrixWorld)
      group.worldToLocal(local)
      // Spin about the flight axis (+Z) so the face (-X) points at the camera.
      if (local.x * local.x + local.y * local.y > 1e-10) quad.rotation.z = Math.atan2(local.y, local.x) + Math.PI
    },
  }
}

function buildArrow(): THREE.Group {
  const g = new THREE.Group()
  // Along +Z, so the group can simply be pointed at where it is going.
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.46, 5),
    new THREE.MeshBasicMaterial({ color: 0x6b4a2a, toneMapped: false }),
  )
  shaft.rotation.x = Math.PI / 2
  g.add(shaft)

  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.032, 0.11, 6),
    new THREE.MeshBasicMaterial({ color: 0xc9cdd4, toneMapped: false }),
  )
  head.rotation.x = Math.PI / 2
  head.position.z = 0.27
  g.add(head)

  // Fletching: two crossed quads at the back. Cheap, and it is what makes the
  // silhouette read as an arrow rather than as a nail at tabletop distance.
  const featherMat = new THREE.MeshBasicMaterial({
    color: 0xd8d2c4, side: THREE.DoubleSide, transparent: true, opacity: 0.9, toneMapped: false,
  })
  for (const roll of [0, Math.PI / 2]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.14), featherMat)
    f.position.z = -0.19
    f.rotation.z = roll
    g.add(f)
  }
  return g
}

/**
 * Loose one shot.
 *
 * `hit` and `margin` decide where it actually goes — see lib/projectile-aim.
 * A miss flies PAST the target, which is the first thing on this board to
 * spend the margin the server has been sending for weeks.
 *
 * `onImpact` fires on the frame it arrives, hit or miss, because a miss is
 * still a moment: it is when the target ducks and when the bolt clatters.
 */
export function loose(opts: {
  parent: THREE.Object3D
  /** Where it leaves — the shooter's hand, or their chest if there is no rig. */
  from: THREE.Vector3
  /** The target's centre. */
  to: THREE.Vector3
  hit: boolean
  margin?: number
  seed?: number
  onImpact?: () => void
  /** The weapon's name. A bow or crossbow flies Sam's painted art. */
  weapon?: string | null
  /** Needed to turn the painted shaft's face toward the viewer. */
  camera?: THREE.Camera | null
}): VfxHandle {
  const kind = shaftFor(opts.weapon)
  const tex = kind ? shaftTex.get(kind) : undefined
  const painted = kind && tex && opts.camera ? buildShaft(kind, tex) : null
  const arrow = painted ? painted.group : buildArrow()
  painted?.frame(0)
  const start = opts.from.clone()
  const aim = aimPoint({
    from: { x: start.x, z: start.z },
    to: { x: opts.to.x, z: opts.to.z },
    hit: opts.hit,
    margin: opts.margin,
    seed: opts.seed,
  })
  // Chest height on the way in, wherever it is going.
  const end = new THREE.Vector3(aim.x, opts.to.y, aim.z)

  const life = flightTime({ x: start.x, z: start.z }, { x: end.x, z: end.z })
  const dir = end.clone().sub(start)
  // Bite in a little past the surface on a hit, so it reads as buried rather
  // than as resting against them.
  if (opts.hit && dir.lengthSq() > 1e-6) end.add(dir.clone().normalize().multiplyScalar(BITE))

  arrow.position.copy(start)
  arrow.lookAt(end)
  opts.parent.add(arrow)

  let t = 0
  let landed = false
  let done = false

  return {
    update(dt: number): boolean {
      if (done) return false
      t += dt
      const p = Math.min(1, t / life)
      arrow.position.lerpVectors(start, end, p)
      // A SHALLOW ARC. A flat line reads as a laser; a real arc would need a
      // ballistic solution nobody asked for. A hand's width of lift at the
      // midpoint is enough to say "thrown" rather than "beamed".
      arrow.position.y += Math.sin(p * Math.PI) * 0.16
      // Point along travel, including the arc, so the head leads.
      const ahead = new THREE.Vector3().lerpVectors(start, end, Math.min(1, p + 0.05))
      ahead.y += Math.sin(Math.min(1, p + 0.05) * Math.PI) * 0.16
      if (ahead.distanceToSquared(arrow.position) > 1e-8) arrow.lookAt(ahead)
      if (painted && opts.camera) {
        painted.roll(opts.camera)
        // The flutter keeps running while a hit sticks; it is drawn as the
        // shaft quivering, which is what a buried arrow does.
        painted.frame(Math.floor(t / SHAFT_FRAME_S))
      }

      if (p >= 1 && !landed) {
        landed = true
        opts.onImpact?.()
        // A HIT STICKS, A MISS DOES NOT. The bolt that struck stays in the
        // body for a beat; the one that went by is gone, because an arrow
        // hanging in mid-air where nobody is standing is worse than no arrow.
        if (!opts.hit) { done = true; return false }
      }
      if (landed) {
        // Linger, then vanish. Not removed on the impact frame: the eye needs
        // a moment to register that it arrived.
        if (t > life + 0.5) { done = true; return false }
      }
      return true
    },
    dispose() {
      done = true
      opts.parent.remove(arrow)
      arrow.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        // The per-shot texture clone, not the shared sheet: three counts the
        // shared image's users, so the next shot's clone still has it.
        if (mat && !Array.isArray(mat)) (mat as THREE.MeshBasicMaterial).map?.dispose()
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
    },
  }
}
