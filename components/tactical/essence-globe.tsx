"use client"

// ============================================================================
// THE ESSENCE GLOBE — the liquid inside the mount.
//
// Replaces the static CSS fill that used to live inside combat-hud.tsx. Same
// mount, same 86px, same readout, same label. What changed is that the fill is
// now real liquid on a canvas: it ebbs in place, it tilts and rings down when
// the number moves, and the harder the hit the harder it slams.
//
// The level is ALWAYS value / max. Nothing here decorates a number it does not
// have — a martial with no slots gets a dark globe, exactly as before.
//
// A globe is a sphere, so the fill is by VOLUME, not by height: one of nine
// slots is one ninth of the liquid, which sits at ~21% of the way up the glass
// rather than 11%. The slots globe also carries faint graduation marks, one
// per slot, so a player can read "3 of 9" without reading the number.
// ============================================================================

import { useEffect, useRef } from "react"
import { createOrbRenderer, type OrbHandle, type OrbVariant } from "@/lib/combat/orb-engine"

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
  variant?: OrbVariant
  size?: number
  /** Graduation marks. Defaults on for slots, off for HP. */
  segments?: number | "auto"
}) {
  // HP is continuous — ticks every hit point would be static. Slots are
  // discrete and few, so they get marks.
  const marks = segments ?? (variant === "mana" ? "auto" : 0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const orbRef = useRef<OrbHandle | null>(null)
  const mounted = useRef(false)

  const safeMax = Math.max(1, max)
  const safeValue = Math.max(0, Math.min(value, safeMax))
  const frac = max > 0 ? safeValue / safeMax : 0
  const critical = variant === "life" && max > 0 && frac > 0 && frac <= 0.25

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

    // Pour in on mount rather than snapping — the HUD fades up around it.
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
    // The renderer is created once. Live updates go through the effects below.
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

  return (
    <div className="relative">
      <div
        className="relative overflow-hidden rounded-full border-[3px] border-[#3a2c1a]"
        style={{
          width: size,
          height: size,
          boxShadow: "0 0 22px #000, inset 0 0 20px #000",
        }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={max > 0 ? `${label}: ${safeValue} of ${safeMax}` : `${label}: none`}
          className="block h-full w-full"
        />
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span
            className={
              "font-serif text-[13px] font-semibold [text-shadow:0_1px_3px_#000,0_0_8px_#000] " +
              (critical ? "text-[#ff8a72]" : "text-[#f4ecd8]")
            }
          >
            {max > 0 ? `${safeValue} / ${safeMax}` : "—"}
          </span>
        </div>
      </div>
      <div className="mt-0.5 text-center font-serif text-[8px] uppercase tracking-[0.22em] text-[#8a7952]">
        {label}
      </div>
    </div>
  )
}

export default Globe
