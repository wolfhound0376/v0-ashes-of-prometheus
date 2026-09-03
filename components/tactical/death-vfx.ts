// ============================================================================
// THE TWELVE DEATHS — a creature ends the way the thing that killed it says.
//
// The old death was one effect: replay the damage type's impact sheet over the
// body, bigger and slower. It told you a spell had landed. It did not tell you
// the drow had been dissolved rather than frozen, and at a table those are not
// the same story.
//
// A death here is THREE things at once, over three seconds:
//
//   the BODY   what happens to the mesh. Colour, dissolve, sink, shake,
//              shrink, fall, and the things left IN it — a shaft through the
//              chest, the bone that shows when the flesh is gone. This is the
//              half that carries the meaning: a body that goes green and stops
//              reads as poison with no particle on screen at all.
//   the AIR    particles and light around it. Flames climbing, sparks
//              jumping, drips falling, blood flung, ash going up.
//   the SHEET  the killing type's own baked sprite, played over the body from
//              the same cache the cast used. Fire burns, frost blooms,
//              lightning flashes twice.
//
// THREE SECONDS. Every real death runs the same length, because a death is a
// beat at the table — long enough to watch, short enough that the next turn
// is not waiting on it. Collapse and sleep are not deaths and keep their own
// shorter fall.
//
// WHY IT DOES NOT HOLD THE OBJECT
//
// The board REBUILDS a token whenever its HP changes (combat-board-3d's
// glideToken calls spawnToken, which reloads the GLB from scratch). The
// killing blow is an HP change. So an effect that captured `entry.obj` when it
// was created would be painting a corpse that had already been thrown away.
//
// Every death therefore takes a `resolve()` and asks for the body EVERY FRAME.
// It survives the rebuild, and it survives two rebuilds — and so do the things
// it hangs on the body: the shaft and the bone overlay are re-attached to
// whatever mesh the board hands back.
//
// MATERIALS ARE CLONED ON FIRST TOUCH
//
// Three.js shares materials across a loaded GLB, and several tokens can be the
// same creature. Tinting a shared material turns every drow in the room green.
// Each death clones what it touches, once, and restores nothing - the body is
// dead and stays as this left it.
// ============================================================================

import * as THREE from "three"
import type { VfxHandle } from "./spell-vfx"
import type { DeathKind } from "@/lib/damage-type"
import { Flip, loadSheet, type Sheet } from "./spell-vfx-kit"

/** How long each death takes to play. The body keeps whatever it ends as. */
const LIFE: Record<DeathKind, number> = {
  burn: 3.0, burst: 3.0, melt: 3.0, char: 3.0, raise: 3.0, freeze: 3.0,
  mangle: 3.0, impale: 3.0, anguish: 3.0, ashes: 3.0, wither: 3.0,
  // Not deaths. A downed friend and a sleeper just go down.
  sleep: 2.0, collapse: 1.4,
}

/** What the body ends up coloured, when a death recolours it at all. */
const STAIN: Partial<Record<DeathKind, THREE.Color>> = {
  burn:    new THREE.Color(0x120805),
  char:    new THREE.Color(0x14100e),
  raise:   new THREE.Color(0xd9d2bd),
  freeze:  new THREE.Color(0xbfe6f5),
  wither:  new THREE.Color(0x5f8f3a),
  melt:    new THREE.Color(0x8fa832),
  ashes:   new THREE.Color(0xfff4d2),
}

/** The mote colour thrown into the air, per death. */
const MOTE: Partial<Record<DeathKind, number>> = {
  burn: 0xff9a3c, burst: 0xffe9b0, melt: 0xb6e04a, char: 0xcfe6ff,
  raise: 0xb9a6d8, freeze: 0xcdefff, mangle: 0x8e1414, impale: 0x8e1414,
  anguish: 0xe86bd8, ashes: 0xfff6dc, wither: 0x76c04a,
}

/**
 * The killing type's own baked sheet, from the cast kit's manifest. Played
 * over the body so the death is made of the same stuff as the hit. Sleep and
 * collapse have none: nothing killed them.
 */
const SHEET: Partial<Record<DeathKind, string>> = {
  burn: "fireball", ashes: "radiantColumn", burst: "forceHit", melt: "acidImpact",
  char: "lightningStrike", raise: "necroImpact", freeze: "frostImpact",
  wither: "poisonCloud", anguish: "psychicImpact", impale: "physicalImpact",
  mangle: "physicalImpact",
}

type Painted = {
  mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | THREE.MeshPhongMaterial
  baseColor: THREE.Color
  baseOpacity: number
  baseRoughness: number
}

