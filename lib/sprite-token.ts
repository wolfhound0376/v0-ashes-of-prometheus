/**
 * PIXEL-ART SPRITES ON THE 3D BOARD — the HD-2D token.
 *
 * A token whose `model_url` ends in `.json` is not a GLB and not a cutout: it
 * is a sprite manifest (public/sprites/<slug>/sprite.json, built by
 * scripts/sprites/build-sprite.py from a PixelLab character). This file turns
 * that manifest into one flat, camera-facing figure that:
 *
 *  - picks the right one of EIGHT drawn directions from the token's facing
 *    relative to the camera, so a figure walking left shows its left side
 *    whichever quarter the camera has turned to;
 *  - steps through the frames of whatever it is doing (idle, walk, attack,
 *    cast, hurt, dead) at the pixel artist's frame rate;
 *  - is LIT like everything else on the board (a standard material, not an
 *    unlit sprite) and casts a proper shadow, which is most of what makes
 *    Octopath-style sprites sit in a 3D room instead of floating over it;
 *  - draws every pixel square (nearest filtering, no mipmaps).
 *
 * It owns no game state. The board says what the figure is doing (play) and
 * ticks it every frame (update); everything else - where it stands, which way
 * the body faces, when it dies - stays the board's.
 */
import * as THREE from "three"

/** The eight directions, in the ROW order of every sheet. South faces the viewer. */
export const SPRITE_DIRECTIONS = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
] as const

export type SpriteState = "idle" | "walk" | "attack" | "cast" | "hurt" | "dodge" | "dead"

export interface SpriteAnimation {
  /** Sheet PNG, relative to the manifest. Rows = SPRITE_DIRECTIONS, columns = frames. */
  sheet: string
  frames: number
  fps: number
  /** Loops forever (idle, walk) or plays once. */
  loop: boolean
  /** For attack/cast: the fraction of the animation where the blow lands. */
  hit?: number
}

export interface SpriteManifest {
  version: 1
  name: string
  /** One cell of every sheet, in pixels. */
  cell: [number, number]
  /** The pixel, within a cell, that stands on the floor (feet centre). */
  pivot: [number, number]
  /** Pixels per world unit. One square is one unit, so 100 makes a 128px cell 1.28 squares tall. */
  ppu: number
  animations: Partial<Record<SpriteState, SpriteAnimation>>
}

/**
 * How far the flat figure leans back toward the camera, as a fraction of the
 * camera's pitch. 0 stands bolt upright (squashed to 71% height under a 45°
 * camera); 1 lies flat to the screen but pokes its head a square backwards
 * into whoever stands behind. Half is the HD-2D compromise.
 */
const LEAN = 0.5
/** Light the figure gives itself, so a sprite in a dark corner is dim, not black. */
const SELF_LIGHT = 0.35
/**
 * FEET OVER THE FLOOR LAYERS. The board floats see-through layers just above
 * the floor - base ring 0.06, darkness 0.085, the party glow 0.10, the active
 * glow - and they draw after anything solid, so whatever stands lower than
 * ~0.1 is painted over. A 6 ft model loses its soles; a 3 ft halfling lost
 * her boots (Sam, 9/25: "where are her feet?"). The bottom of every figure is
 * drawn a second time, after those layers, in a band this tall (world units,
 * above the feet). Only the band: redrawing the whole figure late would lay it
 * over spell effects flying in front of it.
 */
const FEET_BAND = 0.14
/** Draws after every floor layer (the highest is the active glow at 7), before damage numbers (999). */
const FEET_ORDER = 8

/** What to show when the asked-for state was never drawn. */
const FALLBACK: Record<SpriteState, SpriteState[]> = {
  idle: [],
  walk: ["idle"],
  attack: ["cast", "idle"],
  cast: ["attack", "idle"],
  hurt: [],
  // No borrowed pose for a dodge: a figure that flinches on a miss is lying.
  // Undrawn, the board moves the body instead (defenceMotion).
  dodge: [],
  dead: [],
}

const manifestCache = new Map<string, Promise<SpriteManifest>>()
const sheetCache = new Map<string, THREE.Texture>()
const sheetLoader = new THREE.TextureLoader()

