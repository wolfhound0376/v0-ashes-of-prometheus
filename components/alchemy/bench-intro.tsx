"use client"

// The alchemy module's opening film, played as the bench opens. Sam, 9/29:
// "the alchemy module opens with its film"; 2026-10-01, when the camp scene
// started opening the game's bench directly: "yes I want to keep it". It is the
// same approved film the camp scene played, moved, not remade (lib/alchemy-art
// BENCH_INTRO).
//
// Same rules as in the camp scene: Skip, Esc / Space / Enter, a click, or the
// film ending all go straight to the bench, and if it cannot play the bench
// opens at once. It tries with sound first; a browser that refuses sound
// without a click gets it muted rather than not at all.

import { useEffect, useRef } from "react"
import { BENCH_INTRO } from "@/lib/alchemy-art"

export function BenchIntro({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  const done = useRef(false)
  const finish = useRef(onDone)
  finish.current = onDone

  useEffect(() => {
    const end = () => {
      if (done.current) return
      done.current = true
      ref.current?.pause()
      finish.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
        e.preventDefault()
        e.stopPropagation()
        end()
      }
    }
    // Capture, so Escape skips the film instead of closing the bench behind it.
    window.addEventListener("keydown", onKey, true)
    const v = ref.current
    if (!v) { end(); return () => window.removeEventListener("keydown", onKey, true) }
    v.onended = end
    v.onerror = end
    v.muted = false
    const p = v.play()
    if (p) p.catch(() => { v.muted = true; v.play().catch(end) })
    // Never strand the player behind a stalled film.
    const guard = window.setTimeout(end, 12000)
    return () => { window.removeEventListener("keydown", onKey, true); window.clearTimeout(guard) }
  }, [])

  const skip = () => {
    if (done.current) return
    done.current = true
    ref.current?.pause()
    finish.current()
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black" onClick={skip}>
      <video ref={ref} playsInline preload="auto" className="h-full w-full object-contain" aria-label="The alchemy bench">
        <source src={BENCH_INTRO.mp4} type="video/mp4" />
        <source src={BENCH_INTRO.webm} type="video/webm" />
      </video>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); skip() }}
        className="absolute bottom-6 right-6 rounded-sm border border-[#9c7a3a] bg-black/70 px-4 py-2 font-serif text-xs uppercase tracking-[0.2em] text-[#e3b95c] hover:border-[#e3b95c]"
      >
        Skip
      </button>
    </div>
  )
}
