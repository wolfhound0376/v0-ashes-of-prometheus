"use client"

// Plays a forged hero's own intro film the first time they step into the story this run, on whichever
// in-game page that is (Sam, 2026-10-27: "make sure this plays whenever lynkes plays for the first time
// or restarts campaign"). /awaken plays it inside its own sequence; this covers every other way in —
// the dashboard, the Underwalk, camp, the cave, the map, the bench. Rules in lib/hero-film.ts.
//
// Mounted once in app/layout.tsx. Renders nothing unless there is a film to play.
//   - Asks /api/hero-film once per page. Seen this run, no film, DM browser, a door page: nothing.
//   - Tries to play with sound; a browser that refuses sound without a gesture gets "Tap to play".
//   - Skip and the film's end both mark it seen (POST /api/hero-film), so it never plays twice in a run.
//   - Ignores the Cinematics switch on purpose: this is the hero's one film, not ambient show.

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { filmToPlay, isFilmGatePath } from "@/lib/hero-film"

type Phase = "idle" | "tap" | "playing"

export function HeroFilmGate() {
  const pathname = usePathname()
  const [film, setFilm] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const vid = useRef<HTMLVideoElement>(null)
  const done = useRef(false)
  const checked = useRef<string | null>(null)

  // One check per page arrival. A hero who already saw it gets `seen: true` and nothing happens.
  useEffect(() => {
    if (!isFilmGatePath(pathname) || film || checked.current === pathname) return
    checked.current = pathname
    let id = "", role = ""
    try { id = localStorage.getItem("aop_character_id") ?? ""; role = localStorage.getItem("aop_access_role") ?? "" } catch { return }
    if (!id || role === "dm") return
    let live = true
    fetch(`/api/hero-film?characterId=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { const f = filmToPlay(j, role); if (live && f) { done.current = false; setFilm(f) } })
      .catch(() => { /* no film rather than a broken page */ })
    return () => { live = false }
  }, [pathname, film])

  const finish = useCallback(() => {
    if (done.current) return
    done.current = true
    try { vid.current?.pause() } catch { /* already stopped */ }
    let id = "", token = ""
    try { id = localStorage.getItem("aop_character_id") ?? ""; token = localStorage.getItem("aop_claim_token") ?? "" } catch { /* storage blocked */ }
    if (id && token) {
      void fetch("/api/hero-film", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: id, claimToken: token }),
      }).catch(() => { /* worst case it plays once more next page */ })
    }
    setFilm(null)
    setPhase("idle")
  }, [])

  // Start it. Sound first; if the browser wants a gesture, ask for one tap.
  useEffect(() => {
    const v = vid.current
    if (!film || !v) return
    v.src = film
    v.currentTime = 0
    v.muted = false
    v.play().then(() => setPhase("playing")).catch(() => setPhase("tap"))
  }, [film])

  const tapToPlay = useCallback(() => {
    const v = vid.current
    if (!v) return
    v.muted = false
    v.play().then(() => setPhase("playing")).catch(() => {
      // Still refused (rare: a locked-down browser). Play it silent rather than not at all.
      v.muted = true
      v.play().then(() => setPhase("playing")).catch(() => finish())
    })
  }, [finish])

  if (!film) return null
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black" role="dialog" aria-label="Your story">
      <video
        ref={vid}
        playsInline
        preload="auto"
        className="h-full w-full"
        style={{ objectFit: "contain" }}
        onEnded={finish}
        onError={finish}
      />
      {phase === "tap" && (
        <button
          onClick={tapToPlay}
          className="absolute inset-0 flex items-center justify-center bg-black/70 font-serif text-2xl uppercase tracking-[0.3em] text-[#e8c56a]"
        >
          Tap to play your story
        </button>
      )}
      <button
        onClick={finish}
        className="absolute bottom-6 right-6 rounded-sm border border-[#8a6a3a]/70 bg-black/60 px-4 py-2 font-serif text-xs uppercase tracking-[0.25em] text-stone-300 hover:text-[#e8c56a]"
      >
        Skip
      </button>
    </div>
  )
}