/** A mesh this module hung on the body, so a re-claim does not paint it. */
const HUNG = "deathVfxHung"

/**
 * Clone every material under `root` once so this death can paint them without
 * touching any other token that shares the same loaded asset.
 */
function claim(root: THREE.Object3D, out: Painted[]) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.material || mesh.userData[HUNG]) return
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const cloned = list.map((m) => {
      const c = (m as THREE.Material).clone() as Painted["mat"]
      c.transparent = true
      const std = c as THREE.MeshStandardMaterial
      out.push({
        mat: c,
        baseColor: std.color?.clone() ?? new THREE.Color(0xffffff),
        baseOpacity: c.opacity ?? 1,
        baseRoughness: typeof std.roughness === "number" ? std.roughness : 0.6,
      })
      return c
    })
    mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]
  })
}

/** How tall the body is, in board units, for placing things on it. */
function heightOf(body: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(body)
  const h = box.max.y - box.min.y
  return Number.isFinite(h) && h > 0.05 ? h : 0.9
}

// ── the air ─────────────────────────────────────────────────────────────────

interface PuffOpts {
  colour: number
  count: number
  /** Radius the motes start within. */
  spread: number
  /** Upward speed, board units per second. Negative for things that fall. */
  rise: number
  /** Downward acceleration. Negative is buoyancy — flames accelerate UP. */
  gravity: number
  size: number
  /** Sideways speed. */
  drift: number
  /**
   * Height above the base at which a mote is reborn at the base, so a flame
   * keeps burning for as long as it is fed rather than being one puff. While
   * `feeding` is false the motes finish their climb and are not replaced.
   */
  recycle?: number
  /** A directional push, for blood flung the way the blow went. */
  push?: THREE.Vector3 | null
  /** Where falling motes stop, in the puff's own frame. The floor, usually. */
  floor?: number
}

/** A cloud of motes. One geometry, one draw call. */
class Puff {
  readonly points: THREE.Points
  private readonly pos: Float32Array
  private readonly vel: Float32Array
  private readonly mat: THREE.PointsMaterial
  private readonly geo: THREE.BufferGeometry
  constructor(private readonly o: PuffOpts) {
    const n = o.count
    this.pos = new Float32Array(n * 3)
    this.vel = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) this.seed(i, true)
    this.geo = new THREE.BufferGeometry()
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3))
    this.mat = new THREE.PointsMaterial({
      color: o.colour, size: o.size, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })
    this.points = new THREE.Points(this.geo, this.mat)
    this.points.frustumCulled = false
  }
  private seed(i: number, first: boolean) {
    const o = this.o
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * o.spread
    this.pos[i * 3] = Math.cos(a) * r
    // Staggered on the first fill so a recycling flame does not start as a
    // flat disc that lifts off in one sheet.
    this.pos[i * 3 + 1] = first && o.recycle ? Math.random() * o.recycle : Math.random() * 0.25
    this.pos[i * 3 + 2] = Math.sin(a) * r
    this.vel[i * 3] = (Math.random() - 0.5) * o.drift + (o.push?.x ?? 0) * (0.5 + Math.random())
    this.vel[i * 3 + 1] = o.rise * (0.5 + Math.random())
    this.vel[i * 3 + 2] = (Math.random() - 0.5) * o.drift + (o.push?.z ?? 0) * (0.5 + Math.random())
  }
  update(dt: number, feeding: boolean) {
    const o = this.o
    for (let i = 0; i < o.count; i++) {
      const k = i * 3
      this.pos[k] += this.vel[k] * dt
      this.pos[k + 1] += this.vel[k + 1] * dt
      this.pos[k + 2] += this.vel[k + 2] * dt
      this.vel[k + 1] -= o.gravity * dt
      if (o.recycle && feeding && this.pos[k + 1] > o.recycle) this.seed(i, false)
      // Things that fall stop at the floor and pool there.
      const floor = o.floor ?? -0.3
      if (o.gravity > 0 && this.pos[k + 1] < floor) { this.pos[k + 1] = floor; this.vel[k + 1] = 0; this.vel[k] *= 0.5; this.vel[k + 2] *= 0.5 }
    }
    this.geo.attributes.position.needsUpdate = true
  }
  set opacity(v: number) { this.mat.opacity = v }
  dispose() { this.geo.dispose(); this.mat.dispose() }
}

/**
 * What a body torn apart by force leaves: lumps thrown outward that land and
 * lie there. One instanced mesh, so sixteen pieces are one draw call.
 */
