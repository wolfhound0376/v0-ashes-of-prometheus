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
 * A quill, at the size a quill actually is.
 *
 * The first version was an 18px glyph, which read as a cursor rather than as a
 * pen. This is ~92px: a full feather held at about 35 degrees, the angle a
 * right hand holds one, sweeping up and back over the wrist.
 *
 * THE ANCHOR IS THE NIB, not the middle of the drawing. The SVG is positioned
 * so the cut point sits on the text baseline at the write position and
 * everything else — shaft, vane, the whole feather — extends up and to the
 * right into empty space above the line. Anchoring anywhere else puts the
 * feather through the words being written.
 *
 * It is drawn rather than generated: a real quill tapers along its whole
 * length, the vane is fuller near the middle than at either end, and the barbs
 * run at a slant to the shaft, not perpendicular to it. Those three things are
 * what stop a feather looking like a leaf.
 */
function QuillNib() {
  return (
    <span className="aop-quill-nib" aria-hidden>
      <svg viewBox="0 0 100 100" width="92" height="92">
        <defs>
          <linearGradient id="aopQuillVane" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#6d5b44" />
            <stop offset="45%" stopColor="#9d8a6a" />
            <stop offset="100%" stopColor="#cfc0a2" />
          </linearGradient>
        </defs>

        {/* THE VANE — fuller at the middle, tapering to nothing at both ends. */}
        <path
          d="M30 68 C38 52 50 34 66 20 C74 13 82 9 88 8 C86 16 82 26 76 36 C66 52 52 64 38 74 Z"
          fill="url(#aopQuillVane)"
          opacity=".95"
        />
        <path
          d="M28 70 C34 56 44 38 58 24 C64 18 70 14 75 12 C72 20 67 30 60 40 C50 55 38 66 28 74 Z"
          fill="#7d6a4f"
          opacity=".55"
        />

        {/* BARBS — slanted toward the tip, never perpendicular. */}
        <g stroke="#5c4c38" strokeWidth=".9" opacity=".5" fill="none">
          <path d="M38 62 L52 44" /><path d="M43 58 L58 38" /><path d="M48 53 L64 33" />
          <path d="M53 48 L69 29" /><path d="M58 43 L74 25" /><path d="M63 38 L78 21" />
          <path d="M34 66 L46 50" /><path d="M68 32 L82 17" />
        </g>

        {/* THE SHAFT — a taper, not a stroke of constant width. */}
        <path
          d="M11 89 C20 76 40 50 62 28 C72 18 82 11 89 7 C84 15 76 25 66 36 C46 58 25 78 14 91 Z"
          fill="#e8ddc6"
        />
        <path
          d="M11 89 C20 76 40 50 62 28 C72 18 82 11 89 7"
          stroke="#8c7a5e"
          strokeWidth=".8"
          fill="none"
          opacity=".7"
        />

        {/* THE CUT NIB. The slit is what makes it a pen. */}
        <path d="M8 93 L15 85 L18 89 Z" fill="#2f2418" />
        <path d="M9.5 91.5 L15 86" stroke="#0f0a06" strokeWidth=".7" />
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
