"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

/**
 * BowDraw — first-person longbow, rigged as two sprites plus a drawn string.
 *
 * Nothing about the pose is baked into the art. The arrow is one sprite that
 * slides along its own axis; the string is two canvas lines that meet at the
 * arrow's nock groove. That means `pull` can be held anywhere, which a video
 * clip cannot do.
 *
 * Geometry is in "arrow axis space": S measures pixels along the arrow's own
 * axis from NOCK_POINT (where the axis crosses the braced string). Everything
 * below was measured off the art — see docs/design/claude_Bow_Draw_Rig.md.
 */

// --- measured constants. Do not tune these by eye; they are a closed system. ---
const CANVAS = { w: 1200, h: 1152 } as const
/** Where the arrow's axis crosses the braced string. The nocking point. */
const NOCK_POINT = { x: 602.2274, y: 615.9743 } as const
/** Unit vector along the arrow, pointing back toward the archer. */
const AXIS = { x: 0.6113, y: 0.7914 } as const
/** Unit normal to AXIS. Only used to sit the string on the shaft's centreline. */
const AXIS_N = { x: -0.7914, y: 0.6113 } as const
/** Shaft centreline offset from the axis, in the normal direction. */
const SHAFT_T = 3.15
/** Upper and lower limb tips. Both are off-canvas; the braced string is A->B. */
const LIMB_A = { x: 1242.3, y: -43.4 } as const
const LIMB_B = { x: -155.9, y: 1397.0 } as const
/** S of the nock groove in the arrow sprite's own coordinates. */
const S_ARROW_NOCK = 449
/** S at rest (string braced, arrow nocked) and at full draw. */
const S_REST = 80
const S_FULL = 597

const STRING_EDGE = "#1a1614"
const STRING_CORE = "#fcfcfd"

export interface BowDrawProps {
  /** 0 = nocked at rest, 1 = full draw. Clamped. */
  pull: number
  /** Sprite URLs. Defaults assume /public/weapons/bow/. */
  plateSrc?: string
  arrowSrc?: string
  /** Hide the arrow the moment it is loosed. */
  arrowVisible?: boolean
  className?: string
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)
/** smoothstep — the draw eases at both ends, like a real one */
const ease = (p: number) => p * p * (3 - 2 * p)

export function BowDraw({
  pull,
  plateSrc = "/weapons/bow/plate.png",
  arrowSrc = "/weapons/bow/arrow.png",
  arrowVisible = true,
  className,
}: BowDrawProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const plateRef = useRef<HTMLImageElement | null>(null)
  const arrowRef = useRef<HTMLImageElement | null>(null)
  const readyRef = useRef(0)
  const pullRef = useRef(pull)
  pullRef.current = pull
  const visRef = useRef(arrowVisible)
  visRef.current = arrowVisible

  // load once
  useEffect(() => {
    let cancelled = false
    readyRef.current = 0
    const mk = (src: string, into: typeof plateRef) => {
      const img = new Image()
      img.onload = () => {
        if (cancelled) return
        into.current = img
        readyRef.current += 1
        paint()
      }
      img.src = src
      return img
    }
    mk(plateSrc, plateRef)
    mk(arrowSrc, arrowRef)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plateSrc, arrowSrc])

  function paint() {
    const cv = canvasRef.current
    const cx = cv?.getContext("2d")
    if (!cv || !cx) return
    cx.clearRect(0, 0, CANVAS.w, CANVAS.h)
    if (readyRef.current < 2) return

    const S = S_REST + ease(clamp01(pullRef.current)) * (S_FULL - S_REST)

    // the nock groove — always on the string, always at the arrow's rear
    const nx = NOCK_POINT.x + AXIS.x * S + AXIS_N.x * SHAFT_T
    const ny = NOCK_POINT.y + AXIS.y * S + AXIS_N.y * SHAFT_T
    // the arrow rides with its own nock
    const ox = AXIS.x * (S - S_ARROW_NOCK)
    const oy = AXIS.y * (S - S_ARROW_NOCK)

    if (plateRef.current) cx.drawImage(plateRef.current, 0, 0)

    // string first, so the nock covers the apex
    cx.save()
    cx.lineCap = "round"
    cx.lineJoin = "round"
    cx.beginPath()
    cx.moveTo(LIMB_A.x, LIMB_A.y)
    cx.lineTo(nx, ny)
    cx.lineTo(LIMB_B.x, LIMB_B.y)
    cx.save()
    cx.globalAlpha = 0.43
    cx.strokeStyle = STRING_EDGE
    cx.lineWidth = 7
    cx.stroke()
    cx.restore()
    cx.strokeStyle = STRING_CORE
    cx.lineWidth = 5
    cx.stroke()
    cx.restore()

    if (visRef.current && arrowRef.current) cx.drawImage(arrowRef.current, ox, oy)
  }

  useEffect(paint, [pull, arrowVisible])

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS.w}
      height={CANVAS.h}
      aria-label="First-person bow"
      className={cn("block h-auto w-full max-w-full", className)}
    />
  )
}

export const BOW_DRAW_GEOMETRY = {
  CANVAS,
  NOCK_POINT,
  AXIS,
  AXIS_N,
  SHAFT_T,
  LIMB_A,
  LIMB_B,
  S_ARROW_NOCK,
  S_REST,
  S_FULL,
} as const
