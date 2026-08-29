// ============================================================================
// SPELL VFX KIT — the baked-flipbook cast effects.
//
// A port of the standalone Faerzress kit. That kit was a global singleton with
// one shared quad pool, one caster position and 9 MB of base64 textures; none
// of that survives contact with this board, which spawns a fresh effect per
// cast, anchors it to the caster's hand BONE, and has a frame budget. So what
// is ported is the art direction, not the architecture:
//
//   • a school-specific rune disc spins up off the hand,
//   • the spell leaves by a route chosen by its damage type — a thrown ball, a
//     held beam, a radiating gust, a column from the sky,
//   • and it blooms on arrival with that type's impact sheet.
//
// Everything is a baked sprite sheet under public/vfx/, fetched lazily and
// cached across casts, so a fireball costs one 176 KB sheet and a rune disc,
// not the whole 6.9 MB library.
//
// Honours the same VfxHandle contract as spell-vfx.ts — update(dt) until it
// returns false, then dispose() — so the board drives both identically.
// ============================================================================
import * as THREE from "three"
import type { VfxHandle } from "./spell-vfx"
import { spellEntry } from "@/lib/spellbook"

export type DamageType =
  | "fire" | "cold" | "lightning" | "thunder" | "acid" | "poison"
  | "necrotic" | "radiant" | "force" | "psychic" | "physical"
  | "healing" | "eldritch"

/** How the spell gets from the hand to the target. From the kit's DELIVERY. */
type Route = "ball" | "beam" | "radiate" | "sky" | "impact-only"

interface TypeSpec {
  /** Sprite sheet for the charge disc. */
  rune: string
  route: Route
  /** Sheet that travels (ball) or stretches (beam). */
  travel?: string
  /** Sheet that plays at the destination. */
  impact?: string
  /** Impact size multiplier — some sheets are framed tighter than others. */
  impactScale?: number
  /** Seconds the disc spins before the spell leaves. From the kit's CHARGE. */
  charge: number
  /** Board units per second for a thrown ball. */
  speed?: number
  /** Tint applied to the (grayscale-ish) baked art. */
  tint: number
}

// Two types have no baked sheet: lightning was drawn procedurally as branching
// bolts, and physical is a weapon hit. Both fall through to the older effect —
// see hasKitEffect below. Everything else is covered.
const TYPES: Partial<Record<DamageType, TypeSpec>> = {
  fire:     { rune: "runeFire",     route: "ball",        travel: "fireball",      impact: "fireball",       impactScale: 2.6, charge: 0.80, speed: 15, tint: 0xffffff },
  cold:     { rune: "runeFrost",    route: "beam",        travel: "frostBeam",     impact: "frostImpact",    charge: 0.70, tint: 0xffffff },
  necrotic: { rune: "runeNecrotic", route: "beam",        travel: "necroBeam",     impact: "necroImpact",    charge: 0.75, tint: 0xffffff },
  eldritch: { rune: "runeEldritch", route: "beam",        travel: "eldBeam",       impact: "eldImpact",      charge: 0.70, tint: 0xffffff },
  poison:   { rune: "runeAcid",     route: "ball",        travel: "poisonBolt",    impact: "poisonCloud",    charge: 0.65, speed: 11, tint: 0xffffff },
  force:    { rune: "runeForce",    route: "ball",        travel: "missileDart",   impact: "forceHit",       charge: 0.65, speed: 20, tint: 0xffffff },
  psychic:  { rune: "runePsychic",  route: "ball",        travel: "psychicHalo",   impact: "psychicImpact",  charge: 0.70, speed: 14, tint: 0xffffff },
  thunder:  { rune: "runeStorm",    route: "radiate",     travel: "thunderGust",   impact: "thunderImpact",  charge: 0.60, tint: 0xffffff },
  radiant:  { rune: "runeRadiant",  route: "sky",         impact: "radiantColumn",  impactScale: 1.0, charge: 0.85, tint: 0xffffff },
  healing:  { rune: "runeHealing",  route: "sky",         impact: "healingShimmer", impactScale: 1.2, charge: 0.80, tint: 0xffffff },
  acid:     { rune: "runeAcid",     route: "impact-only", impact: "acidImpact",     charge: 0.60, tint: 0xffffff },
}

