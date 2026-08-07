"use client"

// /intro — the front door of Ashes of Prometheus.
//
// Flow: a BEGIN splash (the user gesture that unlocks audio) -> the intro
// video plays full-bleed with the campaign theme replacing its own sound ->
// when it ends (or is skipped) the key art settles in as a static backdrop,
// the theme keeps looping, and an ornate ENTER button leads to /join.
//
// The theme is the same file the Forge uses (/audio/forge-creation-theme.mp3)
// so the browser cache already has it by the time a player reaches creation.

import { useEffect, useRef, useState } from "react"

type Stage = "splash" | "video" | "poster"

export default function IntroPage() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [stage, setStage] = useState<Stage>("splash")

  const begin = () => {
    const audio = audioRef.current
    const video = videoRef.current
    setStage("video")
    if (audio) {
      audio.volume = 0.55
      audio.currentTime = 0
      audio.play().catch(() => {})
    }
    if (video) {
      video.currentTime = 0
      video.play().catch(() => setStage("poster"))
    }
  }

  const finishVideo = () => setStage("poster")

  // Leaving the page stops the theme.
  useEffect(() => () => audioRef.current?.pause(), [])

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-stone-200">
      <audio ref={audioRef} src="/audio/forge-creation-theme.mp3" loop preload="auto" />

      {/* Key art backdrop — under everything, revealed on splash and poster stages */}
      <div
        className={
          "absolute inset-0 bg-[url('/images/intro-poster.webp')] bg-cover bg-center transition-opacity duration-1000 " +
          (stage === "video" ? "opacity-0" : "opacity-100")
        }
      />

      {/* Intro video */}
      <video
        ref={videoRef}
        src="/videos/intro.mp4"
        muted
        playsInline
        preload="auto"
        onEnded={finishVideo}
        className={
          "absolute inset-0 h-full w-full object-contain transition-opacity duration-700 " +
          (stage === "video" ? "opacity-100" : "pointer-events-none opacity-0")
        }
      />

      {/* Splash — the gesture that unlocks the music */}
      {stage === "splash" && (
        <div className="absolute inset-0 flex flex-col items-center justify-end bg-black/40 pb-[8vh]">
          <button
            onClick={begin}
            className="group rounded-sm border-2 border-[#8a6a3a] bg-black/60 px-12 py-4 font-serif text-2xl uppercase tracking-[0.35em] text-[#d4b15a] shadow-[0_0_30px_rgba(201,168,104,0.25)] backdrop-blur-sm transition-all duration-300 hover:border-[#e8c56a] hover:text-[#f4e0a8] hover:shadow-[0_0_60px_rgba(232,197,106,0.5)]"
          >
            Begin
            <span className="mt-1 block text-[10px] tracking-[0.3em] text-stone-500 transition-colors group-hover:text-[#c9a868]">
              with sound
            </span>
          </button>
        </div>
      )}

      {/* Skip, while the video runs */}
      {stage === "video" && (
        <button
          onClick={finishVideo}
          className="absolute bottom-6 right-8 text-xs uppercase tracking-[0.25em] text-stone-500 transition-colors hover:text-[#c9a868]"
        >
          Skip intro ▸
        </button>
      )}

      {/* Poster stage — the theme loops on, the door awaits */}
      {stage === "poster" && (
        <div className="absolute inset-0 flex animate-[fadeIn_1.2s_ease-out] flex-col items-center justify-end pb-[7vh]">
          <a
            href="/join"
            className="group relative rounded-sm border-2 border-[#8a6a3a] bg-gradient-to-b from-[#2a2015]/90 via-black/80 to-[#2a2015]/90 px-16 py-5 font-serif text-3xl uppercase tracking-[0.4em] text-[#e8c56a] shadow-[0_0_40px_rgba(201,168,104,0.35)] backdrop-blur-sm transition-all duration-300 hover:border-[#f4e0a8] hover:text-[#fff3cf] hover:shadow-[0_0_80px_rgba(232,197,106,0.6)]"
          >
            <span className="pointer-events-none absolute -inset-1 -z-10 animate-pulse rounded border border-[#c9a868]/20" />
            Enter
          </a>
          <p className="mt-4 text-[11px] uppercase tracking-[0.3em] text-stone-500">
            The door is barred · speak the words
          </p>
        </div>
      )}
    </div>
  )
}
