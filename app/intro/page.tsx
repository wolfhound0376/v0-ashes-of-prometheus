"use client"

// /intro — the TITLE SCREEN. The front door of Ashes of Prometheus.
//
// Sam, 2026-10-24: "The intro to most players should have a start new game and then route you
// immediately into character creation", "Play Saved Game … will ask for your code", and the DM
// entrance "should only be an administrative way with the code." So the door is three choices and
// nothing else:
//
//   START NEW GAME     → /forge   the Forge wizard; no code, no detour
//   PLAY SAVED GAME    → /join    pick your card, speak your three words, wake in the pen
//   Dungeon Master     → DM_HREF  small, bottom-left, out of a player's way
//
// A browser that already holds a seat gets CONTINUE first, which re-enters its own game.
//
// The opening film plays once per browser session on top of all this — click anywhere or Skip —
// but only while Cinematics is ON in the settings sheet (bottom-right gear, lib/settings.ts). The
// title score follows the Intro music switch the same way. Sam, 2026-10-11: sitting through the intro
// every time is annoying, so the dashboard never sends a browser back here once it has been seen.

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Settings, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import { getThemeAudio, playThemeAudio } from "@/components/theme-audio"
import { SettingsSheet } from "@/components/settings-sheet"
import { isMusicOff, onMusicPrefChange, setMusicOff } from "@/lib/audio-prefs"
import { cinematicsOn, introMusicOn, onSettingsChange } from "@/lib/settings"

/** Where the small "Dungeon Master" link goes: the DM door (/dm) — code, then the table. */
const DM_HREF = "/dm"
const FILM_SEEN_KEY = "aop_title_film_seen" // sessionStorage: the film plays once per browser session

type Stage = "film" | "title"

