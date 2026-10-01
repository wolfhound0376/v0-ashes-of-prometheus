"use client"

// /cave — first-person dungeons. The Darklake Cave is dungeon #1.
//
// Sam, 2026-09-29: "If we go into a cave we can make the game into a
// Wolfenstein-like POV for the dungeon part." Sam, 2026-09-30: "the cave is a
// template for dungeons." The engine is a self-contained canvas game served
// same-origin from /cave-pov/index.html (public/cave-pov/) inside an iframe,
// the same way /forge/builder embeds the Character Forge, so it keeps its own
// render loop, pointer lock and audio graph without touching the dashboard.
// Each dungeon is a record in public/cave-pov/dungeons/<id>.json; /cave?d=<id>
// picks one.
//
// The DM (aop_access_role = "dm") gets a Builder toggle: it reopens the game
// with the in-game builder (B) for placing chests, traps, lore, props and
// creatures. The page hands the iframe the public Supabase URL + anon key so
// the builder's chest picker reads the live `items` catalog — nothing invented.
//
// Design records: docs/design/claude_Cave_POV.md, claude_Dungeon_Template.md.

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Hammer } from "lucide-react"

export default function CavePage() {
  const frame = useRef<HTMLIFrameElement | null>(null)
  const [isDm, setIsDm] = useState(false)
  const [build, setBuild] = useState(false)
  const [dungeon, setDungeon] = useState("darklake")

  useEffect(() => {
    try {
      setIsDm(window.localStorage.getItem("aop_access_role") === "dm")
      const d = new URLSearchParams(window.location.search).get("d")
      if (d && /^[a-z0-9-]+$/.test(d)) setDungeon(d)
    } catch {
      /* storage blocked: play without the builder */
    }
  }, [])

  const sendConfig = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (url && key) frame.current?.contentWindow?.postMessage({ aop: "config", url, key }, window.location.origin)
  }

  const src = `/cave-pov/index.html?d=${dungeon}${build ? "&build=1" : ""}`

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
        <span className="font-serif text-xs uppercase tracking-[0.22em] text-stone-400">First person · {dungeon}</span>
        {isDm && (
          <button
            type="button"
            onClick={() => setBuild((b) => !b)}
            aria-pressed={build}
            className="ml-auto inline-flex items-center gap-1.5 border border-amber-700/60 px-2.5 py-1 font-serif text-xs uppercase tracking-[0.16em] text-amber-300 hover:bg-amber-900/30 aria-pressed:bg-amber-700/30"
          >
            <Hammer className="h-3.5 w-3.5" aria-hidden />
            {build ? "Builder on (press B)" : "Builder"}
          </button>
        )}
      </header>
      <iframe
        key={src}
        ref={frame}
        src={src}
        onLoad={sendConfig}
        title="First-person dungeon"
        className="min-h-0 w-full flex-1 border-0"
        allow="autoplay; fullscreen"
      />
    </main>
  )
}
