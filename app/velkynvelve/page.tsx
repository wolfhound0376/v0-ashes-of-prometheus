"use client"

// /velkynvelve — the walkable painted outpost (Sam, 2026-10-11: "Replace it with this map").
//
// Fourteen painted plates of Velkynvelve, one per area of the book, wired together: the party walks
// across them as pixel sprites, the camera slides from plate to plate, fights zoom into the plate,
// and when an NPC wants a word the Talk button hands over to the dashboard (/?talk=…&return=/velkynvelve),
// whose "Back to the map" button comes straight back here with the party where it stood.
//
// Like /cave, the scene is a self-contained page served same-origin from public/velkynvelve-walk/
// inside an iframe, so it keeps its own render loop and audio without touching the dashboard.
// Plates and music live in Supabase storage (vtt-assets/scenes/velkynvelve/walk/); sprites come from
// /sprites. The page is built from the scratch build in the design session; the record is
// claude/Velkynvelve_Painted_Plates_2026-10-10.md in the project.
//
// The old top-down Phaser map (components/velkynvelve/*) is no longer routed. It is left in place.

import { StageLink } from "@/components/stage/stage-provider"
import { ArrowLeft } from "lucide-react"

export default function VelkynvelvePage() {
  return (
    <main className="flex h-dvh flex-col bg-[#07060b] text-stone-200">
      <header className="flex items-center gap-3 border-b border-amber-900/40 px-4 py-2">
        <StageLink
          href="/?from=map"
          className="inline-flex items-center gap-1.5 font-serif text-xs uppercase tracking-[0.18em] text-amber-300/90 hover:text-amber-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Dashboard
        </StageLink>
        <span className="font-serif text-xs uppercase tracking-[0.22em] text-stone-400">Velkynvelve</span>
      </header>
      <iframe
        src="/velkynvelve-walk/index.html"
        title="Velkynvelve"
        className="min-h-0 w-full flex-1 border-0"
        allow="autoplay; fullscreen"
      />
    </main>
  )
}