export default function TitleScreen() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [stage, setStage] = useState<Stage | null>(null) // null until the device's settings are read
  const [seated, setSeated] = useState<"player" | "dm" | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [musicOff, setMusicOffState] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)
  const [leaving, setLeaving] = useState<string | null>(null)

  // First paint: remember that this browser has seen the door, learn whether it already holds a
  // seat, and decide film or title from the device's settings.
  useEffect(() => {
    try {
      window.sessionStorage.setItem("aop_intro_seen", "1")
      window.localStorage.setItem("aop_intro_seen_ever", "1")
    } catch { /* storage blocked */ }
    try {
      const role = window.localStorage.getItem("aop_access_role")
      const token = window.localStorage.getItem("aop_claim_token")
      const character = window.localStorage.getItem("aop_character_id")
      if (role === "dm") setSeated("dm")
      else if (role === "player" && token && character) setSeated("player")
    } catch { /* storage blocked */ }
    let filmSeen = false
    try { filmSeen = window.sessionStorage.getItem(FILM_SEEN_KEY) === "1" } catch { /* storage blocked */ }
    setStage(cinematicsOn() && !filmSeen ? "film" : "title")
    setMusicOffState(!introMusicOn())
    return onSettingsChange(() => {
      setMusicOffState(!introMusicOn())
      if (!cinematicsOn()) setStage("title")
    })
  }, [])

  // The film: muted autoplay is always allowed; the score rides with it where the browser permits,
  // otherwise on the first tap. Any click skips.
  useEffect(() => {
    if (stage !== "film") return
    const video = videoRef.current
    video?.play().catch(() => finishFilm())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  // The title score. One place starts it (playThemeAudio honours the global mute); the Intro music
  // switch gates it here. Asks on mount, again on the first gesture, and again when a switch flips.
  useEffect(() => {
    if (stage === null) return
    const audio = getThemeAudio()
    if (!audio) return
    audio.volume = 0.55
    const tryTheme = () => {
      if (!introMusicOn()) { if (!audio.paused) audio.pause(); return }
      if (!audio.paused) { setNeedsTap(false); return }
      playThemeAudio().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true))
    }
    tryTheme()
    window.addEventListener("pointerdown", tryTheme)
    window.addEventListener("keydown", tryTheme)
    const offPref = onMusicPrefChange(tryTheme)
    const offSettings = onSettingsChange(tryTheme)
    return () => {
      window.removeEventListener("pointerdown", tryTheme)
      window.removeEventListener("keydown", tryTheme)
      offPref(); offSettings()
      // Deliberately NOT pausing: the theme carries on into the Forge and the door.
    }
  }, [stage])

  const finishFilm = useCallback(() => {
    try { window.sessionStorage.setItem(FILM_SEEN_KEY, "1") } catch { /* storage blocked */ }
    setStage("title")
  }, [])

  const go = (href: string) => {
    if (leaving) return
    setLeaving(href)
    window.setTimeout(() => router.push(href), 420)
  }

  const toggleMute = () => {
    const off = !isMusicOff()
    setMusicOff(off)
    setMusicOffState(off || !introMusicOn())
  }

  const filmUp = stage === "film"

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-stone-200">
      <style>{`
        @keyframes ttl-drift { from { transform: scale(1) } to { transform: scale(1.03) } }
        @keyframes ttl-ember { 0% { transform: translate3d(0,0,0) scale(1); opacity: 0 } 10% { opacity: .9 } 90% { opacity: .5 } 100% { transform: translate3d(var(--dx), -110vh, 0) scale(.3); opacity: 0 } }
        @keyframes ttl-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes ttl-rule { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        .ttl-art { animation: ttl-drift 48s ease-in-out infinite alternate; will-change: transform; }
        .ttl-ember { position: absolute; bottom: -2vh; width: 3px; height: 3px; border-radius: 50%; background: #ffb257; box-shadow: 0 0 8px 2px rgba(255,140,40,.55); animation: ttl-ember linear infinite; pointer-events: none; }
        .ttl-menu > * { animation: ttl-rise .7s cubic-bezier(.2,.7,.2,1) both; }
        .ttl-rule { transform-origin: 50% 50%; animation: ttl-rule 1.2s cubic-bezier(.2,.7,.2,1) .3s both; }
        @media (prefers-reduced-motion: reduce) { .ttl-art, .ttl-ember, .ttl-menu > *, .ttl-rule { animation: none !important; } }
      `}</style>

      {/* THE KEY ART — the whole painting, never cropped (Sam, 2026-10-25: "the head of the lich is cut
          off"). On a wide screen it stands at full height with a blurred copy of itself filling the
          sides; on a phone it covers, because the menu sits over the bottom there anyway. */}
      <div className={cn("absolute inset-0 transition-opacity duration-1000", filmUp ? "opacity-0" : "opacity-100")}>
        <div className="absolute inset-0 hidden scale-110 bg-[url('/images/intro-poster.webp')] bg-cover bg-center opacity-80 blur-2xl md:block" />
        <div className="ttl-art absolute inset-0 bg-[url('/images/intro-poster.webp')] bg-cover bg-[center_30%] md:bg-contain md:bg-center md:bg-no-repeat" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(0,0,0,0)_0%,rgba(0,0,0,0.35)_55%,rgba(0,0,0,0.85)_100%)]" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" />
        {/* embers */}
        {EMBERS.map((e, i) => (
          <span key={i} className="ttl-ember" style={{ left: e.left, animationDuration: e.dur, animationDelay: e.delay, ["--dx" as string]: e.dx } as React.CSSProperties} />
        ))}
      </div>

      {/* THE FILM — once per session, only while Cinematics is on. Click anywhere to skip. */}
      {filmUp && (
        <video
          ref={videoRef}
          onClick={finishFilm}
          onEnded={finishFilm}
          src="/videos/intro.mp4"
          muted={musicOff}
          autoPlay
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {filmUp && (
        <button type="button" onClick={finishFilm} className="absolute bottom-6 right-8 z-20 rounded-sm border border-[#8a6a3a]/50 bg-black/50 px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-stone-400 backdrop-blur-sm transition-colors hover:border-[#c9a868] hover:text-[#e8c56a]">
          Skip ▸
        </button>
      )}

      {/* THE MENU — right of centre on a wide screen, below the art's focus on a phone. */}
      {stage === "title" && (
        <div className={cn("absolute inset-0 flex items-end justify-center pb-[9vh] transition-opacity duration-500 md:items-center md:justify-end md:pb-0 md:pr-[4vw]", leaving ? "opacity-0" : "opacity-100")}>
          <div className="ttl-menu relative w-[min(92vw,380px)]">
            {/* a soft scrim so the buttons read against the busiest part of the painting */}
            <div className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.85)_0%,rgba(0,0,0,0.55)_55%,transparent_78%)]" />

            <div className="mb-6 text-center" style={{ animationDelay: "0s" }}>
              <div className="text-[10px] uppercase tracking-[0.5em] text-[#8a6a3a]">Out of the Abyss</div>
              <div className="ttl-rule mx-auto mt-3 h-px w-40 bg-gradient-to-r from-transparent via-[#c9a868] to-transparent" />
            </div>

            {seated && (
              <MenuButton primary onClick={() => go("/")} delay=".08s" sub={seated === "dm" ? "Back behind the screen" : "Your seat is kept"}>
                Continue
              </MenuButton>
            )}
            <MenuButton primary={!seated} onClick={() => go("/forge")} delay={seated ? ".16s" : ".08s"} sub="Forge a hero. The drow will take the rest.">
              Start New Game
            </MenuButton>
            <MenuButton onClick={() => go("/join")} delay={seated ? ".24s" : ".16s"} sub="Speak your three words">
              Play Saved Game
            </MenuButton>

            <p className="mt-5 text-center text-[11px] leading-relaxed text-stone-600" style={{ animationDelay: ".32s" }}>
              New heroes wait for the Dungeon Master to open their cell.
            </p>
          </div>
        </div>
      )}

      {/* corners: the sound, the gear, the DM's small door */}
      <button
        type="button"
        onClick={toggleMute}
        title={musicOff ? "Music on" : "Music off"}
        aria-label={musicOff ? "Turn music on" : "Turn music off"}
        className="fixed right-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-[#8a6a3a]/60 bg-gradient-to-b from-[#1a1614] to-[#0f0d0b] text-[#c4a777] shadow-lg shadow-black/40 transition-colors hover:border-[#c4a777] hover:text-[#e8c56a]"
      >
        {musicOff ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      {needsTap && !musicOff && stage === "title" && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#8a6a3a]/60 bg-black/60 px-4 py-1.5 text-[11px] uppercase tracking-[0.25em] text-[#c9a868] backdrop-blur-sm">
          Tap anywhere for sound
        </div>
      )}
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        title="Settings"
        aria-label="Open settings"
        className="fixed bottom-4 right-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-[#8a6a3a]/60 bg-gradient-to-b from-[#1a1614] to-[#0f0d0b] text-[#c4a777] shadow-lg shadow-black/40 transition-all duration-500 hover:rotate-90 hover:border-[#c4a777] hover:text-[#e8c56a]"
      >
        <Settings className="h-4 w-4" />
      </button>
      {stage === "title" && (
        <button
          type="button"
          onClick={() => go(DM_HREF)}
          className="group fixed bottom-5 left-6 z-50 flex items-center gap-2 text-[10px] uppercase tracking-[0.35em] text-stone-600 transition-colors hover:text-[#c9a868]"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full border border-stone-700 font-serif text-[11px] text-stone-500 transition-colors group-hover:border-[#c9a868] group-hover:text-[#e8c56a]">☠</span>
          Dungeon Master
        </button>
      )}

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

function MenuButton({ children, sub, primary, onClick, delay }: { children: React.ReactNode; sub?: string; primary?: boolean; onClick: () => void; delay: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: delay }}
      className={cn(
        "group relative mb-3 block w-full rounded-[3px] border px-6 py-4 text-left transition-all duration-300",
        "bg-gradient-to-b from-[#15110c]/95 via-[#100d09]/95 to-[#0b0907]/95 backdrop-blur-[2px]",
        primary
          ? "border-[#c9a868]/80 shadow-[inset_0_0_24px_rgba(201,168,104,0.10),0_0_40px_rgba(201,168,104,0.18)] hover:shadow-[inset_0_0_28px_rgba(201,168,104,0.16),0_0_70px_rgba(232,197,106,0.35)]"
          : "border-[#7a5f33]/60 hover:border-[#c9a868]/80 hover:shadow-[0_0_40px_rgba(201,168,104,0.18)]",
        "hover:-translate-y-0.5",
      )}
    >
      <Bracket className="left-[4px] top-[4px]" />
      <Bracket className="right-[4px] top-[4px] -scale-x-100" />
      <Bracket className="bottom-[4px] left-[4px] -scale-y-100" />
      <Bracket className="bottom-[4px] right-[4px] -scale-100" />
      <span className={cn("block font-serif text-[17px] uppercase tracking-[0.28em] transition-colors", primary ? "text-[#e8c56a] group-hover:text-[#fff3cf]" : "text-[#d9bd7e] group-hover:text-[#f0dba8]")}>
        {children}
      </span>
      {sub && <span className="mt-1 block text-[11px] tracking-[0.04em] text-stone-500 transition-colors group-hover:text-stone-400">{sub}</span>}
    </button>
  )
}

