"use client"

/**
 * Full-screen cinematic playback overlay. (PR-5, first slice)
 *
 * Renders whatever clip resolve_cinematic picked: a muted video faded in over
 * the whole dashboard, dismissed by click, by Escape, or by reaching its end.
 *
 * IT PLAYS ONCE (Sam's ruling, 18 Aug 2026) — a cinematic is a moment, not
 * wallpaper. There is deliberately no loop attribute on the video below; when
 * it ends it fades itself out and unmounts.
 *
 * Muted is a house rule, not an oversight — the Tabletop Audio system owns
 * sound, and muted is also what makes browser autoplay reliable (same path
 * /intro proves out).
 */

import { useEffect, useState } from "react"

interface CinematicOverlayProps {
  src: string
  /** Called after the fade-out completes. */
  onClose: () => void
}

export function CinematicOverlay({ src, onClose }: CinematicOverlayProps) {
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)

  const close = () => {
    if (closing) return
    setClosing(true)
    setVisible(false)
    window.setTimeout(onClose, 650)
  }

  useEffect(() => {
    // Mount at opacity 0, then flip on the next frame so the fade-in runs.
    const raf = requestAnimationFrame(() => setVisible(true))
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("keydown", onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      onClick={close}
      className={`fixed inset-0 z-[200] cursor-pointer bg-black transition-opacity duration-[650ms] ${visible ? "opacity-100" : "opacity-0"}`}
      role="dialog"
      aria-label="Cinematic"
    >
      <video src={src} autoPlay muted playsInline onEnded={close} className="h-full w-full object-cover" />
      <span className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded border border-[#4b3a19] bg-black/70 px-3 py-1 text-[10px] uppercase tracking-[.2em] text-[#cdb276]">
        Plays once · click anywhere to return
      </span>
    </div>
  )
}
