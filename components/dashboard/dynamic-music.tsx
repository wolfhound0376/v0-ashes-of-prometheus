"use client"

import { useEffect, useRef, useState } from "react"
import { Music, Play, Pause, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import { MUSIC_LIBRARY, getTrackById, type MusicTrack } from "@/lib/music-library"
import {
  isMusicOff,
  setMusicOff,
  onMusicPrefChange,
  isMusicStarted,
  setMusicStarted,
} from "@/lib/audio-prefs"
import {
  resolveMusicFromManifest,
  type ManifestTrack,
  type MusicMood as ManifestMusicMood,
} from "@/lib/media-manifest"
import {
  nextCombatTrackId,
  DEFAULT_COMBAT_TRACK as ROTATION_DEFAULT_COMBAT_TRACK,
} from "@/lib/combat-music-rotation"

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

// Shared combat themes for pools with no location-specific battle track, which
// today is every pool but `village`. The rotation and the shuffle-bag logic
// live in lib/combat-music-rotation.ts so they can be tested without mounting
// this component; see that file for why it is a bag and not a coin flip.
const DEFAULT_COMBAT_TRACK = ROTATION_DEFAULT_COMBAT_TRACK
// Neutral dark-ambient default when the location is unknown or unmapped — never
// a village/tavern track. Fits the Underdark campaign's baseline dread.
const DEFAULT_TRACK = "dungeon-i"
// The camp context has one theme wherever the party beds down (per-biome
// variants can split this later). Combat still overrides it.
const CAMP_TRACK = "camp-embers"

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

export type MusicMood = "ambient" | "tense" | "combat" | "camp"

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
  /**
   * The theme this fight should open with, dealt by nextCombatTrackId. It
   * replaces the shared default only — a pool with its OWN battle track
   * (`village` -> "burning-village") keeps it, because that track was chosen
   * for that place and rotating it away would lose the point of the pool.
   */
  combatTrackId?: string,
): MusicSelection {
  const loc = (location || "").trim()
  const effectiveMood: MusicMood = inCombat ? "combat" : mood

  if (effectiveMood === "camp") {
    const camp = getTrackById(CAMP_TRACK)
    if (camp) return { track: camp, locationLabel: "camp", mood: "camp" }
  }

  if (loc) {
    for (const pool of LOCATION_POOLS) {
      if (pool.match.test(loc)) {
        const trackId =
          effectiveMood === "combat"
            ? pool.combat || pool.base
            : effectiveMood === "tense"
              ? pool.tense || pool.base
              : pool.base
        const chosenId = combatTrackId && trackId === DEFAULT_COMBAT_TRACK ? combatTrackId : trackId
        const track = getTrackById(chosenId) || getTrackById(pool.base) || getTrackById(DEFAULT_TRACK) || MUSIC_LIBRARY[0]
        return { track, locationLabel: pool.label, mood: effectiveMood }
      }
    }
  }

  // No location or no mapped pool → neutral dark-ambient (or shared combat theme).
  const fallbackId =
    effectiveMood === "combat" ? combatTrackId || DEFAULT_COMBAT_TRACK : DEFAULT_TRACK
  const track = getTrackById(fallbackId) || getTrackById(DEFAULT_TRACK) || MUSIC_LIBRARY[0]
  return { track, locationLabel: "neutral", mood: effectiveMood }
}

const BASE_VOLUME = 0.45

/** Minimal shape the audio player needs — shared by manifest + fallback tracks. */
interface PlayableTrack {
  id: string
  name: string
  url: string
}

// Module-level cache so every DynamicMusic mount (and remount) shares a single
// manifest fetch instead of hammering the route.
let manifestPromise: Promise<ManifestTrack[]> | null = null
function loadMusicManifest(): Promise<ManifestTrack[]> {
  if (!manifestPromise) {
    manifestPromise = fetch("/api/media-manifest?kind=music")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => (Array.isArray(j.items) ? (j.items as ManifestTrack[]) : []))
      .catch(() => [])
  }
  return manifestPromise
}

