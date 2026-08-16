"use client"

// /intro — the front door of Ashes of Prometheus.
//
// The sequence: the link lands on a full-screen intro video (muted video
// autoplay is always allowed; the campaign theme starts with it where the
// browser permits, otherwise on the first tap or keypress). When the video
// ends — or is skipped — the key art settles in as a static backdrop with an
// ornate ENTER button. Entering is a CLIENT-side navigation to /join, so the
// theme (mounted in the root layout) keeps playing while the player speaks
// the words at the door, and only fades once they reach the dashboard.

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { getThemeAudio, playThemeAudio } from "@/components/theme-audio"
import { MusicToggle } from "@/components/music-toggle"
import { isMusicOff, onMusicPrefChange } from "@/lib/audio-prefs"

type Stage = "video" | "poster"

export default function IntroPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [stage, setStage] = useState<Stage>("video")
  const [needsTap, setNeedsTap] = useState(false)
  const [enterHref, setEnterHref] = useState("/join")
  // The intro video carries its own audio, so it obeys the same preference as
  // the theme. Starts unmuted (music-on default) and follows later flips.
  const [videoMuted, setVideoMuted] = useState(false)

  useEffect(() => {
    // Seen once per browser session — the dashboard checks this before
    // sending anyone back here.
    window.sessionStorage.setItem("aop_intro_seen", "1")
    // A browser that already holds a seat (or the DM screen) re-enters its
    // own dashboard; strangers go to the code door.
    const role = window.localStorage.getItem("aop_access_role")
    const token = window.localStorage.getItem("aop_claim_token")
    const character = window.localStorage.getItem("aop_character_id")
    if (role === "dm" || (role === "player" && token && character)) setEnterHref("/")
  }, [])

  // Mirror the "music off" preference onto the video, re-evaluated whenever it
  // changes — turning music off silences the video's own audio too.
  useEffect(() => {
    setVideoMuted(isMusicOff())
    return onMusicPrefChange(() => setVideoMuted(isMusicOff()))
  }, [])

  useEffect(() => {
    const video = videoRef.current
    video?.play().catch(() => setStage("poster")) // video blocked = ancient browser; show the door

    const audio = getThemeAudio()
    if (!audio) return
    audio.volume = 0.55
    const tryTheme = () => {
      // Check the preference each time the listener fires, not once at setup —
      // a player can flip it off mid-intro and the next tap must not start it.
      if (isMusicOff() || !audio.paused) return
      playThemeAudio()
        .then(() => setNeedsTap(false))
        .catch(() => setNeedsTap(true))
    }
    tryTheme()
    window.addEventListener("pointerdown", tryTheme)
    window.addEventListener("keydown", tryTheme)
    return () => {
      window.removeEventListener("pointerdown", tryTheme)
      window.removeEventListener("keydown", tryTheme)
      // Deliberately NOT pausing here — the theme carries on into /join.
    }
  }, [])

  const finishVideo = () => setStage("poster")

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-stone-200">
      <MusicToggle />

      {/* Key art — revealed when the video ends */}
      <div
        className={
          "absolute inset-0 bg-[url('/images/intro-poster.webp')] bg-cover bg-center transition-opacity duration-1000 " +
          (stage === "video" ? "opacity-0" : "opacity-100")
        }
      />

      {/* The intro video — full screen from the first moment. Any click
          skips straight to the door; the same tap unlocks the music. */}
      <video
        ref={videoRef}
        onClick={finishVideo}
        src="/videos/intro.mp4"
        muted={videoMuted}
        autoPlay
        playsInline
        preload="auto"
        onEnded={finishVideo}
        className={
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-700 " +
          (stage === "video" ? "opacity-100" : "pointer-events-none opacity-0")
        }
      />

      {/* Sound hint — only when the browser held the music back */}
      {needsTap && (
        <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full border border-[#8a6a3a]/60 bg-black/60 px-4 py-1.5 text-[11px] uppercase tracking-[0.25em] text-[#c9a868] backdrop-blur-sm">
          Tap anywhere for sound
        </div>
      )}

      {stage === "video" && (
        <p className="pointer-events-none absolute bottom-6 right-8 text-xs uppercase tracking-[0.25em] text-stone-600">
          click anywhere to skip ▸
        </p>
      )}

      {/* The door awaits — theme loops on through it */}
      {stage === "poster" && (
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-[7vh]">
          <Link
            href={enterHref}
            className="group relative rounded-sm border-2 border-[#8a6a3a] bg-gradient-to-b from-[#2a2015]/90 via-black/80 to-[#2a2015]/90 px-16 py-5 font-serif text-3xl uppercase tracking-[0.4em] text-[#e8c56a] shadow-[0_0_40px_rgba(201,168,104,0.35)] backdrop-blur-sm transition-all duration-300 hover:border-[#f4e0a8] hover:text-[#fff3cf] hover:shadow-[0_0_80px_rgba(232,197,106,0.6)]"
          >
            <span className="pointer-events-none absolute -inset-1 -z-10 animate-pulse rounded border border-[#c9a868]/20" />
            Enter
          </Link>
          <p className="mt-4 text-[11px] uppercase tracking-[0.3em] text-stone-500">
            The door is barred · speak the words
          </p>
        </div>
      )}
    </div>
  )
}