function loadManifest(url: string): Promise<SpriteManifest> {
  let p = manifestCache.get(url)
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`sprite manifest ${url}: HTTP ${r.status}`)
      return r.json() as Promise<SpriteManifest>
    })
    // A failed fetch must not be cached forever - the next spawn may retry.
    p.catch(() => manifestCache.delete(url))
    manifestCache.set(url, p)
  }
  return p
}

/** One shared image per sheet; each figure clones it for its own frame offset. */
function sheetTexture(url: string): THREE.Texture {
  let t = sheetCache.get(url)
  if (!t) {
    t = sheetLoader.load(url)
    t.colorSpace = THREE.SRGBColorSpace
    t.magFilter = THREE.NearestFilter
    t.minFilter = THREE.NearestFilter
    t.generateMipmaps = false
    sheetCache.set(url, t)
  }
  return t
}

/** A stable 0..1 from a token id, so two figures never breathe in lockstep. */
/**
 * EVERY ANIMATION THE SAME HEIGHT. Animations made at different times can be
 * drawn at different sizes: PixelLab's newer skeleton walk stands a figure
 * at its full rotation height, ~10% taller than the older idle, so the
 * figure grew each time it set off and shrank when it stopped. Each sheet's
 * first frame (south, frame 0) is an upright pose, even a death fall's, so
 * its drawn height is measured once the image has loaded and the card is
 * scaled to match the idle's. Measured per sheet URL and shared, like the
 * sheets themselves.
 */
const drawnHeights = new Map<string, number | null>()

/** Rows of opaque pixels in a sheet's first cell, or null until the image has loaded. */
function drawnHeight(tex: THREE.Texture, cell: [number, number]): number | null {
  const img = tex.image as (CanvasImageSource & { width: number; height: number }) | undefined
  const key = (img as HTMLImageElement | undefined)?.src ?? ""
  if (key && drawnHeights.has(key)) return drawnHeights.get(key)!
  if (!img || !img.width) return null
  const [cw, ch] = cell
  const c = document.createElement("canvas")
  c.width = cw
  c.height = ch
  const ctx = c.getContext("2d")
  if (!ctx) return null
  // Flipped textures are stored the right way up in the image itself.
  ctx.drawImage(img, 0, 0, cw, ch, 0, 0, cw, ch)
  const data = ctx.getImageData(0, 0, cw, ch).data
  let top = -1
  let bottom = -1
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (data[(y * cw + x) * 4 + 3] > 16) {
        if (top < 0) top = y
        bottom = y
        break
      }
    }
  }
  const h = top < 0 ? null : bottom - top + 1
  if (key) drawnHeights.set(key, h)
  return h
}

/** Beyond this, a sheet's first frame is not a standing pose; leave it alone. */
const HEIGHT_MATCH_LIMIT: [number, number] = [0.8, 1.25]

function phaseOf(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return ((h >>> 0) % 1000) / 1000
}

/** True when a model_url names a sprite manifest rather than a GLB or a cutout. */
export function isSpriteManifestUrl(url: string | null | undefined): url is string {
  return Boolean(url && /\.json(\?|$)/i.test(url))
}

interface PlayOptions {
  /** Called once, on the frame the blow lands (attack/cast), or at the end if no hit mark. */
  onHit?: () => void
}

export class SpriteRig {
  /** Add this to the token's group. Its origin is the figure's feet. */
  readonly object = new THREE.Group()
  readonly url: string
  private manifest: SpriteManifest | null = null
  private mesh: THREE.Mesh | null = null
  private feet: THREE.Mesh | null = null
  private material: THREE.MeshStandardMaterial | null = null
  private depthMaterial: THREE.MeshDepthMaterial | null = null
  private textures = new Map<SpriteState, THREE.Texture>()
  private state: SpriteState = "idle"
  private t = 0
  private readonly phase: number
  private pending: { state: SpriteState; opts: PlayOptions; skipToEnd: boolean } | null = null
  /** Down with no drawn death: the card lies flat on the floor instead. */
  private fallen = false
  private onHit: (() => void) | null = null
  private hitAt = Infinity
  /** Per-state card scale so every animation stands as tall as the idle (see drawnHeight). */
  private heightScale = new Map<SpriteState, number>()
  private disposed = false
  private readonly fwd = new THREE.Vector3()

