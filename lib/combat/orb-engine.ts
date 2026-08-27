/**
 * Ashes of Prometheus — Essence Orb engine
 * ----------------------------------------
 * Framework-agnostic canvas renderer for the Life Essence (HP) and
 * Arcane Essence (spell slot) orbs on the combat HUD.
 *
 * The liquid level is ALWAYS current / max. Everything else — slosh, tilt,
 * glow intensity, bubble rate, danger pulse — is derived from that ratio and
 * from how fast it changed.
 *
 * No dependencies. Drop this in `lib/combat/orb-engine.ts`.
 */

export type OrbVariant = 'life' | 'mana'

/**
 * How `current / max` becomes a waterline.
 *
 * This matters more than it looks. A globe is a sphere, so raising the
 * waterline by half does NOT put half the liquid in it — the middle of a
 * sphere is fat and the top and bottom are thin. Filling by height makes
 * 1 of 9 slots look like far more liquid than a ninth.
 *
 *  - 'volume' — each point of the resource is an equal share of the SPHERE'S
 *    VOLUME. One of nine slots is exactly one ninth of the liquid. Default.
 *  - 'area'   — equal shares of the flat disc you actually see on screen.
 *    Sits between the other two.
 *  - 'height' — naive linear waterline. Kept for comparison only.
 *
 * All three agree at 0%, 50% and 100%; they differ everywhere else.
 */
export type OrbFillMode = 'volume' | 'area' | 'height'

export interface OrbPalette {
  /** Darkest liquid, at the bottom of the orb. */
  deep: string
  /** Body colour of the liquid. */
  mid: string
  /** Brightest liquid, just under the surface. */
  bright: string
  /** Lit surface film / meniscus. */
  surface: string
  /** Outer rim glow. */
  glow: string
}

export const ORB_PALETTES: Record<OrbVariant, OrbPalette> = {
  life: {
    deep: '#3a0406',
    mid: '#a3121a',
    bright: '#ff4a37',
    surface: '#ffb8a6',
    glow: '#ff2a17',
  },
  mana: {
    deep: '#060a38',
    mid: '#2a35ab',
    bright: '#7189ff',
    surface: '#c6d5ff',
    glow: '#4a6cff',
  },
}

export interface OrbOptions {
  variant?: OrbVariant
  value?: number
  max?: number
  /** Kills wave motion and bubbles; level changes still tween. */
  reducedMotion?: boolean
  bubbles?: boolean
  /** Below this ratio the life orb pulses a warning. 0 disables. */
  dangerThreshold?: number
  /** Multiplier on all motion. 1 = as tuned. */
  intensity?: number
  /** How the ratio maps to a waterline. Defaults to 'volume'. */
  fillMode?: OrbFillMode
  /**
   * Faint graduation marks etched on the glass, one per unit of the resource,
   * so a player can read "3 of 9 slots" without parsing the number. 'auto'
   * shows them when max <= 12 (discrete things like spell slots) and hides
   * them otherwise (HP, where they would be noise). 0 forces them off.
   */
  segments?: number | 'auto'
}

export interface OrbHandle {
  /** Set the current value. Animates, and kicks a slosh proportional to the change. */
  setValue(value: number, opts?: { instant?: boolean }): void
  setMax(max: number): void
  setVariant(variant: OrbVariant): void
  setFillMode(mode: OrbFillMode): void
  setSegments(segments: number | 'auto'): void
  setReducedMotion(reduced: boolean): void
  /** Manually kick the liquid — e.g. on a hit that dealt 0 damage. */
  splash(strength?: number): void
  /** Call on container resize. Safe to call every frame. */
  resize(): void
  start(): void
  stop(): void
  destroy(): void
}

