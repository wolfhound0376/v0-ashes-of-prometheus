"use client"

// /cave — the Darklake Cave, first person.
//
// Sam, 2026-09-29: "If we go into a cave we can make the game into a
// Wolfenstein-like POV for the dungeon part." Open ground stays painted scenes;
// a cave or dungeon switches to this grid raycaster. The module is a
// self-contained canvas game served same-origin from /cave-pov/index.html
// (public/cave-pov/) inside an iframe, the same way /forge/builder embeds the
// Character Forge — so it can keep its own render loop, pointer lock and audio
// graph without touching the dashboard.
//
// The game code is public/cave-pov/pov.js; the design record is
// docs/design/claude_Cave_POV.md. It reads no database yet: the four
// characters' sheets, the creatures' stat blocks and the loot are baked into
// public/cave-pov/manifest.js from the tables they came from. Wiring it to live
// characters and awards is the next lane (see the doc, "Not yet wired").

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function CavePage() {
  return (
    <main className="flex h-dvh flex-col bg-[#07060b] text-stone-200">
      <header className="flex items-center gap-3 border-b border-amber-900/40 px-4 py-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-serif text-xs uppercase tracking-[0.18em] text-amber-300/90 hover:text-amber-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Dashboard
        </Link>
        <span className="font-serif text-xs uppercase tracking-[0.22em] text-stone-400">Darklake Cave · first person</span>
      </header>
      <iframe
        src="/cave-pov/index.html"
        title="Darklake Cave — first-person"
        className="min-h-0 w-full flex-1 border-0"
        allow="autoplay; fullscreen"
      />
    </main>
  )
}
