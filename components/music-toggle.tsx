"use client"

// A small gold-on-dark toggle for the shared "music off" preference. Dropped
// into the top-right of the pre-dashboard pages (/intro, /join, /forge,
// /forge/builder). The dashboard has its own control in dynamic-music.tsx that
// reads and writes the same preference, so it needs no second button.

import { useEffect, useState } from "react"
import { Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import { isMusicOff, setMusicOff, onMusicPrefChange } from "@/lib/audio-prefs"

export function MusicToggle({ className }: { className?: string }) {
  // Start from "music on" so SSR and first client paint agree; correct it after
  // mount, when localStorage is readable.
  const [off, setOff] = useState(false)

  useEffect(() => {
    setOff(isMusicOff())
    return onMusicPrefChange(() => setOff(isMusicOff()))
  }, [])

  const toggle = () => setMusicOff(!isMusicOff())

  return (
    <button
      type="button"
      onClick={toggle}
      title={off ? "Music on" : "Music off"}
      aria-label={off ? "Turn music on" : "Turn music off"}
      aria-pressed={off}
      className={cn(
        "fixed right-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-[#8a6a3a]/60 bg-gradient-to-b from-[#1a1614] to-[#0f0d0b] text-[#c4a777] shadow-lg shadow-black/40 transition-colors hover:border-[#c4a777] hover:text-[#e8c56a]",
        className,
      )}
    >
      {off ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
    </button>
  )
}