interface Bubble {
  x: number
  y: number
  r: number
  vy: number
  wobble: number
  seed: number
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const clamp01 = (v: number) => clamp(v, 0, 1)

/**
 * Fraction of the orb occupied when the waterline sits at height `u`
 * (0 = empty, 1 = brim), for a unit sphere / unit circle.
 */
function occupancy(u: number, mode: OrbFillMode): number {
  if (mode === 'height') return u
  if (mode === 'area') {
    // Circular segment: area below the line y = a within a unit circle.
    const a = clamp(2 * u - 1, -1, 1)
    return (Math.PI / 2 + Math.asin(a) + a * Math.sqrt(Math.max(0, 1 - a * a))) / Math.PI
  }
  // Spherical cap of height h in a unit-radius sphere: V = pi*h^2*(3-h)/3,
  // over the full 4/3*pi. The pi cancels.
  const h = clamp(2 * u, 0, 2)
  return (h * h * (3 - h)) / 4
}

/**
 * Inverse of `occupancy` — the waterline height that holds `ratio` of the orb.
 * Monotonic, so bisection is exact enough and costs nothing at 60fps.
 */
function waterlineFor(ratio: number, mode: OrbFillMode): number {
  const r = clamp01(ratio)
  if (mode === 'height') return r
  if (r <= 0) return 0
  if (r >= 1) return 1
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (occupancy(mid, mode) < r) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export function createOrbRenderer(
  canvas: HTMLCanvasElement,
  options: OrbOptions = {},
): OrbHandle {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('EssenceOrb: 2D canvas context unavailable')

  let variant: OrbVariant = options.variant ?? 'life'
  let max = Math.max(1, options.max ?? 1)
  let value = clamp(options.value ?? max, 0, max)
  let reducedMotion = options.reducedMotion ?? false
  const useBubbles = options.bubbles ?? true
  const dangerThreshold = options.dangerThreshold ?? 0.25
  const intensity = options.intensity ?? 1
  let fillMode: OrbFillMode = options.fillMode ?? 'volume'
  let segments: number | 'auto' = options.segments ?? 'auto'

  /* ---- animation state ---------------------------------------------- */

  let target = clamp01(value / max)
  let level = target // eased fill height, 0..1
  let levelVel = 0

  let slosh = 0 // -1..1, surface tilt / wave energy
  let sloshVel = 0

  let t = 0 // seconds
  let last = 0
  let raf = 0
  let running = false

  const bubbles: Bubble[] = []

  /* ---- sizing -------------------------------------------------------- */

  let dpr = 1
  let W = 0
  let H = 0

  function resize() {
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2)
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
  }

  /* ---- physics ------------------------------------------------------- */

  // Fill spring: how fast the liquid chases the real value.
  const FILL_STIFFNESS = 30
  const FILL_DAMPING = 9

  // Slosh oscillator: ~1.55 Hz, lightly damped, so it rings a few times.
  const SLOSH_OMEGA = Math.PI * 2 * 1.55
  const SLOSH_ZETA = 0.11

  function step(dt: number) {
    t += dt

    // Liquid level chases the true ratio.
    const accel = (target - level) * FILL_STIFFNESS - levelVel * FILL_DAMPING
    levelVel += accel * dt
    level += levelVel * dt
    level = clamp01(level)

    // Slosh rings down to zero.
    const sAcc = -SLOSH_OMEGA * SLOSH_OMEGA * slosh - 2 * SLOSH_ZETA * SLOSH_OMEGA * sloshVel
    sloshVel += sAcc * dt
    slosh += sloshVel * dt
    if (Math.abs(slosh) < 1e-4 && Math.abs(sloshVel) < 1e-4) {
      slosh = 0
      sloshVel = 0
    }

    if (useBubbles && !reducedMotion) stepBubbles(dt)
  }

  function stepBubbles(dt: number) {
    const rr = radius()
    const surfaceY = surfaceBaseY(rr)
    const cy = H / 2

    // Spawn rate rises with fill and with agitation.
    const rate = level > 0.06 ? (1.6 + Math.abs(slosh) * 14) * intensity : 0
    if (rate > 0 && Math.random() < rate * dt) {
      const bottomY = cy + rr
      const spanY = bottomY - surfaceY
      if (spanY > 4) {
        const halfW = chordHalfWidth(rr, bottomY - rr * 0.12 - cy) * 0.75
        bubbles.push({
          x: W / 2 + (Math.random() * 2 - 1) * halfW,
          y: bottomY - rr * 0.06 - Math.random() * spanY * 0.25,
          r: rr * (0.012 + Math.random() * 0.028),
          vy: rr * (0.22 + Math.random() * 0.4),
          wobble: Math.random() * Math.PI * 2,
          seed: Math.random(),
        })
      }
    }

    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]
      b.y -= b.vy * dt
      b.wobble += dt * (1.4 + b.seed)
      if (b.y - b.r <= surfaceY + rr * 0.02 || bubbles.length > 60) {
        bubbles.splice(i, 1)
      }
    }
  }

  /* ---- geometry helpers ---------------------------------------------- */

  function radius() {
    return Math.min(W, H) / 2
  }

  /**
   * y of the flat waterline for the current level (before waves / tilt).
   *
   * `level` is a share of the RESOURCE. It becomes a share of the orb's
   * height only after going through `waterlineFor` — that is the step that
   * makes one spell slot mean one slot's worth of liquid.
   */
  function surfaceBaseY(rr: number) {
    const cy = H / 2
    const breathe = reducedMotion ? 0 : Math.sin(t * 0.8) * rr * 0.006 * intensity
    return cy + rr - waterlineFor(level, fillMode) * 2 * rr + breathe
  }

  /** Half-width of the circle at vertical offset dy from centre. */
  function chordHalfWidth(rr: number, dy: number) {
    const d = rr * rr - dy * dy
    return d > 0 ? Math.sqrt(d) : 0
  }

  /* ---- drawing -------------------------------------------------------- */

  function waveY(x: number, cx: number, rr: number, surfaceY: number, amp: number, tiltPx: number, phase: number) {
    const u = (x - cx) / rr
    return (
      surfaceY +
      Math.sin(u * 2.4 + phase) * amp +
      Math.sin(u * 4.1 - phase * 1.37) * amp * 0.45 +
      Math.sin(u * 7.3 + phase * 0.61) * amp * 0.18 +
      u * tiltPx
    )
  }

  function traceWave(
    cx: number,
    cy: number,
    rr: number,
    surfaceY: number,
    amp: number,
    tiltPx: number,
    phase: number,
  ) {
    const c = ctx!
    const x0 = cx - rr
    const x1 = cx + rr
    const stepX = Math.max(2, rr / 28)
    c.beginPath()
    c.moveTo(x0, waveY(x0, cx, rr, surfaceY, amp, tiltPx, phase))
    for (let x = x0 + stepX; x < x1; x += stepX) {
      c.lineTo(x, waveY(x, cx, rr, surfaceY, amp, tiltPx, phase))
    }
    c.lineTo(x1, waveY(x1, cx, rr, surfaceY, amp, tiltPx, phase))
    c.lineTo(x1, cy + rr + 2)
    c.lineTo(x0, cy + rr + 2)
    c.closePath()
  }

  function draw() {
    const c = ctx!
    const cx = W / 2
    const cy = H / 2
    const rr = radius()
    const pal = ORB_PALETTES[variant]
    const ratio = clamp01(value / max)

    c.clearRect(0, 0, W, H)
    if (rr <= 0) return

    /* --- outer rim glow (drawn under the glass) --- */
    const dangerous = variant === 'life' && dangerThreshold > 0 && ratio > 0 && ratio <= dangerThreshold
    const pulseHz = dangerous ? 2.6 : 0.55
    const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * pulseHz)
    const glowStrength = (0.18 + level * 0.62) * (0.7 + pulse * 0.5) * (dangerous ? 1.25 : 1)

    c.save()
    c.globalCompositeOperation = 'lighter'
    const halo = c.createRadialGradient(cx, cy, rr * 0.78, cx, cy, rr * 1.28)
    halo.addColorStop(0, withAlpha(pal.glow, 0.55 * glowStrength))
    halo.addColorStop(0.55, withAlpha(pal.glow, 0.22 * glowStrength))
    halo.addColorStop(1, withAlpha(pal.glow, 0))
    c.fillStyle = halo
    c.beginPath()
    c.arc(cx, cy, rr * 1.3, 0, Math.PI * 2)
    c.fill()
    c.restore()

    /* --- glass interior --- */
    c.save()
    c.beginPath()
    c.arc(cx, cy, rr * 0.985, 0, Math.PI * 2)
    c.clip()

    const glass = c.createRadialGradient(cx - rr * 0.3, cy - rr * 0.35, rr * 0.1, cx, cy, rr)
    glass.addColorStop(0, 'rgba(26,24,30,0.95)')
    glass.addColorStop(0.7, 'rgba(12,10,14,0.98)')
    glass.addColorStop(1, 'rgba(4,3,6,1)')
    c.fillStyle = glass
    c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)

    /* --- liquid --- */
    if (level > 0.002) {
      const surfaceY = surfaceBaseY(rr)
      const baseAmp = reducedMotion ? 0 : rr * 0.022 * intensity
      const amp = baseAmp + Math.abs(slosh) * rr * 0.1 * intensity
      const tiltPx = slosh * rr * 0.3 * intensity
      const phase = reducedMotion ? 0 : t * 1.15

      // Back wave — lighter, offset, sells depth.
      c.save()
      traceWave(cx, cy, rr, surfaceY + rr * 0.045, amp * 1.3, tiltPx * 0.6, phase * 0.83 + 1.9)
      const backGrad = c.createLinearGradient(0, surfaceY - rr * 0.1, 0, cy + rr)
      backGrad.addColorStop(0, withAlpha(pal.bright, 0.55))
      backGrad.addColorStop(0.45, withAlpha(pal.mid, 0.6))
      backGrad.addColorStop(1, withAlpha(pal.deep, 0.7))
      c.fillStyle = backGrad
      c.fill()
      c.restore()

      // Front wave — the main body.
      c.save()
      traceWave(cx, cy, rr, surfaceY, amp, tiltPx, phase)
      const bodyGrad = c.createLinearGradient(0, surfaceY - rr * 0.05, 0, cy + rr)
      bodyGrad.addColorStop(0, pal.bright)
      bodyGrad.addColorStop(0.28, pal.mid)
      bodyGrad.addColorStop(1, pal.deep)
      c.fillStyle = bodyGrad
      c.fill()

      // Bubbles live inside the liquid.
      if (useBubbles && !reducedMotion && bubbles.length) {
        c.save()
        c.clip()
        c.globalCompositeOperation = 'lighter'
        for (const b of bubbles) {
          const bx = b.x + Math.sin(b.wobble) * b.r * 1.6
          c.beginPath()
          c.arc(bx, b.y, b.r, 0, Math.PI * 2)
          c.fillStyle = withAlpha(pal.surface, 0.16 + b.seed * 0.14)
          c.fill()
        }
        c.restore()
      }
      c.restore()

      // Lit meniscus — the elliptical "bowl of liquid" read from the reference.
      const dy = surfaceY - cy
      const halfW = chordHalfWidth(rr, dy)
      if (halfW > 1) {
        c.save()
        c.beginPath()
        c.arc(cx, cy, rr * 0.985, 0, Math.PI * 2)
        c.clip()
        c.globalCompositeOperation = 'lighter'
        c.translate(cx, surfaceY)
        c.rotate(Math.atan2(tiltPx, rr) * 0.55)
        const ellH = Math.max(2, halfW * 0.17)
        const film = c.createLinearGradient(0, -ellH, 0, ellH)
        film.addColorStop(0, withAlpha(pal.surface, 0.42))
        film.addColorStop(0.5, withAlpha(pal.surface, 0.2))
        film.addColorStop(1, withAlpha(pal.surface, 0.05))
        c.fillStyle = film
        c.beginPath()
        c.ellipse(0, 0, halfW, ellH, 0, 0, Math.PI * 2)
        c.fill()
        c.lineWidth = Math.max(1, rr * 0.012)
        c.strokeStyle = withAlpha(pal.surface, 0.5)
        c.stroke()
        c.restore()
      }

      // Inner bloom just under the surface.
      c.save()
      c.globalCompositeOperation = 'lighter'
      const bloom = c.createRadialGradient(cx, surfaceY + rr * 0.12, 0, cx, surfaceY + rr * 0.12, rr * 0.85)
      bloom.addColorStop(0, withAlpha(pal.bright, 0.3))
      bloom.addColorStop(1, withAlpha(pal.bright, 0))
      c.fillStyle = bloom
      c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)
      c.restore()
    }

    /* --- graduation marks, one per unit of the resource --- */
    const segCount = segments === 'auto' ? (max <= 12 ? max : 0) : segments
    if (segCount > 1) {
      c.save()
      c.lineCap = 'round'
      c.lineWidth = Math.max(1, rr * 0.02)
      for (let i = 1; i < segCount; i++) {
        const u = waterlineFor(i / segCount, fillMode)
        const y = cy + rr - u * 2 * rr
        const half = chordHalfWidth(rr, y - cy)
        if (half < rr * 0.1) continue
        // Marks above the liquid read as empty capacity, below as filled.
        const filled = i / segCount <= ratio
        c.strokeStyle = filled
          ? withAlpha(pal.surface, 0.22)
          : 'rgba(255,255,255,0.14)'
        const tick = rr * 0.16
        c.beginPath()
        c.moveTo(cx - half, y)
        c.lineTo(cx - half + tick, y)
        c.moveTo(cx + half, y)
        c.lineTo(cx + half - tick, y)
        c.stroke()
      }
      c.restore()
    }

    /* --- glass overlay: vignette + specular --- */
    const vign = c.createRadialGradient(cx, cy, rr * 0.55, cx, cy, rr)
    vign.addColorStop(0, 'rgba(0,0,0,0)')
    vign.addColorStop(1, 'rgba(0,0,0,0.55)')
    c.fillStyle = vign
    c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)

    c.save()
    c.globalCompositeOperation = 'lighter'
    c.translate(cx - rr * 0.3, cy - rr * 0.42)
    c.rotate(-0.5)
    const spec = c.createRadialGradient(0, 0, 0, 0, 0, rr * 0.42)
    spec.addColorStop(0, 'rgba(255,255,255,0.38)')
    spec.addColorStop(0.55, 'rgba(255,255,255,0.10)')
    spec.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = spec
    c.beginPath()
    c.ellipse(0, 0, rr * 0.42, rr * 0.24, 0, 0, Math.PI * 2)
    c.fill()
    c.restore()

    c.restore() // end interior clip

    /* --- inner bezel edge --- */
    c.save()
    c.lineWidth = Math.max(1, rr * 0.045)
    c.strokeStyle = 'rgba(0,0,0,0.6)'
    c.beginPath()
    c.arc(cx, cy, rr * 0.975, 0, Math.PI * 2)
    c.stroke()

    c.lineWidth = Math.max(1, rr * 0.018)
    c.strokeStyle = withAlpha(pal.glow, 0.28 + level * 0.35)
    c.beginPath()
    c.arc(cx, cy, rr * 0.955, 0, Math.PI * 2)
    c.stroke()
    c.restore()
  }

  /* ---- loop ----------------------------------------------------------- */

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

  /* ---- public API ------------------------------------------------------ */

  function splash(strength = 0.3) {
    if (reducedMotion) return
    sloshVel += clamp(strength, -1.5, 1.5) * SLOSH_OMEGA
  }

  const handle: OrbHandle = {
    setValue(next, opts) {
      const clamped = clamp(next, 0, max)
      const delta = (clamped - value) / max // negative = damage
      value = clamped
      target = clamp01(value / max)
      if (opts?.instant) {
        level = target
        levelVel = 0
        slosh = 0
        sloshVel = 0
        return
      }
      // A hit that removes 30% of the bar kicks harder than one that removes 3%.
      if (Math.abs(delta) > 0.0005) splash(-delta * 1.8)
    },
    setMax(nextMax) {
      max = Math.max(1, nextMax)
      value = clamp(value, 0, max)
      target = clamp01(value / max)
    },
    setVariant(next) {
      variant = next
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
        bubbles.length = 0
      }
    },
    splash,
    resize,
    start,
    stop,
    destroy() {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      bubbles.length = 0
    },
  }

  resize()
  draw()
  return handle
}

/* ---- utils ------------------------------------------------------------- */

function withAlpha(hex: string, alpha: number) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${clamp01(alpha)})`
}