  constructor(url: string, seed: string, onError?: (e: unknown) => void) {
    this.url = url
    this.phase = phaseOf(seed)
    loadManifest(url)
      .then((m) => {
        if (this.disposed) return
        this.build(m)
      })
      .catch((e) => {
        // The board's pawn is not drawn behind a sprite, so say so loudly: a
        // missing manifest is an invisible token otherwise.
        console.warn(`[sprite] ${url} failed to load`, e)
        onError?.(e)
      })
  }

  /** The figure has a drawing for this state (without falling back). */
  has(state: SpriteState): boolean {
    return Boolean(this.manifest?.animations[state])
  }

  /** Whether the manifest has arrived yet. */
  get ready(): boolean {
    return this.manifest !== null
  }

  /** The state being shown now. */
  get current(): SpriteState {
    return this.fallen ? "dead" : this.state
  }

  /**
   * Show this state. Loops (idle, walk) are not restarted if already playing;
   * one-shots always start from their first frame. `skipToEnd` lands a
   * one-shot on its last frame - a body that was dead before the board
   * loaded does not die again on every reload.
   */
  play(state: SpriteState, opts: PlayOptions = {}, skipToEnd = false): boolean {
    if (!this.manifest) {
      // Not loaded yet: remember the latest ask and honour it on arrival. A
      // blow must still land, so a hit asked for now fires when it would have.
      this.pending = { state, opts, skipToEnd }
      return true
    }
    const resolved = this.resolve(state)
    if (!resolved) {
      opts.onHit?.()
      if (state === "dead") {
        // Never drawn dying. A figure standing at 0 HP reads as alive, so it
        // is laid on its back instead - still, on its standing frame.
        this.fallen = true
        return true
      }
      return false
    }
    this.fallen = false
    const anim = this.manifest.animations[resolved]!
    if (anim.loop && resolved === this.state && !opts.onHit) return true
    // A blow that was pending on the previous one-shot lands now rather than
    // never: whatever interrupted the swing, the damage still happened.
    this.fireHit()
    this.state = resolved
    const dur = anim.frames / anim.fps
    this.t = skipToEnd ? dur : 0
    this.onHit = opts.onHit ?? null
    this.hitAt = opts.onHit ? (anim.hit ?? 1) * dur : Infinity
    this.mesh && this.bindSheet(resolved)
    return true
  }

  /**
   * The board's action vocabulary (TokenState, from lib/token-animation) in,
   * a clip-shaped answer out, so the board's cast pipeline can treat a sprite
   * the way it treats a GLB: `release` is the second the blow lands, read off
   * the drawn hit frame. Null when nothing fitting was drawn.
   */
  playFor(action: string): { name: string; duration: number; release: number } | null {
    const state: SpriteState | null =
      action === "cast" ? "cast"
      : action === "attack" || action === "lightAttack" ? "attack"
      : action === "hurt" ? "hurt"
      : action === "dodge" ? "dodge"
      : null
    if (!state || !this.manifest) return null
    const resolved = this.resolve(state)
    if (!resolved) return null
    const anim = this.manifest.animations[resolved]!
    this.play(resolved)
    const duration = anim.frames / anim.fps
    return { name: `sprite-${resolved}`, duration, release: (anim.hit ?? 0.5) * duration }
  }

