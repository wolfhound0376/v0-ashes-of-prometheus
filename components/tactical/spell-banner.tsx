"use client"

import { useEffect, useState } from "react"
import type { BannerModel, BannerLine } from "@/lib/spell-banner"
import { lifeFor } from "@/lib/spell-banner"

// ============================================================================
// THE SPELL BANNER — the arcade card that drops when something is cast.
//
// Sam: "it should briefly pop up in the center in highly stylized and large
// letters with the fail or succeed showing up on the bottom of the letters."
//
// DOM, NOT THREE.JS, and that is the one structural decision here.
//
// Everything else that floats over this board — damage numbers, the outcome
// word, the crit die — is a sprite in the scene, because each of them belongs
// to a PLACE: a number rises off the body it came from, and it has to be right
// under every camera the board has, including first person.
//
// This belongs to no place. It is centre-screen, in front of everything,
// exactly as big as the screen says regardless of where the camera is looking.
// A billboard would have to be pushed in front of the near plane and rescaled
// per camera to fake that, and would still fight the depth buffer. Text laid
// over the canvas is simply what this is.
//
// It also means the type is real type — kerned, shadowed, wrapped by the
// browser — instead of glyphs painted into a 320px canvas.
// ============================================================================

/** What each tone looks like. Six feelings, six palettes. */
const TONE: Record<BannerLine["tone"], { ink: string; glow: string }> = {
  // A death is the loudest line on the card and the only one in the enemy's
  // own red — the same red the board uses for a hostile ring.
  kill:  { ink: "#ff8a6a", glow: "#e0331080" },
  crit:  { ink: "#ffd76a", glow: "#c9a22799" },
  hit:   { ink: "#f0e2bd", glow: "#00000000" },
  // Steel blue, matching the floating SAVED word this line explains.
  save:  { ink: "#bcd8f5", glow: "#5f9fd855" },
  miss:  { ink: "#9a9184", glow: "#00000000" },
  heal:  { ink: "#8fe0b0", glow: "#3fbb8055" },
}

export interface BannerCast extends BannerModel {
  /** Bumped per cast so a second Fireball restarts the animation. */
  id: number
}

export default function SpellBanner({ cast }: { cast: BannerCast | null }) {
  const [shown, setShown] = useState<BannerCast | null>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!cast) return
    setShown(cast)
    setLeaving(false)
    const life = lifeFor(cast.lines.length) * 1000
    // Fade for the last 450ms rather than vanishing on a frame, which reads
    // as a dropped render.
    const out = window.setTimeout(() => setLeaving(true), Math.max(0, life - 450))
    const gone = window.setTimeout(() => setShown(null), life)
    return () => { window.clearTimeout(out); window.clearTimeout(gone) }
  }, [cast])

  if (!shown) return null

  return (
    // z-40 clears the HUD (z-20) and the location plate (z-30). Never
    // interactive: the fight underneath it stays clickable while it is up,
    // because a banner that eats a click during a turn is a bug report.
    <div
      key={shown.id}
      className="pointer-events-none absolute inset-x-0 top-[26%] z-40 flex flex-col items-center px-6 text-center"
      style={{
        animation: "aop-banner-in 260ms cubic-bezier(.2,1.4,.4,1) both",
        opacity: leaving ? 0 : 1,
        transition: "opacity 450ms ease-out",
      }}
    >
      <style>{`
        @keyframes aop-banner-in {
          from { transform: scale(1.22) translateY(-10px); opacity: 0 }
          60%  { transform: scale(0.98); opacity: 1 }
          to   { transform: scale(1) translateY(0); opacity: 1 }
        }
      `}</style>

      {/* THE HEADLINE. Big, gold, gothic caps — the board's own voice, the
          same one the location plate and the turn banner speak in. Two text
          shadows: a hard black for legibility over a lit floor, and a wide
          gold bloom so it reads as lit rather than pasted on. */}
      <div
        className="font-serif font-semibold uppercase leading-[1.05] tracking-[0.14em] text-[#f6e3ae]"
        style={{
          fontSize: "clamp(26px, 4.4vw, 62px)",
          textShadow: "0 3px 10px #000, 0 0 34px #c9a22766, 0 0 78px #c9a22733",
        }}
      >
        {shown.headline}
      </div>

      {/* Sam: "the fail or succeed showing up on the bottom of the letters."
          A hairline under the headline separates the two, so the outcomes
          read as a consequence of the cast rather than more of its name. */}
      {shown.lines.length > 0 && (
        <div className="mt-2 h-px w-[min(46ch,72%)] bg-gradient-to-r from-transparent via-[#c9a227aa] to-transparent" />
      )}

      <div className="mt-2 flex flex-col items-center gap-[2px]">
        {shown.lines.map((l, i) => (
          <div
            key={i}
            className="font-serif tracking-[0.04em]"
            style={{
              fontSize: "clamp(12px, 1.5vw, 20px)",
              color: TONE[l.tone].ink,
              textShadow: `0 2px 6px #000, 0 0 16px ${TONE[l.tone].glow}`,
              // Each line arrives just after the one above it, so five
              // victims read as a list being counted out rather than a wall
              // appearing at once.
              animation: `aop-banner-in 220ms ease-out both`,
              animationDelay: `${120 + i * 90}ms`,
            }}
          >
            {l.text}
          </div>
        ))}
      </div>
    </div>
  )
}