class Debris {
  readonly mesh: THREE.InstancedMesh
  private readonly mat: THREE.MeshStandardMaterial
  private readonly geo: THREE.BoxGeometry
  private readonly p: THREE.Vector3[] = []
  private readonly v: THREE.Vector3[] = []
  private readonly spin: THREE.Vector3[] = []
  private readonly rot: THREE.Euler[] = []
  private readonly size: number[] = []
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly s = new THREE.Vector3()
  constructor(count: number, scale: number, colour: number) {
    this.geo = new THREE.BoxGeometry(1, 1, 1)
    this.mat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.85, metalness: 0, transparent: true })
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, count)
    this.mesh.frustumCulled = false
    this.mesh.castShadow = false
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const up = 2.2 + Math.random() * 3.2
      const out = 1.2 + Math.random() * 2.4
      this.p.push(new THREE.Vector3(0, 0.5 * scale, 0))
      this.v.push(new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out).multiplyScalar(scale))
      this.spin.push(new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9))
      this.rot.push(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0))
      this.size.push((0.06 + Math.random() * 0.09) * scale)
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.p.length; i++) {
      const p = this.p[i], v = this.v[i]
      p.addScaledVector(v, dt)
      v.y -= 9.8 * dt
      if (p.y < this.size[i] * 0.5) {
        // Landed. It bounces once, small, then lies still.
        p.y = this.size[i] * 0.5
        if (Math.abs(v.y) > 0.6) { v.y = -v.y * 0.25; v.x *= 0.6; v.z *= 0.6 }
        else { v.set(0, 0, 0); this.spin[i].set(0, 0, 0) }
      }
      const r = this.rot[i]
      r.x += this.spin[i].x * dt; r.y += this.spin[i].y * dt; r.z += this.spin[i].z * dt
      this.q.setFromEuler(r)
      this.s.setScalar(this.size[i])
      this.m.compose(p, this.q, this.s)
      this.mesh.setMatrixAt(i, this.m)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
  set opacity(v: number) { this.mat.opacity = v }
  dispose() { this.geo.dispose(); this.mat.dispose() }
}

// ── things hung on the body ─────────────────────────────────────────────────
// Shared geometry and material, made once: a corpse keeps its shaft and its
// bones after the effect is disposed, so nothing here can be freed per death.

let boneMat: THREE.MeshBasicMaterial | null = null
/**
 * The skeleton, by wireframe. The board has no skeleton MODEL to swap to, so
 * the bone is the body's own mesh drawn as lines in bone colour, bound to the
 * same skeleton, fading in as the flesh fades out. An honest approximation —
 * it reads as what is left when the meat is gone, which is the point.
 */
function hangBones(body: THREE.Object3D): THREE.MeshBasicMaterial {
  boneMat ??= new THREE.MeshBasicMaterial({
    color: 0xe8e0c8, wireframe: true, transparent: true, opacity: 0, depthWrite: false,
  })
  const mat = boneMat
  const hosts: THREE.Mesh[] = []
  body.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && !mesh.userData[HUNG]) hosts.push(mesh)
  })
  for (const host of hosts) {
    const skinned = host as THREE.SkinnedMesh
    let bone: THREE.Mesh
    if (skinned.isSkinnedMesh) {
      const sm = new THREE.SkinnedMesh(host.geometry, mat)
      sm.bind(skinned.skeleton, skinned.bindMatrix)
      bone = sm
    } else {
      bone = new THREE.Mesh(host.geometry, mat)
    }
    bone.userData[HUNG] = true
    bone.frustumCulled = false
    bone.castShadow = false
    host.add(bone)
  }
  return mat
}

let shaftGeo: { shaft: THREE.CylinderGeometry; head: THREE.ConeGeometry; vane: THREE.PlaneGeometry } | null = null
let shaftMat: { wood: THREE.MeshStandardMaterial; steel: THREE.MeshStandardMaterial; vane: THREE.MeshStandardMaterial } | null = null
/**
 * The shaft that did it, left in the chest. Oriented so the fletching points
 * back at whoever loosed it, because that is the one thing an arrow in a body
 * tells you. At board scale a dagger and an arrow are the same dark line and
 * the same story, so this does not pretend to know which.
 */
