// ============================================================================
// THE TWELVE DEATHS — a creature ends the way the thing that killed it says.
//
// The old death was one effect: replay the damage type's impact sheet over the
// body, bigger and slower. It told you a spell had landed. It did not tell you
// the drow had been dissolved rather than frozen, and at a table those are not
// the same story.
//
// A death here is TWO things at once:
//
//   the BODY   what happens to the mesh. Colour, dissolve, sink, shake,
//              shrink, fall. This is the half that carries the meaning -
//              a body that goes green and stops reads as poison with no
//              particle on screen at all.
//   the AIR    particles and light around it. Ash going up, steam coming off,
//              bone dust, a rime of frost.
//
// WHY IT DOES NOT HOLD THE OBJECT
//
// The board REBUILDS a token whenever its HP changes (combat-board-3d's
// glideToken calls spawnToken, which reloads the GLB from scratch). The
// killing blow is an HP change. So an effect that captured `entry.obj` when it
// was created would be painting a corpse that had already been thrown away.
//
// Every death therefore takes a `resolve()` and asks for the body EVERY FRAME.
// It survives the rebuild, and it survives two rebuilds.
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

/** How long each death takes to play. The body keeps whatever it ends as. */
const LIFE: Record<DeathKind, number> = {
  burn: 2.2, burst: 1.1, melt: 2.6, char: 1.8, raise: 2.4, freeze: 2.0,
  mangle: 1.2, impale: 1.4, sleep: 2.0, anguish: 1.6, ashes: 2.0,
  wither: 2.0, collapse: 1.4,
}

/** What the body ends up coloured, when a death recolours it at all. */
const STAIN: Partial<Record<DeathKind, THREE.Color>> = {
  burn:    new THREE.Color(0x2a1206),
  char:    new THREE.Color(0x14100e),
  raise:   new THREE.Color(0xd9d2bd),
  freeze:  new THREE.Color(0x9fd8ee),
  wither:  new THREE.Color(0x5f8f3a),
  melt:    new THREE.Color(0x8fa832),
  ashes:   new THREE.Color(0xfff4d2),
}

/** The mote colour thrown into the air, per death. */
const MOTE: Partial<Record<DeathKind, number>> = {
  burn: 0xff9a3c, burst: 0xffe9b0, melt: 0xb6e04a, char: 0x9fd0ff,
  raise: 0xb9a6d8, freeze: 0xcdefff, mangle: 0x8e1414, impale: 0x8e1414,
  anguish: 0xe86bd8, ashes: 0xfff6dc, wither: 0x76c04a,
}

type Painted = {
  mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | THREE.MeshPhongMaterial
  baseColor: THREE.Color
  baseOpacity: number
}

/**
 * Clone every material under `root` once so this death can paint them without
 * touching any other token that shares the same loaded asset.
 */
function claim(root: THREE.Object3D, out: Painted[]) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const cloned = list.map((m) => {
      const c = (m as THREE.Material).clone() as Painted["mat"]
      c.transparent = true
      out.push({
        mat: c,
        baseColor: (c as THREE.MeshStandardMaterial).color?.clone() ?? new THREE.Color(0xffffff),
        baseOpacity: c.opacity ?? 1,
      })
      return c
    })
    mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]
  })
}

/** A puff of motes that rise, drift and fade. One geometry, one draw call. */
function motes(colour: number, count: number, spread: number, rise: number) {
  const pos = new Float32Array(count * 3)
  const vel = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * spread
    pos[i * 3] = Math.cos(a) * r
    pos[i * 3 + 1] = Math.random() * 0.3
    pos[i * 3 + 2] = Math.sin(a) * r
    vel[i * 3] = (Math.random() - 0.5) * 0.35
    vel[i * 3 + 1] = rise * (0.5 + Math.random())
    vel[i * 3 + 2] = (Math.random() - 0.5) * 0.35
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    color: colour, size: 0.11, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  })
  return { points: new THREE.Points(geo, mat), pos, vel, mat, geo }
}

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

  const cloud = moteColour
    ? motes(moteColour,
        kind === "burst" ? 90 : kind === "ashes" ? 70 : 44,
        0.45 * scale,
        kind === "melt" ? 0.15 : kind === "burst" ? 2.4 : 0.9)
    : null
  if (cloud) {
    cloud.points.position.y = 0.35 * scale
    group.add(cloud.points)
  }

  // Claimed lazily: the body may not exist yet on frame one, because the
  // rebuild that the killing blow triggers is asynchronous (it reloads a GLB).
  let painted: Painted[] | null = null
  let claimedFrom: THREE.Object3D | null = null
  let baseY: number | null = null

  let t = 0
  let disposed = false

  const dispose = () => {
    if (disposed) return
    disposed = true
    if (cloud) { cloud.geo.dispose(); cloud.mat.dispose(); group.remove(cloud.points) }
    group.remove(light)
    parent.remove(group)
    // The cloned materials are NOT disposed. They are still assigned to the
    // body's meshes and are the only thing holding its final state - the char,
    // the green, the missing opacity of something burned away. Freeing them
    // here would either drop that state or leave the renderer re-uploading a
    // material it was told to release. The body owns them now; they go when
    // spawnToken next replaces it.
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
      // object identity is what makes this survive spawnToken.
      if (body && body !== claimedFrom) {
        // The previous set belongs to a body the board has thrown away; the
        // meshes went with it, so there is nothing to leave holding state.
        painted?.forEach((x) => x.mat.dispose())
        painted = []
        claim(body, painted)
        claimedFrom = body
        baseY = body.position.y
      }

      if (body && painted) {
        applyBody(kind, p, body, painted, stain, baseY ?? 0, scale, args.posed === true)
      }

      if (cloud) {
        for (let i = 0; i < cloud.pos.length; i += 3) {
          cloud.pos[i] += cloud.vel[i] * dt
          cloud.pos[i + 1] += cloud.vel[i + 1] * dt
          cloud.pos[i + 2] += cloud.vel[i + 2] * dt
          cloud.vel[i + 1] -= (kind === "burst" ? 3.2 : 0.25) * dt
        }
        cloud.geo.attributes.position.needsUpdate = true
        cloud.mat.opacity = p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88
      }

      light.intensity = 14 * scale * (1 - p) * (1 - p)

      if (p >= 1) { dispose(); return false }
      return true
    },
    dispose,
  }
}