function Bracket({ className }: { className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={cn("pointer-events-none absolute h-3 w-3 text-[#c9a868]/70", className)}>
      <path d="M0 11V0h11" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="2" cy="2" r="1" fill="currentColor" />
    </svg>
  )
}

/** A dozen embers drifting up the painting. Fixed values so SSR and the client agree. */
const EMBERS = [
  { left: "6%", dur: "14s", delay: "0s", dx: "40px" },
  { left: "14%", dur: "18s", delay: "-6s", dx: "-30px" },
  { left: "22%", dur: "16s", delay: "-11s", dx: "25px" },
  { left: "31%", dur: "20s", delay: "-3s", dx: "-45px" },
  { left: "40%", dur: "15s", delay: "-9s", dx: "35px" },
  { left: "48%", dur: "19s", delay: "-14s", dx: "-20px" },
  { left: "57%", dur: "17s", delay: "-5s", dx: "50px" },
  { left: "66%", dur: "21s", delay: "-12s", dx: "-35px" },
  { left: "74%", dur: "15s", delay: "-2s", dx: "20px" },
  { left: "83%", dur: "18s", delay: "-8s", dx: "-50px" },
  { left: "91%", dur: "16s", delay: "-15s", dx: "30px" },
  { left: "96%", dur: "22s", delay: "-4s", dx: "-25px" },
]
