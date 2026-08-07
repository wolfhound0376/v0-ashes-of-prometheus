"use client"

// The campaign theme — mounted once in the root layout so it survives
// client-side navigation (/intro -> /join -> /forge/builder). Pages find it
// by id and drive it directly; a full page load (or an explicit fade on the
// dashboard) is what finally silences it.

export const THEME_AUDIO_ID = "aop-theme-audio"

export function getThemeAudio(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null
  return document.getElementById(THEME_AUDIO_ID) as HTMLAudioElement | null
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

export default function ThemeAudio() {
  return <audio id={THEME_AUDIO_ID} src="/audio/forge-creation-theme.mp3" loop preload="auto" />
}
