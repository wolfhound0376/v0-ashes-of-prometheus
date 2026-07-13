"use client"

import { useEffect, useRef, useState } from "react"
import { Music, Play, Pause, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import { MUSIC_LIBRARY, getTrackById, type MusicTrack } from "@/lib/music-library"

interface DynamicMusicProps {
  /** Canonical session location name (drives the base track pool). */
  location?: string | null
  /** True when an active hostile NPC is present (switches to combat music) */
  inCombat?: boolean
  /**
   * Non-combat mood within the location pool. When location hasn't hydrated
   * from the session yet (null/undefined), audio selection is deferred so it
   * never keys off a client-side default like "Greenmere Village".
   */
  mood?: MusicMood
  className?: string
}

// Each location maps to a POOL of thematically-consistent tracks. Mood/combat
// selection happens WITHIN a pool (base vs tense vs combat) so the music never
// jumps to another location's theme. First match wins; all ids exist in
// MUSIC_LIBRARY. `combat`/`tense` fall back to `base` when omitted.
interface LocationPool {
  label: string
  match: RegExp
  base: string
  tense?: string
  combat?: string
}

// Shared dark combat theme for pools with no location-specific battle track.
const DEFAULT_COMBAT_TRACK = "there-be-dragons"
// Neutral dark-ambient default when the location is unknown or unmapped — never
// a village/tavern track. Fits the Underdark campaign's baseline dread.
const DEFAULT_TRACK = "dungeon-i"

const LOCATION_POOLS: LocationPool[] = [
  { label: "prison", match: /slave pen|\bjail\b|\bcell\b|prison|captiv|manacl/i, base: "castle-jail", tense: "castle-jail", combat: DEFAULT_COMBAT_TRACK },
  { label: "velkynvelve", match: /velkynvelve|outpost|drow|spider/i, base: "spiders-den", tense: "sleeping-ogre", combat: DEFAULT_COMBAT_TRACK },
  { label: "sewer", match: /sewer/i, base: "sewers", combat: DEFAULT_COMBAT_TRACK },
  { label: "underdark", match: /tunnel|underdark|cavern|\bcave\b|abyss|wastes|deep|darklake/i, base: "cavern-of-lost-souls", tense: "sleeping-dragon", combat: DEFAULT_COMBAT_TRACK },
  { label: "shadowfell", match: /shadowfell|shadow realm/i, base: "shadowfell", combat: DEFAULT_COMBAT_TRACK },
  { label: "forest", match: /forest|wood|grove|fey/i, base: "forest-night", tense: "dusk-of-the-dryad", combat: DEFAULT_COMBAT_TRACK },
  { label: "temple", match: /temple|shrine|altar/i, base: "defiled-temple", combat: DEFAULT_COMBAT_TRACK },
  { label: "tavern", match: /tavern|\binn\b|hearth/i, base: "the-hearth-inn", combat: DEFAULT_COMBAT_TRACK },
  { label: "village", match: /town|village|market|hamlet/i, base: "country-village", tense: "dark-and-stormy", combat: "burning-village" },
  { label: "tomb", match: /tomb|crypt|grave|barrow/i, base: "graveyard", combat: DEFAULT_COMBAT_TRACK },
  { label: "court", match: /throne|court|palace|castle/i, base: "court-of-the-count", combat: DEFAULT_COMBAT_TRACK },
]

export type MusicMood = "ambient" | "tense" | "combat"

export interface MusicSelection {
  track: MusicTrack
  /** Location pool label used, or "neutral" when no pool matched. */
  locationLabel: string
  mood: MusicMood
}

/**
 * Resolve the music track from the canonical location and mood.
 * HIERARCHY:
 *   1. The location string selects the base pool (never a client default).
 *   2. Mood/combat picks a track WITHIN that pool only.
 *   3. If no pool matches, fall back to a neutral dark-ambient default —
 *      never a random or village track.
 */
export function selectMusic(
  location: string | null | undefined,
  inCombat: boolean,
  mood: MusicMood = "ambient",
): MusicSelection {
  const loc = (location || "").trim()
  const effectiveMood: MusicMood = inCombat ? "combat" : mood

  if (loc) {
    for (const pool of LOCATION_POOLS) {
      if (pool.match.test(loc)) {
        const trackId =
          effectiveMood === "combat"
            ? pool.combat || pool.base
            : effectiveMood === "tense"
              ? pool.tense || pool.base
              : pool.base
        const track = getTrackById(trackId) || getTrackById(pool.base) || getTrackById(DEFAULT_TRACK) || MUSIC_LIBRARY[0]
        return { track, locationLabel: pool.label, mood: effectiveMood }
      }
    }
  }

  // No location or no mapped pool → neutral dark-ambient (or shared combat theme).
  const fallbackId = effectiveMood === "combat" ? DEFAULT_COMBAT_TRACK : DEFAULT_TRACK
  const track = getTrackById(fallbackId) || getTrackById(DEFAULT_TRACK) || MUSIC_LIBRARY[0]
  return { track, locationLabel: "neutral", mood: effectiveMood }
}

const BASE_VOLUME = 0.45

export function DynamicMusic({ location, inCombat = false, mood = "ambient", className }: DynamicMusicProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [enabled, setEnabled] = useState(false) // user must start playback (browser autoplay policy)
  const [muted, setMuted] = useState(false)

  // Location must hydrate from the active session before we choose audio.
  // Until then, selectMusic holds at the neutral dark-ambient default rather
  // than keying off any client-side default (the root cause of village music).
  const selection = selectMusic(location, inCombat, mood)
  const target = selection.track

  const [current, setCurrent] = useState<MusicTrack>(target)

  // Log every resolved selection so future misfires are diagnosable.
  const lastLogged = useRef<string>("")
  useEffect(() => {
    const sig = `${selection.locationLabel}|${selection.mood}|${target.id}`
    if (sig !== lastLogged.current) {
      lastLogged.current = sig
      console.log(
        `[Music] location=${location ?? "(unhydrated)"} pool=${selection.locationLabel} mood=${selection.mood} track=${target.id}`,
      )
    }
  }, [selection.locationLabel, selection.mood, target.id, location])

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
