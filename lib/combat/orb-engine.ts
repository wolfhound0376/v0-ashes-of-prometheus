/**
 * Ashes of Prometheus — Essence Orb engine
 * ========================================
 * Two vessels of clear glass in a golden mount.
 *
 *   BLOOD  — fresh arterial blood. Viscous, glossy, near-black in depth and
 *            bright crimson where the light gets through it. It clings to the
 *            glass and runs back down after a hit.
 *   ARCANE — not a liquid. A luminous blue gas with lightning crawling
 *            through it, pressing against the inside of the glass.
 *
 * Both read their level as a share of the SPHERE'S VOLUME, so one of nine
 * spell slots is exactly one ninth of what is in the vessel.
 *
 * Everything is drawn — no textures, no dependencies. Renders at up to 3x
 * device pixels, which is what makes it hold up on a 4K panel.
 *
 * Drop in `lib/combat/orb-engine.ts`.
 */

/** 'life'/'mana' are kept as aliases so older call sites keep working. */
export type OrbVariant = 'blood' | 'arcane' | 'life' | 'mana'
type CoreVariant = 'blood' | 'arcane'

const CORE: Record<OrbVariant, CoreVariant> = {
  blood: 'blood',
  life: 'blood',
  arcane: 'arcane',
  mana: 'arcane',
}

/**
 * How `current / max` becomes a level.
 *
 * A vessel is a sphere: its middle is fat and its ends are thin. Raising the
 * line halfway up does not put half the blood in it. 'volume' is the honest
 * default — every point of the resource is an equal share of the sphere.
 * 'area' matches the flat disc on screen; 'height' is the naive version, kept
 * only for comparison.
 */
export type OrbFillMode = 'volume' | 'area' | 'height'

export interface OrbOptions {
  variant?: OrbVariant
  value?: number
  max?: number
  /** Stills the motion; levels still tween. */
  reducedMotion?: boolean
  /** Below this ratio the blood vessel pulses a warning. 0 disables. */
  dangerThreshold?: number
  /** Multiplier on all motion. */
  intensity?: number
  fillMode?: OrbFillMode
  /**
   * Faint graduations etched into the glass, one per unit, so "3 of 9" reads
   * without reading the number. 'auto' shows them when max <= 12.
   */
  segments?: number | 'auto'
  /** Pixel-density ceiling. 3 keeps it crisp on 4K; drop to 2 to save fill rate. */
  maxDpr?: number
  /** 'high' adds film grain and the extra gas octave. */
  quality?: 'high' | 'medium'
}

export interface OrbHandle {
  setValue(value: number, opts?: { instant?: boolean }): void
  setMax(max: number): void
  setVariant(variant: OrbVariant): void
  setFillMode(mode: OrbFillMode): void
  setSegments(segments: number | 'auto'): void
  setReducedMotion(reduced: boolean): void
  /** Kick the contents without changing the number. */
  splash(strength?: number): void
  /** Force a lightning arc now (arcane only) — e.g. the instant a spell lands. */
  discharge(): void
  /**
   * Advance the simulation by a fixed step and redraw once.
   *
   * The normal path is start()/stop(). This exists because the loop is driven
   * by requestAnimationFrame, which Chrome pauses in a hidden tab — so tests
   * and screenshot harnesses have no way to reach a settled frame. Drive it
   * yourself: `for (let i = 0; i < 180; i++) orb.tick(1 / 60)`.
   */
  tick(dt: number): void
  /** Internals, for debug overlays and tests. */
  stats(): { level: number; ratio: number; slosh: number; arcs: number; motes: number; drips: number }
  resize(): void
  start(): void
  stop(): void
  destroy(): void
}

/* ========================================================================== *
 *  Palettes
 * ========================================================================== */

const BLOOD = {
  /** Deepest column, where almost no light returns. */
  deep: '#3d0308',
  dark: '#750812',
  body: '#b40d19',
  /** Where the light passes through and the haemoglobin lights up. */
  lit: '#e01524',
  hot: '#ff3b32',
  /** Thin film on the surface. */
  sheen: '#ff9c8c',
  glow: '#e01a22',
}

const ARCANE = {
  deep: '#101d78',
  body: '#3350e2',
  lit: '#6a90ff',
  hot: '#a6dcff',
  core: '#dff2ff',
  glow: '#4a7cff',
}

const GOLD = {
  hi: '#ffeeb8',
  light: '#e8c979',
  mid: '#b48f3c',
  dark: '#6d5220',
  shadow: '#2f2210',
}

/* ========================================================================== *
 *  Math
 * ========================================================================== */

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const clamp01 = (v: number) => clamp(v, 0, 1)

/** Fraction of a unit sphere / unit disc below waterline height `u`. */
function occupancy(u: number, mode: OrbFillMode): number {
  if (mode === 'height') return u
  if (mode === 'area') {
    const a = clamp(2 * u - 1, -1, 1)
    return (Math.PI / 2 + Math.asin(a) + a * Math.sqrt(Math.max(0, 1 - a * a))) / Math.PI
  }
  const h = clamp(2 * u, 0, 2)
  return (h * h * (3 - h)) / 4
}