function hangShaft(body: THREE.Object3D, towardAttacker: THREE.Vector3, chestY: number, scale: number) {
  shaftGeo ??= {
    shaft: new THREE.CylinderGeometry(0.014, 0.014, 1, 6),
    head: new THREE.ConeGeometry(0.03, 0.09, 6),
    vane: new THREE.PlaneGeometry(0.11, 0.05),
  }
  shaftMat ??= {
    wood: new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.8 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.35, metalness: 0.6 }),
    vane: new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.9, side: THREE.DoubleSide }),
  }
  const len = 0.62 * scale
  const g = new THREE.Group()
  g.userData[HUNG] = true
  const shaft = new THREE.Mesh(shaftGeo.shaft, shaftMat.wood)
  shaft.scale.set(scale, len, scale)
  // The cylinder is centred; slide it so a third is buried and the rest
  // stands proud toward the attacker.
  shaft.position.y = len * 0.5 - len * 0.3
  const head = new THREE.Mesh(shaftGeo.head, shaftMat.steel)
  head.scale.setScalar(scale)
  head.position.y = -len * 0.3
  head.rotation.x = Math.PI
  g.add(shaft, head)
  for (let i = 0; i < 3; i++) {
    const v = new THREE.Mesh(shaftGeo.vane, shaftMat.vane)
    v.scale.setScalar(scale)
    v.position.y = len * 0.7 - 0.06 * scale
    v.rotation.y = (i * Math.PI * 2) / 3
    v.rotation.z = Math.PI / 2
    v.position.x = Math.cos((i * Math.PI * 2) / 3) * 0.02 * scale
    v.position.z = Math.sin((i * Math.PI * 2) / 3) * 0.02 * scale
    g.add(v)
  }
  for (const c of g.children) { c.castShadow = false; c.userData[HUNG] = true }
  // Into the body's own frame, so it falls with the body when the body leans.
  const local = towardAttacker.clone().applyQuaternion(body.quaternion.clone().invert()).setY(0.12).normalize()
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), local)
  g.position.set(0, chestY / Math.max(1e-3, body.scale.y), 0)
  body.add(g)
}

// ── the death ───────────────────────────────────────────────────────────────

export interface DeathArgs {
  parent: THREE.Object3D
  /** Where the body stands. Ground level, not eye level. */
  position: THREE.Vector3
  kind: DeathKind
  /**
   * The body, looked up FRESH each frame. Returns null once the token is gone
   * from the board, and the death carries on in the air without it.
   */
  resolve: () => THREE.Object3D | null
  /** 1 = one square. A bigger creature dies bigger. */
  scale?: number
  /**
   * True when the creature's MODEL animates its own death — a GLB with a
   * "dead" clip, which the board plays and freezes on the last frame.
   *
   * When it does, this must not also lay the body down. Two things falling at
   * once is a body that falls twice, and the artist's animation is better than
   * a rotation about Z will ever be. The colour, the dissolve, the sink, the
   * scale and every particle still run — those are the half the clip cannot
   * do, and they are the half that says WHAT killed it.
   */
  posed?: boolean
  /** For the sheet to face. Without it the sheet stands upright, north. */
  camera?: THREE.Camera | null
  /**
   * Where the killing blow came from — the attacker's position. Points the
   * shaft, throws the blood the right way, and tips a burst body away from
   * the hit. Optional: a death with no known source falls straight down.
   */
  from?: THREE.Vector3 | null
}

