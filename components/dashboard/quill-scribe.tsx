"use client"

// The quill, drawn.
//
// Sam, 2026-09-29: "Whenever something is written into the journal. It is
// scribbled with a quill animation."
//
// The pacing lives in lib/scribe and is tested there. This file is only the
// rendering, and it is deliberately thin — the thing that makes or breaks the
// effect is the rhythm, not the markup.
//
// HOW THE NIB STAYS IN THE RIGHT PLACE
//
// Not by measuring. Measuring a caret position means reading layout every
// frame, which fights text wrapping and reflows the page as the line grows.
// Instead the nib is an inline element sitting immediately AFTER the revealed
// text, so the browser's own line-breaking puts it exactly where the last
// letter ended — including when the text wraps mid-word, where a measured
// caret would jump to the wrong line.
//
// Unrevealed text is rendered too, with `visibility: hidden`. That costs
// nothing and buys the one thing a typewriter effect usually gets wrong: the
// paragraph occupies its final height from the first frame, so the page does
// not grow under the reader's eyes and shove everything below it down the
// screen.

import { useEffect, useRef, useState } from "react"
import { charsWritten, scribeDelays, wetRange } from "@/lib/scribe"

export function ScribedText({
  text,
  className = "",
  /** Skip the animation and show the finished page. */
  instant = false,
  onDone,
}: {
  text: string
  className?: string
  instant?: boolean
  onDone?: () => void
}) {
  const reduced = usePrefersReducedMotion()
  const skip = instant || reduced
  const [written, setWritten] = useState(skip ? text.length : 0)
  const doneRef = useRef(false)

  useEffect(() => {
    doneRef.current = false
    if (skip) {
      setWritten(text.length)
      return
    }
    const delays = scribeDelays(text)
    const start = performance.now()
    let raf = 0
    const tick = () => {
      const n = charsWritten(delays, performance.now() - start)
      setWritten(n)
      if (n < text.length) {
        raf = requestAnimationFrame(tick)
      } else if (!doneRef.current) {
        doneRef.current = true
        onDone?.()
      }
    }
    // Schedule BEFORE the first paint rather than after, the lesson from the
    // frozen preview artifact: if the callback ever throws, a loop that
    // reschedules at the end dies outright and the page stays half-written.
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, skip])

  const done = written >= text.length
  const wet = wetRange(written, text.length)

  return (
    <span className={className}>
      <span>{text.slice(0, wet.from)}</span>
      {wet.to > wet.from && <span className="aop-ink-wet">{text.slice(wet.from, wet.to)}</span>}
      {!done && <QuillNib />}
      {/* Hidden, not absent: the paragraph keeps its final height from the
          first frame, so nothing below it jumps as the writing advances. */}
      <span aria-hidden className="invisible">{text.slice(written)}</span>
    </span>
  )
}

/**
 * The nib itself: a cut feather at the angle a right hand holds it, with the
 * slit and the shoulder that make a quill read as a quill rather than as a
 * triangle. It bobs very slightly — a hand is never still — and carries a bead
 * of ink at the point.
 */
function QuillNib() {
  return (
    <span className="aop-quill-nib" aria-hidden>
      <svg viewBox="0 0 24 24" width="18" height="18">
        {/* the vane, swept back over the hand */}
        <path
          d="M21.4 2.4c-6.1.5-10.6 3-13.2 6.4-1.6 2.1-2.4 4.4-2.8 6.4l4.6-4.6a.7.7 0 1 1 1 1l-4.6 4.6c2-.4 4.3-1.2 6.4-2.8 3.4-2.6 5.9-7.1 6.4-13.2z"
          fill="#4a3b2a"
          opacity=".92"
        />
        {/* the shaft down to the cut */}
        <path d="M6.4 15.2 3.1 20.9" stroke="#3a2e21" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        {/* the nib, and the slit that carries the ink */}
        <path d="M3.1 20.9 2 23l2.1-1.1z" fill="#241a12" />
      </svg>
      <span className="aop-quill-bead" />
    </span>
  )
}

/** Respect the OS setting. An animation nobody asked for is not atmosphere. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const on = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener?.("change", on)
    return () => mq.removeEventListener?.("change", on)
  }, [])
  return reduced
}