/** Inverse of `occupancy`. Monotonic, so bisection is exact enough and free. */
function waterlineFor(ratio: number, mode: OrbFillMode): number {
  const r = clamp01(ratio)
  if (mode === 'height') return r
  if (r <= 0) return 0
  if (r >= 1) return 1
  let lo = 0
  let hi = 1
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2
    if (occupancy(mid, mode) < r) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function withAlpha(hex: string, alpha: number) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full.slice(0, 6), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp01(alpha)})`
}

/* ========================================================================== *
 *  Renderer
 * ========================================================================== */

interface Drip {
  /** Offset from centre, in units of the glass radius. */
  x: number
  /** Head position, absolute px. */
  y: number
  vy: number
  len: number
  w: number
  life: number
}

interface Mote {
  a: number
  r: number
  speed: number
  size: number
  phase: number
}

interface Arc {
  pts: number[]
  life: number
  maxLife: number
  w: number
}

export function createOrbRenderer(canvas: HTMLCanvasElement, options: OrbOptions = {}): OrbHandle {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('EssenceOrb: 2D canvas context unavailable')

  let variantIn: OrbVariant = options.variant ?? 'blood'
  let kind: CoreVariant = CORE[variantIn]
  let max = Math.max(1, options.max ?? 1)
  let value = clamp(options.value ?? max, 0, max)
  let reducedMotion = options.reducedMotion ?? false
  const dangerThreshold = options.dangerThreshold ?? 0.25
  const intensity = options.intensity ?? 1
  let fillMode: OrbFillMode = options.fillMode ?? 'volume'
  let segments: number | 'auto' = options.segments ?? 'auto'
  const maxDpr = options.maxDpr ?? 3
  const quality = options.quality ?? 'high'

  /* ---- animation state ---- */

  let target = clamp01(value / max)
  let level = target
  let levelVel = 0
  let slosh = 0
  let sloshVel = 0
  /** Recent high-water mark, so blood residue knows how far it has receded. */
  let residue = target
  let t = 0
  let last = 0
  let raf = 0
  let running = false

  const drips: Drip[] = []
  const motes: Mote[] = []
  const arcs: Arc[] = []
  let nextArcAt = 0

  /* ---- sizing ---- */

  let dpr = 1
  let W = 0
  let H = 0
  let grain: CanvasPattern | null = null
  const gasCanvas =
    typeof document !== 'undefined' ? document.createElement('canvas') : (null as unknown as HTMLCanvasElement)
  const gasCtx = gasCanvas ? gasCanvas.getContext('2d') : null

  function buildGrain() {
    if (quality !== 'high' || typeof document === 'undefined') {
      grain = null
      return
    }
    const size = 64
    const tile = document.createElement('canvas')
    tile.width = tile.height = size
    const tc = tile.getContext('2d')
    if (!tc) return
    const img = tc.createImageData(size, size)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 118 + Math.random() * 20
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    tc.putImageData(img, 0, 0)
    grain = ctx!.createPattern(tile, 'repeat')
  }

  function resize() {
    const nextDpr = Math.min(window.devicePixelRatio || 1, maxDpr)
    const rect = canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    if (w === W && h === H && nextDpr === dpr) return
    W = w
    H = h
    dpr = nextDpr
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (gasCanvas) {
      gasCanvas.width = canvas.width
      gasCanvas.height = canvas.height
      gasCtx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    buildGrain()
  }

  /* ---- geometry ----
   * The sphere sits in the top square of the canvas; the golden plinth uses
   * whatever height is left below it. Give the canvas ~1.16:1 h:w for a base.
   */

  /**
   * The mount is inset from the canvas so the bloom has somewhere to go. With
   * the sphere flush to the edge the halo got clipped and drew a hard square
   * around the vessel.
   */
  const INSET = 0.8
  const outerR = () => (W / 2) * INSET
  const ringW = () => outerR() * 0.115
  const glassR = () => outerR() - ringW()
  const centreY = () => outerR()

  function chordHalf(rr: number, dy: number) {
    const d = rr * rr - dy * dy
    return d > 0 ? Math.sqrt(d) : 0
  }

  /* ---- physics ----
   * Blood is thick: it moves slower and settles faster than water. Gas is
   * light and keeps drifting.
   */

  const fillK = () => (kind === 'blood' ? 26 : 18)
  const fillC = () => (kind === 'blood' ? 10 : 7)
  const sloshOmega = () => Math.PI * 2 * (kind === 'blood' ? 1.15 : 0.75)
  const sloshZeta = () => (kind === 'blood' ? 0.2 : 0.32)

  function step(dt: number) {
    t += dt

    const accel = (target - level) * fillK() - levelVel * fillC()
    levelVel += accel * dt
    level = clamp01(level + levelVel * dt)

    const w = sloshOmega()
    const sAcc = -w * w * slosh - 2 * sloshZeta() * w * sloshVel
    sloshVel += sAcc * dt
    slosh += sloshVel * dt
    if (Math.abs(slosh) < 1e-4 && Math.abs(sloshVel) < 1e-4) {
      slosh = 0
      sloshVel = 0
    }

    // Residue creeps back down to the real level — the film draining off glass.
    if (residue > level) residue = Math.max(level, residue - dt * 0.16)
    else residue = level

    if (reducedMotion) return

    if (motes.length === 0) seedMotes()
    for (const m of motes) {
      m.a += m.speed * dt * intensity
      m.phase += dt * (0.6 + m.speed)
    }

    if (kind === 'blood') stepDrips(dt)
    else stepGas(dt)
  }

  function stepDrips(dt: number) {
    const rr = glassR()
    const surfaceY = surfaceBaseY(rr)
    for (let i = drips.length - 1; i >= 0; i--) {
      const d = drips[i]
      d.y += d.vy * dt * rr
      d.vy += dt * 0.55 // blood accelerates as the bead grows
      d.life -= dt
      if (d.life <= 0 || d.y > surfaceY + rr * 0.05) drips.splice(i, 1)
    }
  }

  function stepGas(dt: number) {
    // Filaments crawl more or less continuously — this is a plasma globe, not
    // a storm. Fullness drives how busy it gets.
    if (level > 0.05) {
      nextArcAt -= dt * (0.6 + level * 1.5) * intensity
      if (nextArcAt <= 0 && arcs.length < 4) {
        spawnArc()
        nextArcAt = 0.05 + Math.random() * 0.14
      }
    }
    for (let i = arcs.length - 1; i >= 0; i--) {
      arcs[i].life -= dt
      if (arcs[i].life <= 0) arcs.splice(i, 1)
    }
  }

  function seedMotes() {
    const n = quality === 'high' ? 16 : 10
    for (let i = 0; i < n; i++) {
      motes.push({
        a: Math.random() * Math.PI * 2,
        r: 0.12 + Math.random() * 0.66,
        speed: (Math.random() < 0.5 ? -1 : 1) * (0.16 + Math.random() * 0.5),
        size: 0.1 + Math.random() * 0.22,
        phase: Math.random() * Math.PI * 2,
      })
    }
  }

  /** Midpoint-displacement bolt between two points inside the gas. */
  function spawnArc() {
    const rr = glassR()
    const cx = W / 2
    const cy = centreY()
    const u = waterlineFor(level, fillMode)
    const topY = cy + rr - u * 2 * rr
    const pick = () => {
      const a = Math.random() * Math.PI * 2
      const r = (0.35 + Math.random() * 0.55) * rr * 0.9
      const x = cx + Math.cos(a) * r
      const y = Math.max(topY + rr * 0.06, Math.min(cy + rr * 0.9, cy + Math.sin(a) * r))
      return [x, y]
    }
    const [x0, y0] = pick()
    const [x1, y1] = pick()
    let pts = [x0, y0, x1, y1]
    let spread = Math.hypot(x1 - x0, y1 - y0) * 0.26
    for (let pass = 0; pass < 6; pass++) {
      const next: number[] = [pts[0], pts[1]]
      for (let i = 0; i < pts.length - 2; i += 2) {
        const mx = (pts[i] + pts[i + 2]) / 2 + (Math.random() * 2 - 1) * spread
        const my = (pts[i + 1] + pts[i + 3]) / 2 + (Math.random() * 2 - 1) * spread
        next.push(mx, my, pts[i + 2], pts[i + 3])
      }
      pts = next
      spread *= 0.58
    }
    const life = 0.14 + Math.random() * 0.16
    arcs.push({ pts, life, maxLife: life, w: rr * (0.006 + Math.random() * 0.007) })
  }

  /** y of the flat waterline, before waves and tilt. */
  function surfaceBaseY(rr: number) {
    const cy = centreY()
    const breathe = reducedMotion ? 0 : Math.sin(t * 0.7) * rr * 0.005 * intensity
    return cy + rr - waterlineFor(level, fillMode) * 2 * rr + breathe
  }

  /* ---- wave surface (blood) ---- */

  function waveY(x: number, cx: number, rr: number, sy: number, amp: number, tilt: number, phase: number) {
    const u = (x - cx) / rr
    return (
      sy +
      Math.sin(u * 2.2 + phase) * amp +
      Math.sin(u * 3.9 - phase * 1.31) * amp * 0.42 +
      Math.sin(u * 6.8 + phase * 0.57) * amp * 0.15 +
      u * tilt
    )
  }

  function traceWave(
    c: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rr: number,
    sy: number,
    amp: number,
    tilt: number,
    phase: number,
  ) {
    const x0 = cx - rr
    const x1 = cx + rr
    const stepX = Math.max(1.5, rr / 40)
    c.beginPath()
    c.moveTo(x0, waveY(x0, cx, rr, sy, amp, tilt, phase))
    for (let x = x0 + stepX; x < x1; x += stepX) c.lineTo(x, waveY(x, cx, rr, sy, amp, tilt, phase))
    c.lineTo(x1, waveY(x1, cx, rr, sy, amp, tilt, phase))
    c.lineTo(x1, cy + rr + 2)
    c.lineTo(x0, cy + rr + 2)
    c.closePath()
  }

  /* ====================================================================== *
   *  Contents
   * ====================================================================== */

  function drawBlood(c: CanvasRenderingContext2D, cx: number, cy: number, rr: number) {
    if (level <= 0.002) return
    const sy = surfaceBaseY(rr)
    const amp = (reducedMotion ? 0 : rr * 0.016 * intensity) + Math.abs(slosh) * rr * 0.075 * intensity
    const tilt = slosh * rr * 0.26 * intensity
    const phase = reducedMotion ? 0 : t * 0.95

    // Residue film left on the glass above the waterline.
    if (residue > level + 0.004) {
      const ry = cy + rr - waterlineFor(residue, fillMode) * 2 * rr
      c.save()
      const film = c.createLinearGradient(0, ry, 0, sy)
      film.addColorStop(0, withAlpha(BLOOD.dark, 0))
      film.addColorStop(1, withAlpha(BLOOD.dark, 0.5))
      c.fillStyle = film
      c.fillRect(cx - rr, ry, rr * 2, Math.max(0, sy - ry))
      c.restore()
    }

    // Drips running back down the inside of the glass.
    if (drips.length) {
      c.save()
      c.lineCap = 'round'
      for (const d of drips) {
        const x = cx + d.x * rr
        const a = clamp01(d.life) * 0.75
        c.strokeStyle = withAlpha(BLOOD.dark, a * 0.7)
        c.lineWidth = d.w * rr
        c.beginPath()
        c.moveTo(x, d.y - d.len * rr)
        c.lineTo(x, d.y)
        c.stroke()
        c.fillStyle = withAlpha(BLOOD.body, a)
        c.beginPath()
        c.arc(x, d.y, d.w * rr * 0.85, 0, Math.PI * 2)
        c.fill()
      }
      c.restore()
    }

    // The body. Dark and opaque in the column, bright where light gets through.
    c.save()
    traceWave(c, cx, cy, rr, sy, amp, tilt, phase)
    c.clip()

    const body = c.createLinearGradient(0, sy - rr * 0.08, 0, cy + rr)
    body.addColorStop(0, BLOOD.hot)
    body.addColorStop(0.16, BLOOD.lit)
    body.addColorStop(0.48, BLOOD.body)
    body.addColorStop(0.82, BLOOD.dark)
    body.addColorStop(1, BLOOD.deep)
    c.fillStyle = body
    c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)

    // Backlight: the glass transmits from below-right, so the blood lights up
    // where the column is thin. This is what stops it reading as red paint.
    c.globalCompositeOperation = 'lighter'
    const back = c.createRadialGradient(
      cx + rr * 0.28,
      cy + rr * 0.42,
      rr * 0.02,
      cx + rr * 0.28,
      cy + rr * 0.42,
      rr * 0.78,
    )
    back.addColorStop(0, withAlpha(BLOOD.hot, 0.44))
    back.addColorStop(0.4, withAlpha(BLOOD.lit, 0.16))
    back.addColorStop(1, withAlpha(BLOOD.lit, 0))
    c.fillStyle = back
    c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)

    // Falloff at the walls, where you are looking through the most blood.
    c.globalCompositeOperation = 'source-over'
    const depth = c.createRadialGradient(cx, cy, rr * 0.5, cx, cy, rr)
    depth.addColorStop(0, 'rgba(30,0,4,0)')
    depth.addColorStop(0.62, 'rgba(28,0,4,0.2)')
    depth.addColorStop(1, 'rgba(20,0,3,0.62)')
    c.fillStyle = depth
    c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)

    c.restore()

    // Density swirls — blood is not a uniform sheet, and this is what stops
    // the vessel reading as a glossy plastic ball.
    if (!reducedMotion && motes.length) {
      c.save()
      traceWave(c, cx, cy, rr, sy, amp, tilt, phase)
      c.clip()
      for (let i = 0; i < motes.length; i += 2) {
        const m = motes[i]
        const rad = (m.r + Math.sin(m.phase) * 0.1) * rr
        const bx = cx + Math.cos(m.a) * rad * 0.8
        const by = cy + Math.sin(m.a * 1.07 + m.phase * 0.3) * rad * 0.62 + rr * 0.12
        const size = m.size * rr * 2.1
        const sw = c.createRadialGradient(bx, by, 0, bx, by, size)
        sw.addColorStop(0, withAlpha(BLOOD.deep, 0.22))
        sw.addColorStop(0.6, withAlpha(BLOOD.dark, 0.1))
        sw.addColorStop(1, withAlpha(BLOOD.dark, 0))
        c.fillStyle = sw
        c.beginPath()
        c.arc(bx, by, size, 0, Math.PI * 2)
        c.fill()
      }
      c.restore()
    }

    // Surface: wet meniscus plus a moving specular streak.
    const dy = sy - cy
    const half = chordHalf(rr, dy)
    if (half > 1.5) {
      c.save()
      c.beginPath()
      c.arc(cx, cy, rr, 0, Math.PI * 2)
      c.clip()
      c.translate(cx, sy)
      c.rotate(Math.atan2(tilt, rr) * 0.5)
      const eh = Math.max(1.5, half * 0.15)

      const film = c.createLinearGradient(0, -eh, 0, eh)
      film.addColorStop(0, withAlpha(BLOOD.sheen, 0.5))
      film.addColorStop(0.42, withAlpha(BLOOD.hot, 0.3))
      film.addColorStop(1, withAlpha(BLOOD.deep, 0.35))
      c.fillStyle = film
      c.beginPath()
      c.ellipse(0, 0, half, eh, 0, 0, Math.PI * 2)
      c.fill()

      c.globalCompositeOperation = 'lighter'
      const streak = c.createLinearGradient(-half, 0, half, 0)
      streak.addColorStop(0, withAlpha(BLOOD.sheen, 0))
      streak.addColorStop(0.28, withAlpha(BLOOD.sheen, 0.42))
      streak.addColorStop(0.45, withAlpha('#ffffff', 0.3))
      streak.addColorStop(0.7, withAlpha(BLOOD.sheen, 0.12))
      streak.addColorStop(1, withAlpha(BLOOD.sheen, 0))
      c.fillStyle = streak
      c.beginPath()
      c.ellipse(0, -eh * 0.35, half * 0.82, eh * 0.5, 0, 0, Math.PI * 2)
      c.fill()
      c.restore()
    }

    // Caustic: light pooling on the glass under the blood.
    c.save()
    c.beginPath()
    c.arc(cx, cy, rr, 0, Math.PI * 2)
    c.clip()
    c.globalCompositeOperation = 'lighter'
    const caustic = c.createRadialGradient(cx, cy + rr * 0.82, rr * 0.02, cx, cy + rr * 0.82, rr * 0.6)
    caustic.addColorStop(0, withAlpha(BLOOD.hot, 0.34 * level))
    caustic.addColorStop(1, withAlpha(BLOOD.hot, 0))
    c.fillStyle = caustic
    c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)
    c.restore()
  }

  function drawGas(c: CanvasRenderingContext2D, cx: number, cy: number, rr: number) {
    if (level <= 0.002 || !gasCtx) return
    const g = gasCtx
    g.clearRect(0, 0, W, H)

    const u = waterlineFor(level, fillMode)
    const topY = cy + rr - u * 2 * rr
    const drift = reducedMotion ? 0 : t

    // A bed of gas so the vessel reads as full of something, then turbulence
    // on top of it.
    const bed = g.createRadialGradient(cx, cy + rr * 0.35, rr * 0.05, cx, cy + rr * 0.35, rr * 1.1)
    bed.addColorStop(0, withAlpha(ARCANE.deep, 0.88))
    bed.addColorStop(0.5, withAlpha('#080d3a', 0.86))
    bed.addColorStop(1, withAlpha('#05061f', 0.55))
    g.fillStyle = bed
    g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)

    // Layered soft blobs on slow orbits read as turbulence for a fraction of
    // the cost of real noise.
    g.globalCompositeOperation = 'lighter'
    if (motes.length === 0) seedMotes()
    for (const m of motes) {
      const wob = Math.sin(m.phase) * 0.14
      const rad = (m.r + wob) * rr
      const x = cx + Math.cos(m.a) * rad * 0.86
      const y = cy + Math.sin(m.a * 1.13 + m.phase * 0.4) * rad * 0.6 + rr * 0.16
      const size = m.size * rr * (0.85 + Math.sin(m.phase * 1.7) * 0.15)
      const blob = g.createRadialGradient(x, y, 0, x, y, size)
      blob.addColorStop(0, withAlpha(ARCANE.hot, 0.34))
      blob.addColorStop(0.22, withAlpha(ARCANE.lit, 0.44))
      blob.addColorStop(0.55, withAlpha(ARCANE.body, 0.26))
      blob.addColorStop(1, withAlpha(ARCANE.deep, 0))
      g.fillStyle = blob
      g.beginPath()
      g.arc(x, y, size, 0, Math.PI * 2)
      g.fill()
    }

    // A denser, slower core so the gas has weight near the bottom.
    const coreY = cy + rr * 0.45 + Math.sin(drift * 0.5) * rr * 0.05
    const core = g.createRadialGradient(cx, coreY, rr * 0.04, cx, coreY, rr * 1.05)
    core.addColorStop(0, withAlpha(ARCANE.body, 0.26))
    core.addColorStop(0.5, withAlpha(ARCANE.deep, 0.14))
    core.addColorStop(1, withAlpha(ARCANE.deep, 0))
    g.fillStyle = core
    g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)

    // Confine the gas to its share of the vessel — soft-edged, because gas
    // does not have a waterline. The band above the level is where it thins.
    g.globalCompositeOperation = 'destination-in'
    const feather = rr * 0.22
    const mask = g.createLinearGradient(0, topY - feather, 0, topY + feather * 0.65)
    mask.addColorStop(0, 'rgba(0,0,0,0)')
    mask.addColorStop(0.55, 'rgba(0,0,0,0.55)')
    mask.addColorStop(1, 'rgba(0,0,0,1)')
    g.fillStyle = mask
    g.fillRect(cx - rr, topY - feather, rr * 2, feather * 1.65)
    g.fillStyle = 'rgba(0,0,0,1)'
    g.fillRect(cx - rr, topY + feather * 0.65, rr * 2, cy + rr - topY)
    g.globalCompositeOperation = 'source-over'

    // Composite into the vessel.
    c.save()
    c.beginPath()
    c.arc(cx, cy, rr, 0, Math.PI * 2)
    c.clip()
    c.drawImage(gasCanvas, 0, 0, W, H)
    drawArcs(c, cx, cy, rr)
    c.restore()
  }

  /** Arcane lightning, drawn over the gas. Assumes the caller has clipped. */
  function drawArcs(c: CanvasRenderingContext2D, cx: number, cy: number, rr: number) {
    if (!arcs.length) return
    c.save()
    c.globalCompositeOperation = 'lighter'
    c.lineJoin = 'round'
    c.lineCap = 'round'
    for (const a of arcs) {
      const k = a.life / a.maxLife
      const passes: [number, string, number][] = [
        [a.w * 9, ARCANE.lit, 0.16 * k],
        [a.w * 3.6, ARCANE.hot, 0.42 * k],
        [a.w, ARCANE.core, 1 * k],
      ]
      for (const [lw, col, alpha] of passes) {
        c.lineWidth = lw
        c.strokeStyle = withAlpha(col, alpha)
        c.beginPath()
        c.moveTo(a.pts[0], a.pts[1])
        for (let i = 2; i < a.pts.length; i += 2) c.lineTo(a.pts[i], a.pts[i + 1])
        c.stroke()
      }
      // The bolt lights the gas around it.
      const fi = Math.floor(a.pts.length / 4) * 2
      const flash = c.createRadialGradient(a.pts[fi], a.pts[fi + 1], 0, a.pts[fi], a.pts[fi + 1], rr * 0.7)
      flash.addColorStop(0, withAlpha(ARCANE.hot, 0.36 * k))
      flash.addColorStop(1, withAlpha(ARCANE.hot, 0))
      c.fillStyle = flash
      c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)
    }
    c.restore()
  }

  /* ====================================================================== *
   *  Clear glass
   * ====================================================================== */

  function drawGlass(c: CanvasRenderingContext2D, cx: number, cy: number, rr: number, pal: { glow: string }) {
    c.save()
    c.beginPath()
    c.arc(cx, cy, rr, 0, Math.PI * 2)
    c.clip()

    // Thickness at the walls: clear glass goes dense and dark at grazing
    // angles. This ring is most of why it reads as glass and not a hole.
    const wall = c.createRadialGradient(cx, cy, rr * 0.74, cx, cy, rr)
    wall.addColorStop(0, 'rgba(0,0,0,0)')
    wall.addColorStop(0.72, 'rgba(10,10,16,0.14)')
    wall.addColorStop(1, 'rgba(6,6,12,0.42)')
    c.fillStyle = wall
    c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)

    c.globalCompositeOperation = 'lighter'

    // Total internal reflection along the lower rim — the bright crescent.
    c.lineWidth = rr * 0.038
    const cres = c.createLinearGradient(cx - rr, cy + rr * 0.4, cx + rr, cy + rr)
    cres.addColorStop(0, 'rgba(255,255,255,0.03)')
    cres.addColorStop(0.5, withAlpha(pal.glow, 0.22))
    cres.addColorStop(1, 'rgba(255,255,255,0.18)')
    c.strokeStyle = cres
    c.beginPath()
    c.arc(cx, cy, rr * 0.965, Math.PI * 0.12, Math.PI * 0.88)
    c.stroke()

    // Key specular, upper left.
    c.save()
    c.translate(cx - rr * 0.33, cy - rr * 0.44)
    c.rotate(-0.52)
    const key = c.createRadialGradient(0, 0, 0, 0, 0, rr * 0.4)
    key.addColorStop(0, 'rgba(255,255,255,0.6)')
    key.addColorStop(0.4, 'rgba(255,255,255,0.16)')
    key.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = key
    c.beginPath()
    c.ellipse(0, 0, rr * 0.4, rr * 0.2, 0, 0, Math.PI * 2)
    c.fill()
    c.restore()

    // Tight catchlight — the small hard dot that sells a curved surface.
    const dotX = cx - rr * 0.4
    const dotY = cy - rr * 0.53
    const dot = c.createRadialGradient(dotX, dotY, 0, dotX, dotY, rr * 0.1)
    dot.addColorStop(0, 'rgba(255,255,255,0.92)')
    dot.addColorStop(0.55, 'rgba(255,255,255,0.25)')
    dot.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = dot
    c.beginPath()
    c.arc(dotX, dotY, rr * 0.1, 0, Math.PI * 2)
    c.fill()

    // Broad fill reflection, lower right, picking up the vessel's own colour.
    c.save()
    c.translate(cx + rr * 0.38, cy + rr * 0.3)
    c.rotate(0.7)
    const fill = c.createRadialGradient(0, 0, 0, 0, 0, rr * 0.46)
    fill.addColorStop(0, withAlpha(pal.glow, 0.2))
    fill.addColorStop(1, withAlpha(pal.glow, 0))
    c.fillStyle = fill
    c.beginPath()
    c.ellipse(0, 0, rr * 0.46, rr * 0.26, 0, 0, Math.PI * 2)
    c.fill()
    c.restore()

    c.restore()
  }

  function drawGraduations(c: CanvasRenderingContext2D, cx: number, cy: number, rr: number, ratio: number) {
    const count = segments === 'auto' ? (max <= 12 ? max : 0) : segments
    if (count <= 1) return
    c.save()
    c.lineCap = 'round'
    c.lineWidth = Math.max(1, rr * 0.016)
    for (let i = 1; i < count; i++) {
      const y = cy + rr - waterlineFor(i / count, fillMode) * 2 * rr
      const half = chordHalf(rr, y - cy)
      if (half < rr * 0.12) continue
      c.strokeStyle = i / count <= ratio ? withAlpha(GOLD.light, 0.34) : 'rgba(255,255,255,0.14)'
      const tick = rr * 0.14
      c.beginPath()
      c.moveTo(cx - half + rr * 0.01, y)
      c.lineTo(cx - half + tick, y)
      c.moveTo(cx + half - rr * 0.01, y)
      c.lineTo(cx + half - tick, y)
      c.stroke()
    }
    c.restore()
  }

  /* ====================================================================== *
   *  Golden mount
   * ====================================================================== */

  function drawGoldRing(c: CanvasRenderingContext2D, cx: number, cy: number, R: number, w: number) {
    // Brushed metal: a sweep that goes hot where the key light hits.
    const sweep = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R)
    sweep.addColorStop(0, GOLD.dark)
    sweep.addColorStop(0.16, GOLD.light)
    sweep.addColorStop(0.3, GOLD.hi)
    sweep.addColorStop(0.44, GOLD.mid)
    sweep.addColorStop(0.62, GOLD.dark)
    sweep.addColorStop(0.78, GOLD.light)
    sweep.addColorStop(1, GOLD.shadow)

    c.save()
    c.lineWidth = w
    c.strokeStyle = sweep
    c.beginPath()
    c.arc(cx, cy, R - w / 2, 0, Math.PI * 2)
    c.stroke()

    // Bevels: a bright lip outside, a dark seat where it grips the glass.
    c.lineWidth = Math.max(1, w * 0.16)
    c.strokeStyle = withAlpha(GOLD.hi, 0.55)
    c.beginPath()
    c.arc(cx, cy, R - w * 0.08, 0, Math.PI * 2)
    c.stroke()

    c.strokeStyle = 'rgba(0,0,0,0.55)'
    c.beginPath()
    c.arc(cx, cy, R - w * 0.94, 0, Math.PI * 2)
    c.stroke()
    c.restore()
  }

  function drawBase(c: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
    const top = cy + R * 0.86
    const bottom = H - Math.max(1, R * 0.03)
    if (bottom <= top + 2) return
    const topHalf = R * 0.46
    const botHalf = R * 0.78

    c.save()
    // Contact shadow so the vessel sits in the cradle rather than on it.
    const sh = c.createRadialGradient(cx, top, 0, cx, top, R * 0.7)
    sh.addColorStop(0, 'rgba(0,0,0,0.6)')
    sh.addColorStop(1, 'rgba(0,0,0,0)')
    c.fillStyle = sh
    c.fillRect(cx - R, top - R * 0.2, R * 2, R * 0.6)

    const grad = c.createLinearGradient(cx - botHalf, 0, cx + botHalf, 0)
    grad.addColorStop(0, GOLD.shadow)
    grad.addColorStop(0.2, GOLD.mid)
    grad.addColorStop(0.38, GOLD.hi)
    grad.addColorStop(0.55, GOLD.light)
    grad.addColorStop(0.75, GOLD.mid)
    grad.addColorStop(1, GOLD.shadow)

    c.beginPath()
    c.moveTo(cx - topHalf, top)
    c.lineTo(cx + topHalf, top)
    c.lineTo(cx + botHalf, bottom)
    c.lineTo(cx - botHalf, bottom)
    c.closePath()
    c.fillStyle = grad
    c.fill()

    // A moulded band across the plinth.
    c.globalCompositeOperation = 'lighter'
    const band = c.createLinearGradient(0, top, 0, bottom)
    band.addColorStop(0, 'rgba(255,255,255,0)')
    band.addColorStop(0.3, withAlpha(GOLD.hi, 0.1))
    band.addColorStop(0.46, withAlpha(GOLD.hi, 0.22))
    band.addColorStop(0.62, withAlpha(GOLD.hi, 0.06))
    band.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = band
    c.fill()

    c.globalCompositeOperation = 'source-over'
    c.lineWidth = Math.max(1, R * 0.014)
    c.strokeStyle = 'rgba(0,0,0,0.45)'
    c.stroke()
    c.restore()
  }

  /* ====================================================================== *
   *  Frame
   * ====================================================================== */

  function draw() {
    const c = ctx!
    const R = outerR()
    const w = ringW()
    const rr = glassR()
    const cx = W / 2
    const cy = centreY()
    const pal = kind === 'blood' ? BLOOD : ARCANE
    const ratio = clamp01(value / max)

    c.clearRect(0, 0, W, H)
    if (R <= 0) return

    const dangerous = kind === 'blood' && dangerThreshold > 0 && ratio > 0 && ratio <= dangerThreshold
    const hz = dangerous ? 2.6 : 0.5
    const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * hz)
    const glow = (0.16 + level * 0.6) * (0.72 + pulse * 0.46) * (dangerous ? 1.3 : 1)

    // Bloom thrown onto the HUD around the vessel.
    c.save()
    c.globalCompositeOperation = 'lighter'
    // Never let the halo reach the canvas edge, or it clips into a square.
    const haloR = Math.min(R * 1.55, cx, cy)
    const halo = c.createRadialGradient(cx, cy, rr * 0.8, cx, cy, haloR)
    halo.addColorStop(0, withAlpha(pal.glow, 0.4 * glow))
    halo.addColorStop(0.5, withAlpha(pal.glow, 0.15 * glow))
    halo.addColorStop(1, withAlpha(pal.glow, 0))
    c.fillStyle = halo
    c.beginPath()
    c.arc(cx, cy, haloR, 0, Math.PI * 2)
    c.fill()
    c.restore()

    // Inside the glass.
    c.save()
    c.beginPath()
    c.arc(cx, cy, rr, 0, Math.PI * 2)
    c.clip()
    // Clear glass: barely tinted, so what shows through is the contents.
    c.fillStyle = 'rgba(9,8,14,0.16)'
    c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)
    if (kind === 'blood') drawBlood(c, cx, cy, rr)
    else drawGas(c, cx, cy, rr)
    c.restore()

    drawGraduations(c, cx, cy, rr, ratio)
    drawGlass(c, cx, cy, rr, pal)
    drawBase(c, cx, cy, R)
    drawGoldRing(c, cx, cy, R, w)

    if (grain) {
      c.save()
      c.beginPath()
      c.arc(cx, cy, rr, 0, Math.PI * 2)
      c.clip()
      c.globalCompositeOperation = 'overlay'
      c.globalAlpha = 0.03
      c.fillStyle = grain
      c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)
      c.restore()
    }
  }

  /* ---- loop ---- */

  function frame(now: number) {
    if (!running) return
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60)
    last = now
    resize()
    step(dt)
    draw()
    raf = requestAnimationFrame(frame)
  }

  function start() {
    if (running) return
    running = true
    last = 0
    raf = requestAnimationFrame(frame)
  }

  function stop() {
    running = false
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  function onVisibility() {
    if (document.hidden) stop()
    else start()
  }
  document.addEventListener('visibilitychange', onVisibility)

  function splash(strength = 0.3) {
    if (reducedMotion) return
    sloshVel += clamp(strength, -1.5, 1.5) * sloshOmega()
  }

  /**
   * Blood left stranded on the glass when the level drops runs back down.
   * Beads start at the old high-water mark and fall toward the new surface.
   */
  function spawnDrips(severity: number) {
    const rr = glassR()
    if (rr <= 0) return
    const cy = centreY()
    const startY = cy + rr - waterlineFor(residue, fillMode) * 2 * rr
    // Stay inside the sphere at that height, or the bead floats in the bezel.
    const halfAtStart = chordHalf(rr, startY - cy) / rr
    if (halfAtStart < 0.12) return
    const n = Math.min(5, 1 + Math.floor(severity * 9))
    for (let i = 0; i < n; i++) {
      drips.push({
        x: (Math.random() * 2 - 1) * halfAtStart * 0.82,
        y: startY + rr * 0.02,
        vy: 0.1 + Math.random() * 0.2,
        len: 0.05 + Math.random() * 0.16,
        w: 0.012 + Math.random() * 0.016,
        life: 1.1 + Math.random() * 1.2,
      })
    }
  }

  const handle: OrbHandle = {
    setValue(next, opts) {
      const clamped = clamp(next, 0, max)
      const delta = (clamped - value) / max
      value = clamped
      target = clamp01(value / max)
      if (opts?.instant) {
        level = target
        residue = target
        levelVel = 0
        slosh = 0
        sloshVel = 0
        drips.length = 0
        return
      }
      if (Math.abs(delta) <= 0.0005) return
      splash(-delta * (kind === 'blood' ? 1.6 : 2.2))
      if (kind === 'blood' && delta < 0) spawnDrips(-delta)
      if (kind === 'arcane' && delta < 0) {
        spawnArc()
        spawnArc()
      }
    },
    setMax(nextMax) {
      max = Math.max(1, nextMax)
      value = clamp(value, 0, max)
      target = clamp01(value / max)
    },
    setVariant(next) {
      variantIn = next
      const nextKind = CORE[next]
      if (nextKind !== kind) {
        kind = nextKind
        drips.length = 0
        arcs.length = 0
        motes.length = 0
      }
    },
    setFillMode(next) {
      fillMode = next
    },
    setSegments(next) {
      segments = next
    },
    setReducedMotion(reduced) {
      reducedMotion = reduced
      if (reduced) {
        slosh = 0
        sloshVel = 0
        drips.length = 0
        arcs.length = 0
      }
    },
    splash,
    stats() {
      return { level, ratio: clamp01(value / max), slosh, arcs: arcs.length, motes: motes.length, drips: drips.length }
    },
    tick(dt) {
      resize()
      step(clamp(dt, 0, 0.05))
      draw()
    },
    discharge() {
      if (kind === 'arcane' && !reducedMotion) spawnArc()
    },
    resize,
    start,
    stop,
    destroy() {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      drips.length = 0
      arcs.length = 0
      motes.length = 0
    },
  }

  resize()
  draw()
  return handle
}