  /**
   * Advance the frame clock and turn the figure to the camera.
   * `bodyYaw` is the token group's world yaw — which way the body faces.
   */
  update(dt: number, camera: THREE.Camera, bodyYaw: number): void {
    const m = this.manifest
    const mesh = this.mesh
    if (!m || !mesh) return

    // ---- time
    this.t += dt
    if (this.t >= this.hitAt) this.fireHit()
    let anim = this.fallen ? m.animations.idle : m.animations[this.state]
    if (!anim) return
    if (!this.fallen && !anim.loop && this.t >= anim.frames / anim.fps && this.state !== "dead") {
      // A swing or a flinch is over: the blow has landed (if it never found
      // its mark frame, now), and the figure goes back to standing. Dead
      // alone holds its last frame.
      this.fireHit()
      this.play("idle")
      anim = m.animations[this.state]
      if (!anim) return
    }
    const dur = anim.frames / anim.fps
    const frame = this.fallen
      ? 0
      : anim.loop
      ? Math.floor(((this.t + this.phase * dur) * anim.fps) % anim.frames)
      : Math.min(anim.frames - 1, Math.floor(this.t * anim.fps))

    // ---- where the camera looks, flattened to the floor
    camera.getWorldDirection(this.fwd)
    const camYaw = Math.atan2(this.fwd.x, this.fwd.z)
    const pitch = Math.asin(THREE.MathUtils.clamp(-this.fwd.y, -1, 1))

    // ---- which of the eight drawings: the body's facing, seen from the camera.
    // 0 = looking back at the camera (south); positive = turned to screen-right.
    let rel = bodyYaw - (camYaw + Math.PI)
    rel = Math.atan2(Math.sin(rel), Math.cos(rel))
    const dir = ((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8

    // ---- the same height whatever it is doing (feet are the origin, so they stay put)
    const k = this.fallen ? 1 : this.scaleFor(this.state)
    mesh.scale.set(k, k, 1)

    // ---- stand the card up facing the camera, whatever the body is doing
    mesh.rotation.set(this.fallen ? -Math.PI / 2 : -pitch * LEAN, camYaw + Math.PI - bodyYaw, 0, "YXZ")
    // Lying down: above the floor layers (see FEET_BAND), which would
    // otherwise wash out a body lying flat among them.
    mesh.position.y = this.fallen ? 0.11 : 0

    // ---- point the sheet at the cell
    const worn = this.liveMaterial()
    // A death that fades the body (death-vfx) lowers opacity, and alpha x
    // opacity under the 0.5 cut-out would drop the whole figure at once,
    // half-way through its fade. Pixel art is fully solid or fully clear, so
    // while it fades the cut-out can sit near zero and the fade stays a fade.
    if (worn) worn.alphaTest = worn.opacity < 0.999 ? 0.01 : 0.5
    // The feet redraw wears whatever the body wears this frame - the death's
    // tint and fade included - or the boots would stay bright on a corpse.
    const feetMat = this.feet?.material as THREE.MeshStandardMaterial | undefined
    if (worn && feetMat) {
      if (feetMat.map !== worn.map) { feetMat.map = worn.map; feetMat.emissiveMap = worn.map; feetMat.needsUpdate = true }
      feetMat.color.copy(worn.color)
      feetMat.emissive.copy(worn.emissive)
      feetMat.emissiveIntensity = worn.emissiveIntensity
      feetMat.opacity = worn.opacity
      feetMat.alphaTest = worn.alphaTest
    }
    const tex = worn?.map
    if (tex) {
      tex.offset.set(frame / anim.frames, 1 - (dir + 1) / SPRITE_DIRECTIONS.length)
    }
  }

  dispose(): void {
    this.disposed = true
    this.object.removeFromParent()
    this.mesh?.geometry.dispose()
    this.feet?.geometry.dispose()
    ;(this.feet?.material as THREE.Material | undefined)?.dispose()
    this.material?.dispose()
    const worn = this.liveMaterial()
    if (worn && worn !== this.material) worn.dispose()
    this.depthMaterial?.dispose()
    // The clones only; the shared sheet images stay cached for the next figure.
    this.textures.forEach((t) => t.dispose())
    this.textures.clear()
  }

  // ---------------------------------------------------------------------

  private resolve(state: SpriteState): SpriteState | null {
    const a = this.manifest?.animations
    if (!a) return null
    if (a[state]) return state
    for (const alt of FALLBACK[state]) if (a[alt]) return alt
    return null
  }

  /** Card scale that brings this state's drawing to the idle's height; 1 until both sheets have loaded. */
  private scaleFor(state: SpriteState): number {
    const known = this.heightScale.get(state)
    if (known !== undefined) return known
    const m = this.manifest
    const mine = this.textures.get(state)
    const idle = this.textures.get("idle")
    if (!m || !mine || !idle || state === "idle") return 1
    const hIdle = drawnHeight(idle, m.cell)
    const hMine = drawnHeight(mine, m.cell)
    if (!hIdle || !hMine) return 1
    let k = hIdle / hMine
    if (k < HEIGHT_MATCH_LIMIT[0] || k > HEIGHT_MATCH_LIMIT[1]) k = 1
    this.heightScale.set(state, k)
    return k
  }

  private fireHit(): void {
    const f = this.onHit
    this.onHit = null
    this.hitAt = Infinity
    f?.()
  }

  private build(m: SpriteManifest): void {
    this.manifest = m
    const [cw, ch] = m.cell
    const [px, py] = m.pivot
    const w = cw / m.ppu
    const h = ch / m.ppu
    const geo = new THREE.PlaneGeometry(w, h)
    // Feet on the origin: the pivot pixel (from the cell's top-left) goes to 0,0.
    geo.translate((cw / 2 - px) / m.ppu, (py - ch / 2) / m.ppu, 0)
    this.material = new THREE.MeshStandardMaterial({
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
      emissive: 0xffffff,
      emissiveIntensity: SELF_LIGHT,
    })
    // The shadow has to be cut from the same frame, or every figure casts a
    // rectangle.
    this.depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 })
    this.mesh = new THREE.Mesh(geo, this.material)
    this.mesh.customDepthMaterial = this.depthMaterial
    this.mesh.castShadow = true
    this.mesh.receiveShadow = false
    this.object.add(this.mesh)

    // The feet, drawn again after the floor layers (FEET_BAND). Same plane,
    // cut to the bottom band; its UVs are squeezed to the bottom of the cell,
    // so the shared texture offset still points it at the right frame.
    const bandPx = Math.min(ch, ch - py + FEET_BAND * m.ppu)
    const band = bandPx / m.ppu
    const feetGeo = new THREE.PlaneGeometry(w, band)
    feetGeo.translate((cw / 2 - px) / m.ppu, (py - ch) / m.ppu + band / 2, 0)
    const uv = feetGeo.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (bandPx / ch))
    const feetMat = this.material.clone()
    feetMat.transparent = true
    feetMat.depthWrite = false
    // Pulled a hair toward the camera so it wins against the body's own depth.
    feetMat.polygonOffset = true
    feetMat.polygonOffsetFactor = -1
    feetMat.polygonOffsetUnits = -1
    this.feet = new THREE.Mesh(feetGeo, feetMat)
    this.feet.renderOrder = FEET_ORDER
    this.mesh.add(this.feet)
    // WHERE A SPELL LEAVES FROM. The board throws bolts from the "RightHand"
    // or "LeftHand" bone and falls back to the token's origin - which on a
    // sprite is its feet. Two empty markers at chest height, named like the
    // bones, keep a flat figure's Fire Bolt coming out of its hands.
    const figureTop = py / m.ppu
    for (const [name, side] of [["RightHand", 1], ["LeftHand", -1]] as const) {
      const hand = new THREE.Object3D()
      hand.name = name
      hand.position.set(side * 0.12, figureTop * 0.6, 0.1)
      this.object.add(hand)
    }

