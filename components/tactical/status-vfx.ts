import * as THREE from "three"
import { Flip, loadSheet, type Sheet } from "./spell-vfx-kit"
import type { StatusKind } from "@/lib/status-kinds"
import type { SpriteRig } from "@/lib/sprite-token"

// ============================================================================
// WHAT A CONDITION LOOKS LIKE ON THE BODY.
//
// The board has always known what a creature IS suffering — the HUD lists it
// as a chip — and never shown it: a burning drow stood exactly as a healthy
// one did. Sam: "if the character catches on fire the enemy has flames and
// the animation starts jumping around in pain or discomfort", "electricity
// if the character gains lightning charge", "webs that stay on the ground",
// "make them fall and stay lying on the ground".
//
// One instance per board. Every frame the board hands it the tokens and the
// looks each one calls for (lib/status-kinds); this keeps a small rig of
// pixel-art quads per token per look, builds one when a look appears,
// tears it down when it goes, and never allocates while a look is steady.
//
//   burning  two tongues of pxFlame on the body, a flickering light, and the
//            PAIN HOP: the whole token bobs and twists, out of step with any
//            other burning creature, so a burning line reads as a crowd.
//   charged  three pxArc crackles that jump to new spots around the body
//            several times a second, and a cold blue light.
//   webbed   pxWebWrap over the figure, pxWebFloor flat on its square.
//   prone    no quad: the body lies down. A sprite card goes flat (its own
//            `prone` flag); a rigged model pitches over onto its front.
//
// Sheets come through the kit's loader, so a web on the floor never
// downloads a sheet the cast that laid it already has.
// ============================================================================

/** What the board hands over for one token, once per frame. */
export interface StatusBody {
  id: string
  /** The token group: at the square, y 0 when standing, rotation.y facing. */
  obj: THREE.Object3D
  kinds: readonly StatusKind[]
  /** Dead bodies keep their pose; no look is drawn on them. */
  dead: boolean
  /** Mid-walk: the board owns the position, so the hop stays out of it. */
  moving: boolean
}

