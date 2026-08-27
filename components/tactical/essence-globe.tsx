"use client"

// ============================================================================
// THE ESSENCE VESSEL — clear glass in a golden mount.
//
// Replaces the CSS fill that used to live inside combat-hud.tsx. Two vessels:
//
//   Life  — fresh arterial blood. Thick, glossy, near-black in the column and
//           bright crimson where light gets through. It clings to the glass
//           and runs back down after a hit.
//   Slots — a luminous blue gas with arcane lightning crawling through it.
//
// The level is a share of the SPHERE'S VOLUME, so one of nine slots is one
// ninth of what is in the vessel — not one ninth of the way up the glass.
// A martial with no slots still gets an empty vessel; nothing invents a
// resource it does not have.
//
// The canvas is taller than it is wide to leave room for the golden plinth.
// ============================================================================

import { useEffect, useRef } from "react"
import { createOrbRenderer, type OrbHandle, type OrbVariant } from "@/lib/combat/orb-engine"

/**
 * `size` is the SPHERE's diameter. The canvas is larger on both axes: wider so
 * the bloom has room and does not clip into a square, taller for the plinth.
 */
const CANVAS_SCALE = 1.25
const ASPECT = 1.03

export function Globe({
  value,
  max,
  label,
  variant = "life",
  size = 86,
  segments,
}: {
  value: number
  max: number
  label: string
  /** "life"/"blood" for the blood vessel, "mana"/"arcane" for the gas. */
  variant?: OrbVariant
  size?: number
  /** Graduations. Defaults on for slots, off for HP. */
  segments?: number | "auto"
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const orbRef = useRef<OrbHandle | null>(null)
  const mounted = useRef(false)

  const safeMax = Math.max(1, max)
  const safeValue = Math.max(0, Math.min(value, safeMax))
  const frac = max > 0 ? safeValue / safeMax : 0
  const isGas = variant === "mana" || variant === "arcane"
  const critical = !isGas && max > 0 && frac > 0 && frac <= 0.25

  // HP is continuous, so a tick per hit point would be static noise. Slots
  // are discrete and few, so they get marks.
  const marks = segments ?? (isGas ? "auto" : 0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const orb = createOrbRenderer(canvas, {
      variant,
      max: safeMax,
      value: 0,
      fillMode: "volume",
      segments: marks,
      reducedMotion: media.matches,
    })
    orbRef.current = orb
    orb.start()

    // Fill on mount rather than snapping — the HUD fades up around it.
    const timer = window.setTimeout(() => orb.setValue(max > 0 ? safeValue : 0), 80)
    mounted.current = true

    const onMedia = () => orb.setReducedMotion(media.matches)
    media.addEventListener("change", onMedia)

    const ro = new ResizeObserver(() => orb.resize())
    ro.observe(canvas)

    return () => {
      window.clearTimeout(timer)
      media.removeEventListener("change", onMedia)
      ro.disconnect()
      orb.destroy()
      orbRef.current = null
      mounted.current = false
    }
    // The renderer is created once; live updates go through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    orbRef.current?.setMax(safeMax)
  }, [safeMax])

  useEffect(() => {
    if (!mounted.current) return
    orbRef.current?.setValue(max > 0 ? safeValue : 0)
  }, [safeValue, max])

  useEffect(() => {
    orbRef.current?.setVariant(variant)
  }, [variant])

  useEffect(() => {
    orbRef.current?.setSegments(marks)
  }, [marks])

  const canvasW = Math.round(size * CANVAS_SCALE)
  const canvasH = Math.round(canvasW * ASPECT)

  return (
    <div className="relative" style={{ width: canvasW }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={max > 0 ? `${label}: ${safeValue} of ${safeMax}` : `${label}: none`}
        className="block"
        style={{ width: canvasW, height: canvasH }}
      />
      {/* The readout floats over the glass, centred on the SPHERE — which sits
          in the top square of the canvas, above the plinth. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 grid place-items-center"
        style={{ height: canvasW }}
      >
        <span
          className={
            "font-serif text-[13px] font-semibold [text-shadow:0_1px_3px_#000,0_0_10px_#000] " +
            (critical ? "text-[#ff8a72]" : "text-[#f4ecd8]")
          }
        >
          {max > 0 ? `${safeValue} / ${safeMax}` : "—"}
        </span>
      </div>
      <div className="mt-0.5 text-center font-serif text-[8px] uppercase tracking-[0.22em] text-[#8a7952]">
        {label}
      </div>
    </div>
  )
}

export default Globe
