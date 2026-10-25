"use client"

// TO THE MAP — the dashboard's way back to the pixel map (Sam, 2026-10-25: "there needs to be a way to go
// to the pixel map in the game easily. There should be a high def button that glows gold when you hover and
// also has an audible click when you hit it.")
//
// A struck-gold plaque in the top bar, for every seat (the old "Open the Map" was DM-only and hidden under
// the Tactical Map tab). Hover: the bevel brightens, a gold aura blooms and a sheen sweeps across. Press:
// the brass-latch click (lib/ui-tick.ts uiLatch) — data-no-tick keeps the app-wide key tap from doubling it.
// The move goes through the stage, like every other place-to-place move. A rehearsal (/?sandbox=1) stays one.

import { useEffect, useState } from "react"
import { useStage } from "@/components/stage/stage-provider"
import { mapHref } from "@/lib/map-entry"
import { uiLatch } from "@/lib/ui-tick"

export function MapButton({ className }: { className?: string }) {
  const stage = useStage()
  // Set after mount, never at render, so SSR and the first client render agree on the href.
  const [href, setHref] = useState(mapHref(false))
  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get("sandbox") === "1") setHref(mapHref(true)) } catch { /* no window */ }
  }, [])

  return (
    <>
      <a
        href={href}
        data-no-tick
        aria-label="Go to the map"
        title="Go to the map"
        onPointerDown={(e) => { if (e.button === 0) uiLatch() }}
        onKeyDown={(e) => { if (e.key === "Enter") uiLatch() }}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return // a new tab stays a new tab
          e.preventDefault()
          void stage.go(href, { caption: "The map, then. Mind where you stand." })
        }}
        className={`aop-map-btn group relative isolate inline-flex items-center gap-2 overflow-hidden rounded-[4px] px-4 py-1.5 font-serif text-[13px] uppercase tracking-[0.2em] ${className ?? ""}`}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="aop-map-icon h-4 w-4 shrink-0">
          {/* A folded map with a pin: three panels, a dashed road, a gold pin head. */}
          <path d="M3 6.2 8.4 4l7.2 2.4L21 4.2v13.6l-5.4 2.2-7.2-2.4L3 19.8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M8.4 4v13.6M15.6 6.4V20" fill="none" stroke="currentColor" strokeWidth="1.1" opacity=".6" />
          <path d="M5 15.5c2-1 3-3.2 5.5-3.3s3.2 1.6 5.6.6" fill="none" stroke="currentColor" strokeWidth="1.1" strokeDasharray="1.6 1.6" />
          <circle cx="17.6" cy="9.4" r="1.7" fill="currentColor" />
        </svg>
        <span className="relative">The Map</span>
        <span aria-hidden className="aop-map-sheen" />
      </a>
      <style>{`
        .aop-map-btn {
          color: #f3dc9c;
          background:
            linear-gradient(180deg, rgba(255,236,170,.10), rgba(0,0,0,0) 45%),
            linear-gradient(180deg, #2b1f0e 0%, #17100a 60%, #0f0a06 100%) padding-box,
            linear-gradient(180deg, #f7e2a0 0%, #c99a3e 35%, #7a5418 70%, #d9b25a 100%) border-box;
          border: 1px solid transparent;
          box-shadow:
            inset 0 1px 0 rgba(255,240,190,.28),
            inset 0 -1px 0 rgba(0,0,0,.6),
            0 1px 2px rgba(0,0,0,.7),
            0 0 0 1px rgba(0,0,0,.55);
          text-shadow: 0 1px 0 #000, 0 0 6px rgba(240,200,110,.25);
          transition: box-shadow .22s ease, color .22s ease, transform .12s ease, filter .22s ease;
        }
        .aop-map-btn:hover, .aop-map-btn:focus-visible {
          color: #fff4cf;
          outline: none;
          filter: brightness(1.12);
          box-shadow:
            inset 0 1px 0 rgba(255,244,200,.45),
            inset 0 -1px 0 rgba(0,0,0,.5),
            0 0 0 1px rgba(0,0,0,.4),
            0 0 10px 1px rgba(245,196,90,.65),
            0 0 26px 4px rgba(214,160,52,.35);
          text-shadow: 0 1px 0 #000, 0 0 10px rgba(255,214,120,.8);
        }
        .aop-map-btn:active { transform: translateY(1px) scale(.985); filter: brightness(1.25); }
        .aop-map-icon { color: #e9c46a; filter: drop-shadow(0 0 2px rgba(0,0,0,.9)); transition: color .22s ease, filter .22s ease; }
        .aop-map-btn:hover .aop-map-icon, .aop-map-btn:focus-visible .aop-map-icon { color: #ffe39a; filter: drop-shadow(0 0 4px rgba(255,210,110,.9)); }
        .aop-map-sheen {
          position: absolute; inset: -40% auto -40% -60%; width: 40%;
          background: linear-gradient(100deg, transparent, rgba(255,240,190,.55), transparent);
          transform: skewX(-18deg) translateX(0); opacity: 0; pointer-events: none;
        }
        .aop-map-btn:hover .aop-map-sheen, .aop-map-btn:focus-visible .aop-map-sheen { animation: aop-map-sheen .9s ease-out; }
        @keyframes aop-map-sheen { 0% { opacity: 0; transform: skewX(-18deg) translateX(0); } 20% { opacity: 1; } 100% { opacity: 0; transform: skewX(-18deg) translateX(420%); } }
        @media (prefers-reduced-motion: reduce) { .aop-map-btn:hover .aop-map-sheen { animation: none; } .aop-map-btn:active { transform: none; } }
      `}</style>
    </>
  )
}