const TINT = { burning: 0xffffff, charged: 0xbfe8ff, webbed: 0xe6e6e6 } as const
const SHEETS: Record<Exclude<StatusKind, "prone">, string[]> = {
  burning: ["pxFlame"],
  charged: ["pxArc"],
  webbed: ["pxWebWrap", "pxWebFloor"],
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

interface Look {
  kind: StatusKind
  quads: Flip[]
  light: THREE.PointLight | null
  group: THREE.Group
  /** Seconds this look has been on. */
  t: number
  /** Per-look phase so two burning creatures never hop together. */
  phase: number
  /** charged: when the arcs next jump. */
  nextJump: number
}

interface TokenLooks {
  looks: Map<StatusKind, Look>
  /** What this instance last did to the body, so it can be undone exactly. */
  hop: number
  twist: number
  pitched: THREE.Object3D | null
}

/**
 * How far a quad sits in front of the body, toward the camera. A flame drawn
 * at the body's centre is inside the torso and never seen; this holds it
 * just proud of the figure on the side the camera is looking from.
 */
const PROUD = 0.34
const toCam = new THREE.Vector3()
const camRight = new THREE.Vector3()

/** Sheets already fetched, by key — read synchronously at build time. */
const have = new Map<string, Sheet>()
function warm(keys: string[]) {
  for (const k of keys) if (!have.has(k)) void loadSheet(k).then((s) => have.set(k, s)).catch(() => {})
}

export class StatusVfx {
  private readonly parent: THREE.Object3D
  private readonly tokens = new Map<string, TokenLooks>()

  constructor(parent: THREE.Object3D) {
    this.parent = parent
    warm(Object.values(SHEETS).flat())
  }

  /** Once per frame. `bodies` is every token on the board, whatever it suffers. */
  sync(bodies: readonly StatusBody[], dt: number, camera: THREE.Camera | null): void {
    const seen = new Set<string>()
    for (const b of bodies) {
      seen.add(b.id)
      let tl = this.tokens.get(b.id)
      const wanted = b.dead ? [] : b.kinds
      if (!tl) {
        if (!wanted.length) continue
        tl = { looks: new Map(), hop: 0, twist: 0, pitched: null }
        this.tokens.set(b.id, tl)
      }
      // Looks that ended.
      for (const [kind, look] of tl.looks) {
        if (!wanted.includes(kind)) { this.tearDown(look); tl.looks.delete(kind) }
      }
      // Looks that began — only once their sheets are here.
      for (const kind of wanted) {
        if (tl.looks.has(kind)) continue
        const look = this.build(kind, b)
        if (look) tl.looks.set(kind, look)
      }
      this.drive(b, tl, dt, camera)
      if (!tl.looks.size && !tl.hop && !tl.twist && !tl.pitched) this.tokens.delete(b.id)
    }
    // Tokens that left the board.
    for (const [id, tl] of this.tokens) {
      if (seen.has(id)) continue
      for (const look of tl.looks.values()) this.tearDown(look)
      this.tokens.delete(id)
    }
  }

  dispose(): void {
    for (const tl of this.tokens.values()) for (const look of tl.looks.values()) this.tearDown(look)
    this.tokens.clear()
  }

  // ── build / tear down ─────────────────────────────────────────────────────

  private build(kind: StatusKind, b: StatusBody): Look | null {
    const group = new THREE.Group()
    const phase = hash(b.id + kind) * Math.PI * 2
    const look: Look = { kind, quads: [], light: null, group, t: 0, phase, nextJump: 0 }
    if (kind === "prone") {
      this.parent.add(group)
      return look
    }
    const keys = SHEETS[kind]
    const sheets = keys.map((k) => have.get(k))
    if (sheets.some((s) => !s)) { warm(keys); return null }   // not yet — try next frame
    if (kind === "burning") {
      const s = sheets[0]!
      for (let i = 0; i < 2; i++) {
        const q = new Flip(s, TINT.burning, 0.42, 0.63)
        group.add(q.mesh)
        look.quads.push(q)
      }
      look.light = new THREE.PointLight(0xff7a20, 0, 5, 1.8)
      look.light.position.y = 0.7
      group.add(look.light)
    } else if (kind === "charged") {
      const s = sheets[0]!
      for (let i = 0; i < 3; i++) {
        const q = new Flip(s, TINT.charged, 0.34, 0.34)
        group.add(q.mesh)
        look.quads.push(q)
      }
      look.light = new THREE.PointLight(0x9fd6ff, 0, 4, 1.8)
      look.light.position.y = 0.8
      group.add(look.light)
    } else if (kind === "webbed") {
      const wrap = new Flip(sheets[0]!, TINT.webbed, 0.95, 1.27)
      wrap.mesh.position.y = 0.62
      group.add(wrap.mesh)
      const floor = new Flip(sheets[1]!, TINT.webbed, 1.15, 1.15)
      floor.mesh.rotation.x = -Math.PI / 2
      floor.mesh.position.y = 0.028   // over the floor marks, under the movement bands
      group.add(floor.mesh)
      look.quads.push(wrap, floor)
    }
    this.parent.add(group)
    return look
  }

  private tearDown(look: Look): void {
    for (const q of look.quads) { look.group.remove(q.mesh); q.dispose() }
    if (look.light) look.group.remove(look.light)
    this.parent.remove(look.group)
  }

  // ── per frame ─────────────────────────────────────────────────────────────

  private drive(b: StatusBody, tl: TokenLooks, dt: number, camera: THREE.Camera | null): void {
    const burning = tl.looks.get("burning")
    const charged = tl.looks.get("charged")
    const webbed = tl.looks.get("webbed")
    const prone = tl.looks.get("prone")

    // Undo last frame's hop and twist before anything else reads the body.
    if (tl.hop) { b.obj.position.y -= tl.hop; tl.hop = 0 }
    if (tl.twist) { b.obj.rotation.z -= tl.twist; tl.twist = 0 }

    for (const look of tl.looks.values()) {
      look.t += dt
      look.group.position.copy(b.obj.position)
      look.group.position.y = 0
    }
    // The side of the body the camera sees, flattened to the floor.
    if (camera) {
      toCam.subVectors(camera.position, b.obj.position).setY(0)
      if (toCam.lengthSq() < 1e-6) toCam.set(0, 0, 1)
      toCam.normalize()
      camRight.set(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize()
    } else {
      toCam.set(0, 0, 1)
      camRight.set(1, 0, 0)
    }

    if (burning) {
      const t = burning.t + burning.phase
      // THE PAIN HOP. Two rhythms that never line up: a quick jitter and a
      // slower lurch, so it reads as a creature that cannot keep still
      // rather than as a metronome. Left alone while walking or lying down.
      if (!b.moving && !prone) {
        tl.hop = Math.abs(Math.sin(t * 9.5)) * 0.07 + Math.abs(Math.sin(t * 3.1)) * 0.03
        tl.twist = Math.sin(t * 7.3) * 0.06 + Math.sin(t * 2.2) * 0.03
        b.obj.position.y += tl.hop
        b.obj.rotation.z += tl.twist
      }
      burning.quads.forEach((q, i) => {
        const side = i === 0 ? -0.15 : 0.16
        const lift = (prone ? 0.12 : 0.42) + (i === 0 ? 0 : 0.2) + Math.sin(t * 6 + i) * 0.02
        q.mesh.position.copy(toCam).multiplyScalar(PROUD).addScaledVector(camRight, side).setY(lift)
        if (camera) q.mesh.quaternion.copy(camera.quaternion)
        q.clock(burning.t + i * 0.37)
        q.opacity = 1
      })
      if (burning.light) burning.light.intensity = 2.2 + Math.sin(t * 13) * 0.6 + Math.sin(t * 5) * 0.4
    }

    if (charged) {
      const t = charged.t
      if (t >= charged.nextJump) {
        // Every arc to a new spot on the body, on a new frame of the sheet.
        charged.nextJump = t + 0.07 + hash(b.id + t.toFixed(2)) * 0.06
        charged.quads.forEach((q, i) => {
          const r = hash(b.id + "a" + i + t.toFixed(3))
          // Anywhere across the body's width, always on the camera's side.
          const side = (r * 2 - 1) * 0.36
          const lift = (prone ? 0.05 : 0.25) + hash(b.id + "h" + i + t.toFixed(3)) * (prone ? 0.25 : 0.75)
          q.mesh.position.copy(toCam).multiplyScalar(PROUD).addScaledVector(camRight, side).setY(lift)
          q.setLooping(hash(b.id + "f" + i + t.toFixed(3)))
          q.opacity = r < 0.35 ? 0 : 1   // some arcs simply are not there this beat
        })
      }
      if (camera) for (const q of charged.quads) q.mesh.quaternion.copy(camera.quaternion)
      if (charged.light) charged.light.intensity = 0.8 + (hash(b.id + t.toFixed(1)) > 0.6 ? 2.6 : 0)
    }

    if (webbed) {
      const [wrap] = webbed.quads
      wrap.mesh.position.copy(toCam).multiplyScalar(PROUD).setY(prone ? 0.2 : 0.62)
      if (camera) wrap.mesh.quaternion.copy(camera.quaternion)
      wrap.opacity = Math.min(1, webbed.t / 0.3)
      webbed.quads[1].opacity = Math.min(1, webbed.t / 0.3)
    }

    // Lying down, and getting back up.
    this.pose(b, tl, prone !== undefined)
  }

  /**
   * The prone pose. A sprite card lies flat through its own flag. A rigged
   * model is pitched onto its front after the board has set its stance for
   * the frame — the board rewrites the model's rotation every frame it
   * stands still, so this is re-applied every frame and never accumulates.
   */
  private pose(b: StatusBody, tl: TokenLooks, prone: boolean): void {
    const rig = b.obj.userData.spriteRig as SpriteRig | undefined
    if (rig) { rig.prone = prone; tl.pitched = prone ? b.obj : null; return }
    const model = b.obj.children.find((c) => c.userData?.rest) as THREE.Object3D | undefined
    if (!model) return
    if (prone) {
      if (b.moving) return
      // Onto the front, and a little forward so the head is not in the
      // floor. Feet stay on their square.
      model.rotateX(-Math.PI / 2)
      tl.pitched = model
    } else if (tl.pitched) {
      // The board resets standing rotation every frame; nothing to undo.
      tl.pitched = null
    }
  }
}