/**
 * The body half. Everything here is a function of p (0 to 1) so a death can be
 * scrubbed, and so nothing accumulates - a frame drop changes the smoothness,
 * never the destination.
 */
function applyBody(
  kind: DeathKind,
  p: number,
  body: THREE.Object3D,
  painted: Painted[],
  stain: THREE.Color | undefined,
  baseY: number,
  scale: number,
  /** The model animates its own fall; leave its transform alone. */
  posed: boolean,
) {
  // How far the stain has taken hold. Most deaths colour early and hold.
  const tint = Math.min(1, p / 0.45)
  if (stain) {
    for (const m of painted) {
      const c = (m.mat as THREE.MeshStandardMaterial).color
      if (c) c.copy(m.baseColor).lerp(stain, tint)
    }
  }

  const setOpacity = (o: number) => {
    for (const m of painted) m.mat.opacity = m.baseOpacity * o
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
      // Blackens, buckles, and is consumed. The fall matters: a body that
      // fades out standing up reads as a spell being dispelled, not as
      // something burning. It goes down FIRST and is eaten afterwards.
      const k = ease(Math.min(1, p / 0.55))
      lean(k * 1.15)
      drop(-k * 0.2 * scale)
      setOpacity(1 - Math.max(0, (p - 0.45) / 0.55))
      shrink(1 - p * 0.12)
      break
    }

    case "ashes":
      // Radiant. Whites out first - the light gets INTO it - and then there is
      // nothing left. Faster than fire: no char, no remains.
      setOpacity(1 - Math.max(0, (p - 0.25) / 0.75))
      shrink(1 + p * 0.06)
      break

    case "burst":
      // Force and thunder. One frame of overscale, then gone. There is no
      // body afterwards, which is the whole point of being torn apart.
      //
      // The opacity is NOT guarded by `posed`: a model with its own death clip
      // still has to stop existing here, or the board keeps a body standing in
      // the square where a creature was torn apart.
      if (p < 0.14) shrink(1 + p * 2.2)
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
      // Lightning. Convulses hard and fast, then stops black. The shake is on
      // a decaying envelope so it reads as current, not as a stagger.
      const shake = Math.max(0, 1 - p / 0.5)
      nudge(Math.sin(p * 190) * 0.05 * shake * scale, Math.cos(p * 173) * 0.05 * shake * scale)
      lean(p >= 0.5 ? 0 : Math.sin(p * 140) * 0.10 * shake)
      break
    }

    case "raise":
      // Necrotic. The flesh goes and the pale stays - a skeleton by material,
      // since the board has no skeleton MODEL to swap to. Says so out loud:
      // this is the honest approximation, not a claim to have built the thing.
      squash(1 - p * 0.10, 1 - p * 0.05, 1 - p * 0.10)
      setOpacity(1 - p * 0.25)
      break

    case "freeze":
      // Cold. Everything stops at once - no sag, no fall. It ices where it
      // stood, which is why this one does not move the body at all.
      shrink(1 + p * 0.02)
      break

    case "wither":
      // Poison. Goes green and simply stops. The only motion is a slow lean,
      // because a poisoned thing does not get thrown anywhere.
      lean(ease(p) * 0.22)
      drop(-ease(p) * 0.08 * scale)
      break

    case "mangle": {
      // Weapon. Takes the blow, then goes down sideways. The 15% overshoot on
      // the fall is what stops it looking like a lift being lowered.
      const k = ease(p)
      lean(k * 1.35 * (1 + 0.15 * Math.sin(p * Math.PI)))
      drop(-k * 0.25 * scale)
      break
    }

    case "impale": {
      // Arrows. A hard jolt BACKWARD on the shaft, then down. The jolt is the
      // read - a pierced creature is pushed, a slashed one folds.
      const jolt = Math.max(0, 1 - p / 0.18)
      nudge(0, -jolt * 0.16 * scale)
      const k = ease(Math.max(0, (p - 0.15) / 0.85))
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
        const k = ease((p - 0.45) / 0.55)
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