export function deathSceneVfx(args: DeathArgs): VfxHandle {
  const { parent, position, kind, resolve } = args
  const scale = args.scale ?? 1
  const life = LIFE[kind]
  const stain = STAIN[kind]
  const moteColour = MOTE[kind]

  const group = new THREE.Group()
  group.position.copy(position)
  parent.add(group)

  const light = new THREE.PointLight(moteColour ?? 0xffffff, 0, 8 * scale, 1.8)
  light.castShadow = false
  light.position.y = 0.7 * scale
  group.add(light)

  // The direction the blow travelled, on the floor: from the attacker to here.
  const away = new THREE.Vector3(0, 0, 1)
  if (args.from) {
    away.set(position.x - args.from.x, 0, position.z - args.from.z)
    if (away.lengthSq() < 1e-6) away.set(0, 0, 1)
    away.normalize()
  }

  // THE AIR, per death. Two puffs at most: the main one and a second for the
  // kinds that have two things happening (flames AND embers, sparks AND smoke).
  const puffs: { puff: Puff; feedUntil: number; fade: [number, number] }[] = []
  const addPuff = (o: PuffOpts, feedUntil: number, fade: [number, number], y = 0.3) => {
    // The floor, seen from where this puff starts: a drip that begins at
    // chest height has further to fall than one that begins at the knee.
    const puff = new Puff({ floor: -y * scale + 0.02, ...o })
    puff.points.position.y = y * scale
    group.add(puff.points)
    puffs.push({ puff, feedUntil, fade })
  }
  const blood = (count: number) =>
    addPuff({ colour: 0x8e1414, count, spread: 0.18 * scale, rise: 1.6, gravity: 7, size: 0.075 * scale, drift: 1.1, push: away.clone().multiplyScalar(1.8) }, 0.15, [0.55, 1], 0.55)
  switch (kind) {
    case "burn":
      // Flames that keep climbing for as long as the body feeds them, and
      // embers that go higher and slower.
      addPuff({ colour: 0xff8a2a, count: 120, spread: 0.32 * scale, rise: 1.5, gravity: -0.8, size: 0.16 * scale, drift: 0.35, recycle: 1.1 * scale }, 0.72, [0.72, 1], 0.05)
      addPuff({ colour: 0xffd27a, count: 40, spread: 0.3 * scale, rise: 0.9, gravity: -0.3, size: 0.06 * scale, drift: 0.5, recycle: 2.2 * scale }, 0.8, [0.8, 1], 0.4)
      break
    case "char":
      // Sparks: fast, bright, and they FALL — current thrown off a body obeys
      // gravity like anything else. Then a little smoke off the char.
      addPuff({ colour: 0xdff0ff, count: 80, spread: 0.25 * scale, rise: 2.6, gravity: 7, size: 0.065 * scale, drift: 2.4, recycle: 1.4 * scale }, 0.42, [0.42, 0.6], 0.6)
      addPuff({ colour: 0x6a6a6a, count: 24, spread: 0.2 * scale, rise: 0.5, gravity: -0.1, size: 0.12 * scale, drift: 0.2, recycle: 1.5 * scale }, 0.9, [0.85, 1], 0.6)
      break
    case "melt":
      // Acid drips: they fall, and they pool.
      addPuff({ colour: 0xb6e04a, count: 60, spread: 0.3 * scale, rise: -0.2, gravity: 2.8, size: 0.07 * scale, drift: 0.3, recycle: 0 }, 0.8, [0.7, 1], 0.7)
      addPuff({ colour: 0xd8ff8a, count: 30, spread: 0.35 * scale, rise: 0.35, gravity: -0.05, size: 0.09 * scale, drift: 0.2, recycle: 1.2 * scale }, 0.85, [0.8, 1], 0.2)
      break
    case "raise":
      // Flesh coming off: dark drips down, and a violet breath going up.
      addPuff({ colour: 0x6a4a8a, count: 50, spread: 0.28 * scale, rise: -0.3, gravity: 2.4, size: 0.07 * scale, drift: 0.25 }, 0.7, [0.65, 1], 0.75)
      addPuff({ colour: 0xb9a6d8, count: 30, spread: 0.3 * scale, rise: 0.6, gravity: 0.1, size: 0.08 * scale, drift: 0.3 }, 0.5, [0.5, 1], 0.4)
      break
    case "freeze":
      addPuff({ colour: 0xcdefff, count: 50, spread: 0.4 * scale, rise: 0.25, gravity: 0.45, size: 0.05 * scale, drift: 0.25 }, 0.4, [0.4, 0.9], 0.6)
      break
    case "burst":
      addPuff({ colour: 0xffe9b0, count: 90, spread: 0.45 * scale, rise: 2.4, gravity: 3.2, size: 0.11 * scale, drift: 0.35 }, 0.1, [0.12, 0.6], 0.35)
      blood(70)
      break
    case "impale":
      blood(40)
      break
    case "mangle":
      blood(60)
      break
    case "wither":
      addPuff({ colour: 0x76c04a, count: 44, spread: 0.4 * scale, rise: 0.6, gravity: 0.2, size: 0.11 * scale, drift: 0.3 }, 0.5, [0.4, 1], 0.35)
      break
    case "ashes":
      addPuff({ colour: 0xfff6dc, count: 70, spread: 0.4 * scale, rise: 1.1, gravity: 0.15, size: 0.09 * scale, drift: 0.3, recycle: 1.6 * scale }, 0.6, [0.6, 1], 0.3)
      break
    case "anguish":
      addPuff({ colour: 0xe86bd8, count: 44, spread: 0.3 * scale, rise: 0.9, gravity: 0.25, size: 0.1 * scale, drift: 0.3 }, 0.4, [0.35, 1], 0.9)
      break
  }

  // The pieces of a body that was torn apart.
  let debris: Debris | null = null
  if (kind === "burst") {
    debris = new Debris(16, scale, 0x4a1512)
    group.add(debris.mesh)
  }

  // THE SHEET. Fetched through the cast kit's cache, so the fireball that
  // killed it is the fireball that burns it.
  let sheet: Flip | null = null
  let sheetMeta: Sheet | null = null
  const sheetKey = SHEET[kind]
  if (sheetKey) {
    void loadSheet(sheetKey).then((s) => {
      if (disposed) return
      sheetMeta = s
      const size = (kind === "burst" ? 2.2 : kind === "ashes" ? 1.6 : 1.5) * scale
      sheet = new Flip(s, 0xffffff, size, size)
      sheet.opacity = 0
      sheet.mesh.position.y = (kind === "ashes" ? 0.8 : 0.55) * scale
      group.add(sheet.mesh)
    }).catch(() => { /* no sheet, no sprite — the body still dies */ })
  }

  // Claimed lazily: the body may not exist yet on frame one, because the
  // rebuild that the killing blow triggers is asynchronous (it reloads a GLB).
  let painted: Painted[] | null = null
  let claimedFrom: THREE.Object3D | null = null
  let baseY: number | null = null
  let bones: THREE.MeshBasicMaterial | null = null

  let t = 0
  let disposed = false

  const dispose = () => {
    if (disposed) return
    disposed = true
    for (const { puff } of puffs) { puff.dispose(); group.remove(puff.points) }
    if (debris) { debris.dispose(); group.remove(debris.mesh) }
    if (sheet) { sheet.dispose(); group.remove(sheet.mesh) }
    group.remove(light)
    parent.remove(group)
    // The cloned materials are NOT disposed, and neither are the shaft or the
    // bones. They are still on the body's meshes and are the only thing
    // holding its final state - the char, the green, the arrow through it.
    // The body owns them now; they go when spawnToken next replaces it.
    painted = null
    claimedFrom = null
  }

  return {
    update(dt: number) {
      if (disposed) return false
      t += dt
      const p = Math.min(1, t / life)

      const body = resolve()
      // Re-claim if the board rebuilt the token underneath us. Comparing the
      // object identity is what makes this survive spawnToken — and what the
      // death hung on the old body is hung again on the new one.
      if (body && body !== claimedFrom) {
        // The previous set belongs to a body the board has thrown away; the
        // meshes went with it, so there is nothing to leave holding state.
        painted?.forEach((x) => x.mat.dispose())
        painted = []
        claim(body, painted)
        claimedFrom = body
        baseY = body.position.y
        const h = heightOf(body)
        if (kind === "raise") bones = hangBones(body)
        if (kind === "impale") hangShaft(body, away.clone().negate(), h * 0.62, scale)
      }

      if (body && painted) {
        applyBody(kind, p, t, body, painted, stain, baseY ?? 0, scale, args.posed === true, bones)
      }

      for (const { puff, feedUntil, fade } of puffs) {
        puff.update(dt, p < feedUntil)
        const inFade = p < 0.08 ? p / 0.08 : 1
        const out = p > fade[0] ? Math.max(0, 1 - (p - fade[0]) / (fade[1] - fade[0])) : 1
        puff.opacity = inFade * out
      }

      if (debris) {
        debris.update(dt)
        debris.opacity = p < 0.85 ? 1 : Math.max(0, 1 - (p - 0.85) / 0.15)
      }

      if (sheet && sheetMeta) {
        if (args.camera) sheet.mesh.quaternion.copy(args.camera.quaternion)
        else sheet.mesh.quaternion.identity()
        applySheet(kind, p, t, sheet, sheetMeta)
      }

      light.intensity = 14 * scale * (1 - p) * (1 - p)
      // Current flickers; fire does not shine steadily either.
      if (kind === "char") light.intensity *= p < 0.45 ? 0.5 + 0.5 * Math.abs(Math.sin(t * 61)) : 0.2
      if (kind === "burn") light.intensity = 10 * scale * (p < 0.75 ? 0.75 + 0.25 * Math.sin(t * 23) : Math.max(0, 1 - (p - 0.75) / 0.25))

      if (p >= 1) { dispose(); return false }
      return true
    },
    dispose,
  }
}