export function DynamicMusic({ location, inCombat = false, mood = "ambient", className }: DynamicMusicProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  // Starts false so SSR and first paint agree, then hydrates from the
  // remembered consent below. A browser will not start audio without a
  // gesture, so this can never simply default to true.
  const [enabled, setEnabled] = useState(false)
  const gestureRetry = useRef<(() => void) | null>(null)

  // Did this listener already press play, on this or any earlier page?
  useEffect(() => {
    if (isMusicStarted()) setEnabled(true)
  }, [])
  // Mute is the shared "music off" preference: muting here is remembered across
  // pages and reloads, and suppresses the intro theme on the next visit.
  // Starts false so SSR and first paint agree, then hydrates from the pref.
  const [muted, setMuted] = useState(false)
  useEffect(() => {
    setMuted(isMusicOff())
    return onMusicPrefChange(() => setMuted(isMusicOff()))
  }, [])

  // Combat auto-start: the beginning of a fight is the one moment the table
  // should never have to reach for the play button. When combat begins (or the
  // player mounts mid-fight) and playback is idle, start it — unless the
  // listener has music switched off, which always wins. The ref arms once per
  // fight: pausing mid-combat is respected until the next one begins.
  // Each fight also deals a fresh theme from the shuffle bag, so no two fights
  // in a row sound the same. State (not a ref) so the re-render recomputes the
  // selection with the new pick.
  const [combatTrackId, setCombatTrackId] = useState<string | undefined>(undefined)
  const prevCombat = useRef(false)
  useEffect(() => {
    if (inCombat && !prevCombat.current) {
      prevCombat.current = true
      setCombatTrackId(nextCombatTrackId())
      if (!enabled && !isMusicOff()) {
        setEnabled(true)
        setMusicStarted(true)
      }
    } else if (!inCombat) {
      prevCombat.current = false
    }
  }, [inCombat, enabled])

  // Location must hydrate from the active session before we choose audio.
  // Until then, selectMusic holds at the neutral dark-ambient default rather
  // than keying off any client-side default (the root cause of village music).
  // Load the data-driven manifest once (module-cached, shared across mounts).
  const [manifest, setManifest] = useState<ManifestTrack[]>([])
  useEffect(() => {
    let alive = true
    loadMusicManifest().then((items) => {
      if (alive) setManifest(items)
    })
    return () => {
      alive = false
    }
  }, [])

  // Prefer the manifest; fall back to the hardcoded MUSIC_LIBRARY when the
  // manifest is empty (not migrated/seeded yet) or yields no usable track.
  const manifestSelection = resolveMusicFromManifest(
    manifest,
    location,
    inCombat,
    mood as ManifestMusicMood,
  )
  const fallbackSelection = selectMusic(location, inCombat, mood, combatTrackId)

  const selectionLabel = manifestSelection ? manifestSelection.poolLabel : fallbackSelection.locationLabel
  const selectionMood = manifestSelection ? manifestSelection.mood : fallbackSelection.mood
  const selectionSource = manifestSelection ? "manifest" : "library"
  const target: PlayableTrack = manifestSelection
    ? {
        id: manifestSelection.track.id,
        name: manifestSelection.track.name,
        url: manifestSelection.track.url,
      }
    : {
        id: fallbackSelection.track.id,
        name: fallbackSelection.track.name,
        url: fallbackSelection.track.url,
      }

  const [current, setCurrent] = useState<PlayableTrack>(target)

  // Log every resolved selection so future misfires are diagnosable.
  const lastLogged = useRef<string>("")
  useEffect(() => {
    const sig = `${selectionSource}|${selectionLabel}|${selectionMood}|${target.id}`
    if (sig !== lastLogged.current) {
      lastLogged.current = sig
      console.log(
        `[Music] source=${selectionSource} location=${location ?? "(unhydrated)"} pool=${selectionLabel} mood=${selectionMood} track=${target.id}`,
      )
    }
  }, [selectionSource, selectionLabel, selectionMood, target.id, location])

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
        // Autoplay blocked. This is the restored-consent path: the listener
        // DID press play, just not on this page, so the browser has no gesture
        // here yet. Reverting the toggle would throw that consent away and put
        // us back to a silent fight. Wait for the first click or keypress
        // anywhere — on the board that is immediate — and start then.
        detachGesture()
        const retry = () => {
          // Whichever event fired, drop BOTH: `once` only removes the one
          // that ran, and the survivor would outlive the component.
          document.removeEventListener("pointerdown", retry)
          document.removeEventListener("keydown", retry)
          gestureRetry.current = null
          const el = audioRef.current
          if (!el) return
          el.play().then(() => fade(muted ? 0 : BASE_VOLUME, 600)).catch(() => {})
        }
        gestureRetry.current = retry
        document.addEventListener("pointerdown", retry, { once: true })
        document.addEventListener("keydown", retry, { once: true })
      })
    } else {
      detachGesture()
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

  function detachGesture() {
    const retry = gestureRetry.current
    if (!retry) return
    gestureRetry.current = null
    document.removeEventListener("pointerdown", retry)
    document.removeEventListener("keydown", retry)
  }

  useEffect(() => {
    return () => {
      if (fadeTimer.current) clearInterval(fadeTimer.current)
      detachGesture()
      // Leaving the page must actually silence it. Removing a media element
      // from the document is *specified* to pause it, but only after the
      // browser reaches a stable state — and a route change (/battle back to
      // the dashboard) mounts the next page's player before that lands, so the
      // old combat track can keep playing over the new page's ambient one for
      // a second or more. Pausing here is immediate and unconditional.
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        // Drop the source too, or the element can be left buffering a track
        // nobody is listening to.
        audio.removeAttribute("src")
        audio.load()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    // bottom-16 (not bottom-4) so the ambient controls float clear of the
    // status bar — at bottom-4 this sat directly on top of Export Campaign.
    <div className={cn("fixed bottom-16 right-20 z-50 flex items-center", className)}>
      <audio ref={audioRef} loop preload="none" />
      <div className="flex items-center gap-1 rounded-full bg-[#1a1614] border-2 border-[#3d3428] shadow-lg shadow-black/50 pl-1 pr-2 py-1">
        {/* Play / pause */}
        <button
          onClick={() => {
            const next = !enabled
            setEnabled(next)
            // Remember it, so the next page — /battle, most of all — starts
            // on its own instead of waiting to be asked again.
            setMusicStarted(next)
          }}
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
          onClick={() => setMusicOff(!muted)}
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