export function hasKitEffect(type: DamageType): boolean {
  return type in TYPES
}

// ── flag + resolver ─────────────────────────────────────────────────────────
// One entry point for the board: given a spell name, either a type the kit can
// draw, or null meaning "use the old effect". Keeping the flag and the lookup
// here is what lets combat-board-3d.tsx take a six-line diff.

const FLAG_KEY = "ashes.vfxKit"

/**
 * On by default — these are the spell effects now.
 *
 * The escape hatch is kept deliberately: if a cast ever looks wrong or costs
 * too much mid-session, `localStorage.setItem("ashes.vfxKit","0")` and a
 * reload puts the old sparks back instantly, without waiting for a deploy.
 * Anything other than "0" (including nothing at all) means on.
 */
export function kitEnabled(): boolean {
  if (typeof window === "undefined") return true
  try {
    return window.localStorage.getItem(FLAG_KEY) !== "0"
  } catch {
    return true // private mode, blocked storage — still show the effects
  }
}

/**
 * Which kit effect a spell should use, or null to fall back.
 *
 * The spellbook is the authority on damage type, so this reads it rather than
 * carrying a second copy of that mapping. Two spellbook facts do not map
 * straight across: Eldritch Blast is typed `force` but has always had its own
 * violet look, and healing spells carry no damage type at all.
 */
export function kitVfxTypeFor(spellName: string): DamageType | null {
  if (!kitEnabled()) return null
  const e = spellEntry(spellName)
  if (!e) return null
  const type: DamageType | null =
    e.school === "eldritch" ? "eldritch"
    : e.heals ? "healing"
    : ((e.damage as DamageType | undefined) ?? null)
  return type && hasKitEffect(type) ? type : null
}

// ── asset loading ───────────────────────────────────────────────────────────
// Lazy and cached. The manifest is fetched once; each sheet at most once, no
// matter how many casts ask for it.

interface SheetMeta { file: string; cols: number; rows: number; frames: number; fps: number }
interface Sheet extends SheetMeta { tex: THREE.Texture }

const VFX_BASE = "/vfx"
let manifestPromise: Promise<Record<string, SheetMeta>> | null = null
const sheets = new Map<string, Promise<Sheet>>()
const ready = new Map<string, Sheet>()

