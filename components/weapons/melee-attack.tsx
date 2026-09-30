"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import {
  rigAt, arcAt, elbowAt, totalMs, REST_ANGLE,
  type Timing, type Weight, DEFAULT_TIMING,
} from "@/lib/weapon-rig"

/**
 * MeleeAttack — canvas renderer for the weapon rig, for the dashboard.
 *
 * The first-person crawler does NOT need this component: it should call
 * rigAt() and arcAt() from lib/weapon-rig and draw into its own 640x360
 * buffer. See docs/design/claude_Melee_Attack_Rig.md §5.
 */

/** Anchors measured off public/weapons/dagger/dagger.png. */
export const DAGGER = {
  src: "/weapons/dagger/dagger.png",
  w: 385, h: 591,
  grip: { x: 145, y: 413 },
  tip: { x: 252, y: 1 },
  /** grip -> tip, unrotated, at scale 1 */
  tipOffset: [107, -412] as [number, number],
  scale: 0.62,
} as const

const CANVAS = { w: 900, h: 520 } as const
/** One effect pixel, in stage units. Set to 1 when drawing into an already-pixelated buffer. */
const FX_PX = 5
const FX_RGB: Array<[number, number, number]> = [
  [22, 36, 63], [47, 79, 134], [121, 178, 232], [238, 247, 255],
]

export interface MeleeAttackProps {
  /** 0 = rest, 1 = end of recover. Clamped. */
  t: number
  clip?: string
  weight?: Weight
  timing?: Timing
  showArc?: boolean
  className?: string
}

export function MeleeAttack({
  t, clip = "slash_d", weight = "light", timing = DEFAULT_TIMING,
  showArc = true, className,
}: MeleeAttackProps) {
  const cvRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const offRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef({ t, clip, weight, timing, showArc })
  stateRef.current = { t, clip, weight, timing, showArc }

  useEffect(() => {
    let dead = false
    const img = new Image()
    img.onload = () => { if (!dead) { imgRef.current = img; paint() } }
    img.src = DAGGER.src
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function paint() {
    const cv = cvRef.current
    const cx = cv?.getContext("2d")
    if (!cv || !cx) return
    const st = stateRef.current
    cx.setTransform(1, 0, 0, 1, 0, 0)
    cx.clearRect(0, 0, CANVAS.w, CANVAS.h)

    const rig = rigAt(st.clip, st.t, st.weight, st.timing)
    const img = imgRef.current
    if (img) {
      const s = DAGGER.scale * rig.scale
      cx.save()
      cx.translate(rig.x, rig.y)
      cx.rotate(rig.angle - REST_ANGLE)
      cx.scale(s, s)
      cx.drawImage(img, -DAGGER.grip.x, -DAGGER.grip.y)
      cx.restore()
    }

    if (st.showArc) {
      const arc = arcAt(st.clip, st.t, [DAGGER.tipOffset[0] * DAGGER.scale, DAGGER.tipOffset[1] * DAGGER.scale],
        st.weight, st.timing)
      if (arc) {
        let off = offRef.current
        if (!off) { off = document.createElement("canvas"); offRef.current = off }
        const w = Math.ceil(CANVAS.w / FX_PX), h = Math.ceil(CANVAS.h / FX_PX)
        if (off.width !== w || off.height !== h) { off.width = w; off.height = h }
        const ox = off.getContext("2d")
        if (ox) {
          ox.setTransform(1, 0, 0, 1, 0, 0)
          ox.clearRect(0, 0, w, h)
          ox.setTransform(1 / FX_PX, 0, 0, 1 / FX_PX, 0, 0)
          for (const band of arc.bands) {
            ox.beginPath()
            ox.moveTo(band.points[0][0], band.points[0][1])
            for (let i = 1; i < band.points.length; i++) ox.lineTo(band.points[i][0], band.points[i][1])
            ox.closePath(); ox.fillStyle = band.color; ox.fill()
          }
          // hard pixels: threshold the alpha, snap every colour to the ramp
          const data = ox.getImageData(0, 0, w, h)
          const d8 = data.data
          for (let i = 0; i < d8.length; i += 4) {
            if (d8[i + 3] < 110) { d8[i + 3] = 0; continue }
            d8[i + 3] = 255
            let best = 0, bd = Infinity
            for (let c = 0; c < FX_RGB.length; c++) {
              const dr = d8[i] - FX_RGB[c][0], dg = d8[i + 1] - FX_RGB[c][1], db = d8[i + 2] - FX_RGB[c][2]
              const e = dr * dr + dg * dg + db * db
              if (e < bd) { bd = e; best = c }
            }
            d8[i] = FX_RGB[best][0]; d8[i + 1] = FX_RGB[best][1]; d8[i + 2] = FX_RGB[best][2]
          }
          ox.setTransform(1, 0, 0, 1, 0, 0)
          ox.putImageData(data, 0, 0)
          cx.save()
          cx.globalAlpha = arc.alpha
          cx.imageSmoothingEnabled = false
          cx.drawImage(off, 0, 0, w, h, 0, 0, CANVAS.w, CANVAS.h)
          cx.restore()
        }
      }
    }
  }

  useEffect(paint, [t, clip, weight, timing, showArc])

  return (
    <canvas
      ref={cvRef}
      width={CANVAS.w}
      height={CANVAS.h}
      aria-label="First-person melee attack"
      className={cn("block h-auto w-full max-w-full", className)}
    />
  )
}

export { totalMs, elbowAt }