/**
 * The sprite half. `t` is seconds since the death began; `p` is the same
 * thing over the whole life, for the fades.
 */
function applySheet(kind: DeathKind, p: number, t: number, sheet: Flip, meta: Sheet) {
  const native = meta.frames / meta.fps // seconds for one pass at the baked rate
  switch (kind) {
    case "burn":
      // The explosion sheet, cycled at half speed, IS the burning: a rolling
      // fireball that never quite finishes, until the fuel runs out.
      sheet.setLooping(t / (native * 1.6))
      sheet.opacity = 0.85 * (p < 0.1 ? p / 0.1 : p < 0.7 ? 1 : Math.max(0, 1 - (p - 0.7) / 0.2))
      break
    case "char": {
      // Two strikes. The second is the one people remember.
      const flashes = [0, 0.75]
      let a = 0
      for (const at of flashes) {
        const local = t - at
        if (local >= 0 && local < native) { sheet.setProgress(local / native); a = 1 - local / native }
      }
      sheet.opacity = a
      break
    }
    case "melt":
    case "wither":
      // Bubbling and vapour: keep cycling while the body is still going.
      sheet.setLooping(t / (native * 1.3))
      sheet.opacity = 0.7 * (p < 0.1 ? p / 0.1 : p < 0.75 ? 1 : Math.max(0, 1 - (p - 0.75) / 0.25))
      break
    default: {
      // One pass, stretched over the first third of the death, then gone.
      const span = Math.max(native, 1.0)
      const q = Math.min(1, t / span)
      sheet.setProgress(q)
      sheet.opacity = q < 1 ? 1 - Math.max(0, (q - 0.7) / 0.3) : 0
    }
  }
}