    const base = this.url.replace(/[^/]*$/, "")
    for (const [state, anim] of Object.entries(m.animations) as [SpriteState, SpriteAnimation][]) {
      const t = sheetTexture(new URL(anim.sheet, new URL(base, window.location.href)).href).clone()
      t.repeat.set(1 / anim.frames, 1 / SPRITE_DIRECTIONS.length)
      this.textures.set(state, t)
    }

    const p = this.pending
    this.pending = null
    this.bindSheet(this.resolve(this.state) ?? "idle")
    if (p) this.play(p.state, p.opts, p.skipToEnd)
  }

  /**
   * The material the figure is ACTUALLY wearing. Not always the one built
   * here: a death (components/tactical/death-vfx) clones every material on
   * the body so it can tint and fade this corpse alone, and a sheet bound to
   * the original after that would never be seen.
   */
  private liveMaterial(): THREE.MeshStandardMaterial | null {
    return (this.mesh?.material as THREE.MeshStandardMaterial | undefined) ?? null
  }

  private bindSheet(state: SpriteState): void {
    const t = this.textures.get(state)
    const mat = this.liveMaterial()
    if (!t || !mat || !this.depthMaterial) return
    mat.map = t
    mat.emissiveMap = t
    this.depthMaterial.map = t
    mat.needsUpdate = true
    this.depthMaterial.needsUpdate = true
  }
}
