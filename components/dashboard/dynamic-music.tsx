"use client"

import { useEffect, useRef, useState } from "react"
import { Music, Play, Pause, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import { MUSIC_LIBRARY, getTrackById, type MusicTrack } from "@/lib/music-library"

interface DynamicMusicProps {
  /** Current location/environment name (drives track selection) */
  location?: string | null
  /** True when an active hostile NPC is present (switches to combat music) */
  inCombat?: boolean
  className?: string
}

// Location keyword → track id. First match wins. All ids exist in MUSIC_LIBRARY.
const LOCATION_TRACKS: { match: RegExp; trackId: string }[] = [
  { match: /slave pen|\bjail\b|\bcell\b|prison|captiv|manacl/i, trackId: "castle-jail" },
  { match: /velkynvelve|outpost|drow|spider/i, trackId: "spiders-den" },
  { match: /sewer/i, trackId: "sewers" },
  { match: /tunnel|underdark|cavern|\bcave\b|abyss|wastes|deep/i, trackId: "cavern-of-lost-souls" },
  { match: /forest|wood|grove|fey/i, trackId: "forest-night" },
  { match: /temple|shrine|altar/i, trackId: "defiled-temple" },
  { match: /tavern|\binn\b|hearth/i, trackId: "the-hearth-inn" },
  { match: /town|village|market|hamlet/i, trackId: "country-village" },
  { match: /tomb|crypt|grave|barrow/i, trackId: "graveyard" },
  { match: /throne|court|palace|castle/i, trackId: "court-of-the-count" },
]

const COMBAT_TRACK = "there-be-dragons"
const DEFAULT_TRACK = "dungeon-i" // dark underground ambience — fits the Underdark campaign

function pickTrack(location: string | null | undefined, inCombat: boolean): MusicTrack {
  if (inCombat) return getTrackById(COMBAT_TRACK) || MUSIC_LIBRARY[0]
  const loc = location || ""
  for (const entry of LOCATION_TRACKS) {
    if (entry.match.test(loc)) {
      return getTrackById(entry.trackId) || getTrackById(DEFAULT_TRACK)!
    }
  }
  return getTrackById(DEFAULT_TRACK) || MUSIC_LIBRARY[0]
}

const BASE_VOLUME = 0.45

export function DynamicMusic({ location, inCombat = false, className }: DynamicMusicProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [enabled, setEnabled] = useState(false) // user must start playback (browser autoplay policy)
  const [muted, setMuted] = useState(false)
  const [current, setCurrent] = useState<MusicTrack>(() => pickTrack(location, inCombat))

  const target = pickTrack(location, inCombat)

  // Smoothly ramp the audio volume to a target level, then run an optional callback.
  function fade(to: number, ms: number, done?: () => void) {
    const audio = audioRef.current
    if (!audio) return
    if (fadeTimer.current) clearInterval(fadeTimer.current)
    const from = audio.volume
    const steps = 14
    let i = 0
    fadeTimer.current = setInterval(() => {
      i++
      const v = from + (to - from) * (i / steps)
      audio.volume = Math.max(0, Math.min(1, v))
      if (i >= steps) {
        if (fadeTimer.current) clearInterval(fadeTimer.current)
        fadeTimer.current = null
        done?.()
      }
    }, ms / steps)
  }

  // When the target track changes (scene/combat change), cross-fade to it.
  useEffect(() => {
    if (target.id === current.id) return
    const audio = audioRef.current
    if (!audio || !enabled) {
      // Not playing yet — just remember the new selection so it starts correctly.
      setCurrent(target)
      return
    }
    fade(0, 500, () => {
      setCurrent(target)
      audio.src = target.url
      audio.load()
      audio.play().then(() => fade(muted ? 0 : BASE_VOLUME, 600)).catch(() => {})
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.id])

  // Start/stop playback when the user toggles it.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (enabled) {
      if (audio.src !== current.url) {
        audio.src = current.url
        audio.load()
      }
      audio.volume = 0
      audio.play().then(() => fade(muted ? 0 : BASE_VOLUME, 600)).catch(() => {
        // Autoplay blocked — revert the toggle so the button reflects reality.
        setEnabled(false)
      })
    } else {
      fade(0, 300, () => audio.pause())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  // React to mute toggle.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !enabled) return
    fade(muted ? 0 : BASE_VOLUME, 250)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted])

  useEffect(() => {
    return () => {
      if (fadeTimer.current) clearInterval(fadeTimer.current)
    }
  }, [])

  return (
    <div className={cn("fixed bottom-4 right-20 z-50 flex items-center", className)}>
      <audio ref={audioRef} loop preload="none" />
      <div className="flex items-center gap-1 rounded-full bg-[#1a1614] border-2 border-[#3d3428] shadow-lg shadow-black/50 pl-1 pr-2 py-1">
        {/* Play / pause */}
        <button
          onClick={() => setEnabled(v => !v)}
          title={enabled ? "Pause music" : "Play scene music"}
          className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center transition-colors",
            enabled ? "text-[#c9a868] hover:text-[#e8d89a]" : "text-stone-500 hover:text-stone-300"
          )}
        >
          {enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        {/* Mute */}
        <button
          onClick={() => setMuted(v => !v)}
          title={muted ? "Unmute music" : "Mute music"}
          className="w-7 h-7 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-200 transition-colors"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {/* Now playing */}
        <div className="flex items-center gap-1.5 max-w-[150px] pr-1">
          <Music className={cn("w-3.5 h-3.5 flex-shrink-0", enabled ? "text-[#8b5cf6]" : "text-stone-600")} />
          <span className="text-[11px] text-stone-400 truncate" title={current.name}>
            {enabled ? current.name : "Music"}
          </span>
        </div>
      </div>
    </div>
  )
}
