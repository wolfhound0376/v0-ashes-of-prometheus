"use client"

// The campaign theme — mounted once in the root layout so it survives
// client-side navigation (/intro -> /join -> /forge/builder). Pages find it
// by id and drive it directly; a full page load (or an explicit fade on the
// dashboard) is what finally silences it.

import { useEffect } from "react"
import { isMusicOff, onMusicPrefChange } from "@/lib/audio-prefs"

export const THEME_AUDIO_ID = "aop-theme-audio"

export function getThemeAudio(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null
  return document.getElementById(THEME_AUDIO_ID) as HTMLAudioElement | null
}

/**
 * Start the theme — but only when the player hasn't refused music. This is the
 * ONE place theme playback begins: every call site routes through here instead
 * of touching `.play()` directly, so the "music off" preference can never be
 * bypassed. Returns the play() promise (or a resolved one when suppressed) so
 * callers can still chain `.then/.catch`.
 */
export function playThemeAudio(): Promise<void> {
  if (isMusicOff()) return Promise.resolve()
  const audio = getThemeAudio()
  if (!audio) return Promise.resolve()
  return audio.play()
}

/** Fade the theme out over ~a second, then pause. Safe to call any time. */
export function fadeOutThemeAudio() {
  const audio = getThemeAudio()
  if (!audio || audio.paused) return
  const step = () => {
    if (audio.volume > 0.06) {
      audio.volume = Math.max(0, audio.volume - 0.06)
      window.setTimeout(step, 100)
    } else {
      audio.pause()
    }
  }
  step()
}

/**
 * Keep the theme going on a pre-dashboard page (/join, /awaken, the forge).
 *
 * Sam, 2026-10-14: "intro song only plays on the intro scene. after that, it
 * doesn't play." The theme element survives client navigation, but nothing on
 * the pages after /intro ever asked it to play: if the browser held autoplay
 * back on /intro, or the player arrived at the door directly, or switched
 * music off and on again, the theme stayed paused for good. This hook asks on
 * mount, asks again on the first tap or key (the autoplay rule), and starts
 * it when the preference flips back to on. Nothing here can bypass "music
 * off": every start goes through playThemeAudio().
 */
export function useThemeAudio(volume = 0.55) {
  useEffect(() => {
    const audio = getThemeAudio()
    if (!audio) return
    audio.volume = volume
    const tryTheme = () => {
      if (isMusicOff() || !audio.paused) return
      playThemeAudio().catch(() => {})
    }
    tryTheme()
    window.addEventListener("pointerdown", tryTheme)
    window.addEventListener("keydown", tryTheme)
    const off = onMusicPrefChange(tryTheme)
    return () => {
      window.removeEventListener("pointerdown", tryTheme)
      window.removeEventListener("keydown", tryTheme)
      off()
    }
  }, [volume])
}

export default function ThemeAudio() {
  // When the preference flips to off — from anywhere, this tab or another —
  // silence the theme at once rather than waiting for a navigation.
  useEffect(() => {
    return onMusicPrefChange(() => {
      if (!isMusicOff()) return
      const audio = getThemeAudio()
      if (audio && !audio.paused) audio.pause()
    })
  }, [])

  return <audio id={THEME_AUDIO_ID} src="/audio/forge-creation-theme.mp3" loop preload="auto" />
}