/**
 * The body half. Everything here is a function of p (0 to 1) so a death can be
 * scrubbed, and so nothing accumulates - a frame drop changes the smoothness,
 * never the destination. `t` is seconds, for the few things that have to be
 * fast regardless of how long the death lasts (a burst, a convulsion).
 */
function applyBody(
  kind: DeathKind,
  p: number,
  t: number,
  body: THREE.Object3D,
  painted: Painted[],
  stain: THREE.Color | undefined,
  baseY: number,
  scale: number,
  /** The model animates its own fall; leave its transform alone. */
  posed: boolean,
  /** The bone overlay's material, for a necrotic death. */
  bones: THREE.MeshBasicMaterial | null,
) {
  // How far the stain has taken hold. Most deaths colour early and hold;
  // fire and lightning blacken as they go, because the burning IS the death.
  const tint = kind === "burn" ? Math.min(1, p / 0.8) : kind === "char" ? Math.min(1, Math.max(0, (p - 0.2) / 0.4)) : Math.min(1, p / 0.45)
  if (stain) {
    for (const m of painted) {
      const c = (m.mat as THREE.MeshStandardMaterial).color
      if (c) c.copy(m.baseColor).lerp(stain, tint)
    }
  }

  const setOpacity = (o: number) => {
    for (const m of painted) m.mat.opacity = m.baseOpacity * o
  }
  const setEmissive = (hex: number, k: number) => {
    for (const m of painted) {
      const e = (m.mat as THREE.MeshStandardMaterial).emissive
      if (e) e.setHex(hex).multiplyScalar(k)
    }
  }

  // Guarded so a posed model keeps its animator's transform. Everything that
  // is NOT a transform - colour, opacity - runs either way, which is why the
  // stain above is outside this and these are inside it.
  const lean = (r: number) => { if (!posed) body.rotation.z = r }
  const tipForward = (r: number) => { if (!posed) body.rotation.x = r }
  const drop = (dy: number) => { if (!posed) body.position.y = baseY + dy }
  const nudge = (dx: number, dz: number) => {
    if (posed) return
    body.position.x += dx
    body.position.z += dz
  }
  const squash = (x: number, y: number, z: number) => { if (!posed) body.scale.set(x, y, z) }
  const shrink = (s: number) => { if (!posed) body.scale.setScalar(s) }

  switch (kind) {
    case "burn": {
      // Goes down first, then burns where it lies: blackening through the
      // three seconds while the flames climb off it, and STAYS — a charred
      // body on the square, not a body that faded out. The old version ate
      // it to nothing, which read as a dispel, not a fire.
      const k = ease(Math.min(1, p / 0.4))
      lean(k * 1.15)
      drop(-k * 0.2 * scale)
      shrink(1 - p * 0.08)
      setEmissive(0xff5a10, p < 0.75 ? 0.35 * (0.6 + 0.4 * Math.abs(Math.sin(t * 17))) : 0.35 * Math.max(0, 1 - (p - 0.75) / 0.25))
      break
    }

    case "ashes":
      // Radiant. Whites out first - the light gets INTO it - and then there is
      // nothing left. No char, no remains.
      setEmissive(0xfff0c0, Math.min(1, p / 0.3) * 0.8)
      setOpacity(1 - Math.max(0, (p - 0.3) / 0.7))
      shrink(1 + p * 0.06)
      break

    case "burst":
      // Force and thunder. A quarter second of swelling, then gone: there is
      // no body afterwards, which is the whole point of being torn apart. The
      // pieces are the debris in the air, not this mesh.
      //
      // Not on `p` — a three-second death must still pop in a quarter second,
      // or it reads as inflating. And the opacity is NOT guarded by `posed`:
      // a model with its own death clip still has to stop existing here.
      if (t < 0.25) shrink(1 + (t / 0.25) * 0.45)
      else { setOpacity(0); shrink(0.001) }
      break

    case "melt": {
      // Acid. Sinks INTO the floor and squashes as it goes, because the thing
      // that is failing is the body's ability to hold itself up.
      const k = ease(p)
      drop(-k * 0.9 * scale)
      squash(1 + k * 0.25, Math.max(0.04, 1 - k * 0.95), 1 + k * 0.25)
      setOpacity(1 - k * 0.55)
      break
    }

    case "char": {
      // Lightning. Lit from inside while the current runs — a hard blue-white
      // flicker in the first second — convulsing on a decaying envelope so it
      // reads as current, not as a stagger. Then it stops, and it is black.
      const shake = Math.max(0, 1 - t / 1.1)
      nudge(Math.sin(t * 190) * 0.05 * shake * scale, Math.cos(t * 173) * 0.05 * shake * scale)
      lean(shake > 0 ? Math.sin(t * 140) * 0.10 * shake : 0)
      setEmissive(0x8fc4ff, shake * (0.4 + 0.6 * Math.abs(Math.sin(t * 90))))
      break
    }

    case "raise": {
      // Necrotic. The flesh comes off and the bone stays: the meshes go
      // pale and then nearly clear, and the wireframe bound to the same
      // skeleton comes up underneath them. Slumps a little as it goes,
      // because there is less holding it up.
      const k = ease(p)
      squash(1 - k * 0.10, 1 - k * 0.06, 1 - k * 0.10)
      drop(-k * 0.04 * scale)
      setOpacity(1 - Math.min(1, Math.max(0, (p - 0.15) / 0.65)) * 0.9)
      if (bones) bones.opacity = Math.min(1, Math.max(0, (p - 0.25) / 0.5)) * 0.95
      break
    }

    case "freeze": {
      // Cold. A shudder, then everything stops at once - no sag, no fall. It
      // ices where it stood: the surface goes glassy and lit faintly from the
      // blue, which is what reads as ice rather than as a pale body.
      const shudder = Math.max(0, 1 - t / 0.35)
      nudge(Math.sin(t * 120) * 0.012 * shudder * scale, 0)
      shrink(1 + p * 0.02)
      for (const m of painted) {
        const std = m.mat as THREE.MeshStandardMaterial
        if (typeof std.roughness === "number") std.roughness = m.baseRoughness + (0.1 - m.baseRoughness) * tint
      }
      setEmissive(0x1e4a6a, tint * 0.6)
      break
    }

    case "wither":
      // Poison. Goes green and simply stops. The only motion is a slow lean,
      // because a poisoned thing does not get thrown anywhere.
      lean(ease(p) * 0.22)
      drop(-ease(p) * 0.08 * scale)
      break

    case "mangle": {
      // Weapon. Takes the blow, then goes down sideways. The 15% overshoot on
      // the fall is what stops it looking like a lift being lowered.
      const k = ease(Math.min(1, p / 0.6))
      lean(k * 1.35 * (1 + 0.15 * Math.sin(Math.min(1, p / 0.6) * Math.PI)))
      drop(-k * 0.25 * scale)
      break
    }

    case "impale": {
      // Arrows. A hard jolt BACKWARD on the shaft, then down. The jolt is the
      // read - a pierced creature is pushed, a slashed one folds. Fast on `t`,
      // because a jolt that takes half a second is a lean.
      const jolt = Math.max(0, 1 - t / 0.5)
      nudge(0, -jolt * 0.06 * scale)
      const k = ease(Math.max(0, (p - 0.12) / 0.6))
      tipForward(k * 1.2)
      drop(-k * 0.28 * scale)
      break
    }

    case "anguish": {
      // Psychic. A held moment - the hands go up, nothing else happens - and
      // then the legs go. The pause is the effect; make it fall smoothly and
      // it reads as any other death.
      if (p < 0.45) {
        drop(Math.sin(p * 22) * 0.02 * scale)
        lean(Math.sin(p * 17) * 0.06)
      } else {
        const k = ease((p - 0.45) / 0.45)
        lean(0.06 + k * 1.3)
        drop(-k * 0.25 * scale)
      }
      break
    }

    case "sleep":
    case "collapse": {
      // Not deaths. Sleep is drow poison and the Sleep spell; collapse is a
      // PLAYER at 0, who is unconscious and rolling death saves. Both keep
      // their colour and their opacity - a downed friend must not be dressed
      // as a corpse - and both keep breathing (see the sway).
      const k = ease(Math.min(1, p / 0.7))
      lean(k * 1.4)
      drop(p > 0.7
        ? -0.26 * scale + Math.sin((p - 0.7) * 9) * 0.012 * scale
        : -k * 0.26 * scale)
      break
    }
  }
}

/** Cubic ease-out. Fast at the start, settles - which is how bodies fall. */
function ease(x: number): number {
  const c = Math.min(1, Math.max(0, x))
  return 1 - Math.pow(1 - c, 3)
}