function getManifest(): Promise<Record<string, SheetMeta>> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${VFX_BASE}/manifest.json`).then((r) => {
      if (!r.ok) throw new Error(`vfx manifest ${r.status}`)
      return r.json()
    })
  }
  return manifestPromise
}

function loadSheet(key: string): Promise<Sheet> {
  let p = sheets.get(key)
  if (p) return p
  p = getManifest().then(async (man) => {
    const meta = man[key]
    if (!meta) throw new Error(`no vfx sheet "${key}"`)
    const tex = await new THREE.TextureLoader().loadAsync(`${VFX_BASE}/${meta.file}`)
    tex.colorSpace = (THREE as any).SRGBColorSpace ?? tex.colorSpace
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    const sheet: Sheet = { ...meta, tex }
    ready.set(key, sheet)
    return sheet
  })
  sheets.set(key, p)
  return p
}

/**
 * Warm the sheets a spell will need. Call this when the cast is *pressed*, so
 * the textures have arrived by the release frame and the first cast of a type
 * looks like every later one.
 */
export function prewarmKit(type: DamageType): void {
  const spec = TYPES[type]
  if (!spec) return
  void loadSheet(spec.rune).catch(() => {})
  if (spec.travel) void loadSheet(spec.travel).catch(() => {})
  if (spec.impact) void loadSheet(spec.impact).catch(() => {})
}

// ── one animated quad ───────────────────────────────────────────────────────

class Flip {
  readonly mesh: THREE.Mesh
  private readonly mat: THREE.MeshBasicMaterial
  private readonly geo: THREE.PlaneGeometry
  private readonly tex: THREE.Texture
  private readonly sheet: Sheet

  constructor(sheet: Sheet, tint: number, w: number, h: number) {
    this.sheet = sheet
    // Clone so this cast owns its UV window; the image itself is shared.
    this.tex = sheet.tex.clone()
    this.tex.needsUpdate = true
    this.tex.repeat.set(1 / sheet.cols, 1 / sheet.rows)
    this.geo = new THREE.PlaneGeometry(w, h)
    this.mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      color: tint,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      // The board tone-maps the scene; these sheets were baked with their
      // final colour already in them, so opt them out or they go muddy.
      toneMapped: false,
    })
    this.mesh = new THREE.Mesh(this.geo, this.mat)
    this.mesh.frustumCulled = false
    this.setFrame(0)
  }

  /** `p` is 0..1 through the sheet. Past 1 it holds the last frame. */
  setProgress(p: number) {
    this.setFrame(Math.min(this.sheet.frames - 1, Math.floor(p * this.sheet.frames)))
  }

  /** `p` is 0..1 and wraps — for effects that loop while they live. */
  setLooping(p: number) {
    this.setFrame(Math.floor(p * this.sheet.frames) % this.sheet.frames)
  }

  private setFrame(i: number) {
    const col = i % this.sheet.cols
    const row = Math.floor(i / this.sheet.cols)
    this.tex.offset.set(col / this.sheet.cols, 1 - (row + 1) / this.sheet.rows)
  }

  set opacity(v: number) { this.mat.opacity = v }
  get opacity() { return this.mat.opacity }

  dispose() {
    this.geo.dispose()
    this.mat.dispose()
    this.tex.dispose()
  }
}

// ── the cast ────────────────────────────────────────────────────────────────

const UP = new THREE.Vector3(0, 1, 0)

export function castSpellKitVfx(opts: {
  parent: THREE.Object3D
  anchor: THREE.Object3D
  type: DamageType
  target?: THREE.Vector3 | null
  camera?: THREE.Camera | null
  /** Area spells draw bigger. 1 = a single square. */
  scale?: number
}): VfxHandle {
  const { parent, anchor, type } = opts
  const spec = TYPES[type]
  const target = opts.target ? opts.target.clone() : null
  const areaScale = opts.scale ?? 1

  const group = new THREE.Group()
  parent.add(group)

  let disc: Flip | null = null
  let travel: Flip | null = null
  let impact: Flip | null = null
  let light: THREE.PointLight | null = null

  const hand = new THREE.Vector3()
  anchor.getWorldPosition(hand)

  const charge = spec ? spec.charge : 0
  const flightTime =
    spec && spec.route === "ball" && target
      ? Math.max(0.12, hand.distanceTo(target) / (spec.speed ?? 15))
      : spec && (spec.route === "beam" || spec.route === "radiate")
        ? 0.55
        : 0.0
  const impactLife = 0.9
  const lifetime = charge + flightTime + impactLife

  let t = 0
  let disposed = false
  let impacted = false

  // Sheets may still be in flight. Each builder is a no-op until its sheet
  // lands, and the effect simply starts from wherever it has got to — a cast
  // never blocks on IO.
  if (spec) {
    void loadSheet(spec.rune).then((s) => {
      if (disposed) return
      disc = new Flip(s, spec.tint, 1.1, 1.1)
      group.add(disc.mesh)
    }).catch(() => {})

    if (spec.travel) {
      void loadSheet(spec.travel).then((s) => {
        if (disposed) return
        const isBeam = spec.route === "beam" || spec.route === "radiate"
        travel = new Flip(s, spec.tint, isBeam ? 1 : 0.9, isBeam ? 0.55 : 0.9)
        travel.opacity = 0
        group.add(travel.mesh)
      }).catch(() => {})
    }

    if (spec.impact) {
      void loadSheet(spec.impact).then((s) => {
        if (disposed) return
        const k = (spec.impactScale ?? 1.6) * areaScale
        impact = new Flip(s, spec.tint, 2.0 * k, 2.0 * k)
        impact.opacity = 0
        group.add(impact.mesh)
      }).catch(() => {})
    }

    // One non-shadowing light, matching the board's stated budget.
    light = new THREE.PointLight(spec.tint === 0xffffff ? 0xfff0d0 : spec.tint, 0, 9, 1.6)
    light.castShadow = false
    group.add(light)
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    disc?.dispose()
    travel?.dispose()
    impact?.dispose()
    if (light) group.remove(light)
    parent.remove(group)
  }

  /** Face the camera, or fall back to standing upright. */
  const billboard = (m: THREE.Object3D) => {
    if (opts.camera) m.quaternion.copy(opts.camera.quaternion)
  }

  const dest = new THREE.Vector3()
  const dir = new THREE.Vector3()

  return {
    update(dt: number) {
      if (disposed) return false
      if (!spec) { dispose(); return false }
      t += dt

      anchor.getWorldPosition(hand)
      dest.copy(target ?? hand)

      // ── 1. the disc spins up off the hand ──────────────────────────────
      if (disc) {
        const p = Math.min(1, t / charge)
        if (t <= charge) {
          disc.mesh.position.copy(hand)
          // Vertical plane, facing along the cast, turning slowly — the disc
          // is meant to read as a sigil being drawn, not a spinning coin.
          if (target) {
            dir.subVectors(dest, hand).setY(0).normalize()
            disc.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
          } else {
            billboard(disc.mesh)
          }
          disc.mesh.rotateZ(t * 1.5)
          disc.setLooping(t * 1.6)
          disc.opacity = p < 0.25 ? p / 0.25 : 1
          disc.mesh.scale.setScalar(0.7 + 0.3 * p)
          if (light) light.intensity = 6 * p
        } else {
          // It does not vanish at launch; it fades as the spell leaves.
          const f = Math.max(0, 1 - (t - charge) / 0.35)
          disc.opacity = f
          disc.mesh.scale.setScalar(1 + (1 - f) * 0.6)
        }
      }

      // ── 2. delivery ────────────────────────────────────────────────────
      if (t >= charge && travel) {
        const ft = t - charge
        const p = flightTime > 0 ? Math.min(1, ft / flightTime) : 1

        if (spec.route === "ball") {
          travel.mesh.position.lerpVectors(hand, dest, p)
          billboard(travel.mesh)
          travel.setLooping(ft * 2.2)
          travel.opacity = 1
          if (light) {
            light.position.copy(travel.mesh.position).sub(group.position)
            light.intensity = 14
          }
        } else {
          // Beam and radiate: a quad stretched from the hand outward. Thunder
          // is deliberately NOT a projectile — it is a focused ripple that
          // rolls toward the target.
          const len = hand.distanceTo(dest) || 1
          const reach = spec.route === "radiate" ? len * 0.78 : len
          travel.mesh.position.copy(hand).lerp(dest, 0.5)
          dir.subVectors(dest, hand).normalize()
          travel.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir)
          travel.mesh.scale.set(reach, 1 + (spec.route === "radiate" ? 1.4 : 0), 1)
          travel.setLooping(ft * 2.6)
          travel.opacity = p < 0.15 ? p / 0.15 : Math.max(0, 1 - (p - 0.6) / 0.4)
          if (light) { light.position.set(0, 0, 0); light.intensity = 10 }
        }
      }

      // ── 3. impact ──────────────────────────────────────────────────────
      const impactAt = charge + flightTime
      if (t >= impactAt && impact) {
        if (!impacted) {
          impacted = true
          impact.mesh.position.copy(dest)
          if (spec.route === "sky") impact.mesh.position.y += 0.9
        }
        const p = Math.min(1, (t - impactAt) / impactLife)
        if (spec.route === "sky") {
          // A column stands upright rather than facing the camera.
          impact.mesh.quaternion.identity()
          if (opts.camera) {
            dir.subVectors(opts.camera.position, impact.mesh.position).setY(0).normalize()
            impact.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
          }
        } else {
          billboard(impact.mesh)
        }
        impact.setProgress(p)
        impact.opacity = 1 - Math.max(0, (p - 0.7) / 0.3)
        if (light) {
          light.position.copy(dest).sub(group.position)
          light.intensity = 18 * (1 - p)
        }
      }

      if (t >= lifetime) { dispose(); return false }
      return true
    },
    dispose,
  }
}

/** Drop every cached sheet — used by tests and by dev hot-reload. */
export function _resetKitCache() {
  manifestPromise = null
  sheets.clear()
  ready.clear()
}
